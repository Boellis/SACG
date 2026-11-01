import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AdminCaller } from '../lib/auth';
import { ProposalError, recordProposal } from './actions';
import { EFFORT, FALLBACK_BETA, MAX_TOKENS, MAX_TOOL_ITERATIONS, MODEL } from './config';
import { appendMessage, loadHistory } from './history';
import { SYSTEM_PROMPT, turnContext } from './prompt';
import { runReadTool } from './readTools';
import { ACTION_SCHEMAS, describeIssues } from './schemas';
import { PROPOSE_TOOL_ACTION, READ_TOOLS, TOOL_DEFINITIONS, TOOL_LABELS } from './tools';

/** Per-call limits: `timeout` per attempt, one retry, and a signal that ends the whole call (retries included). */
export interface ModelCallOptions {
  timeout: number;
  maxRetries: number;
  signal: AbortSignal;
}

/** One non-streaming Messages API call (the beta endpoint, for server-side fallbacks). */
export type CreateMessage = (params: MessageCreateParamsNonStreaming, options?: ModelCallOptions) => Promise<BetaMessage>;

export const REFUSAL_REPLY = "I can't help with that one. Try rephrasing, or ask Brandon.";
const TRUNCATED_NOTE = '(My reply got cut off because it ran too long. Ask me to continue, or to keep it shorter.)';
const PAUSED_NOTE = '(I paused here to stay within my limits for one message. Say "continue" and I\'ll pick up where I left off.)';

/**
 * No new model call starts after this much of a turn has passed, so the turn
 * ends with a reply instead of hitting assistantChat's 300 s timeout.
 */
export const TURN_TIME_BUDGET_MS = 210_000;
/**
 * No model call runs past this point of a turn (the SDK's default would be a
 * 10-minute timeout with 2 retries): each call gets what is left as its
 * timeout and as an abort signal, leaving room for the last tool results,
 * writes and finishTurn inside the 300 s function timeout.
 */
export const TURN_DEADLINE_MS = 270_000;

const Summary = z.string().trim().min(1).max(300);

/** The request for the next step of a turn. Everything but `messages` is fixed, so the prefix caches. */
export function buildRequest(messages: BetaMessageParam[]): MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Explicit breakpoint on the static prefix (tools + system), plus automatic
    // caching of the growing conversation tail.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    cache_control: { type: 'ephemeral' },
    tools: TOOL_DEFINITIONS,
    messages,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  };
}

const isToolUse = (b: BetaContentBlock): b is BetaToolUseBlock => b.type === 'tool_use';
// Own keys only: a model-chosen name like "constructor" must not match Object.prototype.
const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);
const labelOf = (name: string) => (has(TOOL_LABELS, name) ? TOOL_LABELS[name] : name);
const textOf = (content: BetaContentBlock[]) =>
  content
    .filter((b): b is Extract<BetaContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n');
const withNote = (text: string, note: string) => (text ? `${text}\n\n${note}` : note);

/** What the admin sees when the model ends its turn without writing anything. */
function emptyReply(proposals: number): string {
  if (proposals === 0) return "I didn't write a reply that time. Try asking again, or put it another way.";
  const what = proposals === 1 ? 'a proposal' : `${proposals} proposals`;
  return `I saved ${what} for you to review below. Nothing has been sent or changed yet.`;
}

const result = (id: string, content: string, isError = false): BetaToolResultBlockParam => ({
  type: 'tool_result',
  tool_use_id: id,
  content,
  ...(isError ? { is_error: true } : {}),
});

const isErrorJson = (text: string) => {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && 'error' in parsed;
  } catch {
    return false;
  }
};

interface ToolContext {
  db: Firestore;
  threadId: string;
  caller: AdminCaller;
  now: Date;
}

/** Validate a propose_* call and save it as a proposal. Nothing is executed. */
async function propose(ctx: ToolContext, block: BetaToolUseBlock): Promise<{ result: BetaToolResultBlockParam; actionId?: string }> {
  const type = PROPOSE_TOOL_ACTION[block.name];
  const { summary, ...input } =
    block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : ({} as Record<string, unknown>);
  const parsedInput = ACTION_SCHEMAS[type].safeParse(input);
  const parsedSummary = Summary.safeParse(summary);
  if (!parsedInput.success || !parsedSummary.success) {
    const issues = [
      ...(parsedInput.success ? [] : [describeIssues(parsedInput.error)]),
      ...(parsedSummary.success ? [] : [`summary: ${parsedSummary.error.issues[0].message}`]),
    ].join('; ');
    return { result: result(block.id, `Nothing was saved: that ${block.name} input isn't valid (${issues}). Fix it and call ${block.name} again.`, true) };
  }
  const actionId = await recordProposal(ctx.db, ctx.threadId, {
    type,
    input: parsedInput.data,
    summary: parsedSummary.data,
    toolUseId: block.id,
  });
  return {
    result: result(
      block.id,
      `Proposal saved as action ${actionId}. Nothing has been sent or changed yet. An admin must approve it in the app.`,
    ),
    actionId,
  };
}

/** Run one tool call. Every call gets a result, even on failure, so the history stays well-formed. */
async function runTool(ctx: ToolContext, block: BetaToolUseBlock): Promise<{ result: BetaToolResultBlockParam; actionId?: string }> {
  try {
    if (READ_TOOLS.has(block.name)) {
      const text = await runReadTool(ctx.db, block.name, block.input, { caller: ctx.caller, now: ctx.now });
      return { result: result(block.id, text, isErrorJson(text)) };
    }
    if (has(PROPOSE_TOOL_ACTION, block.name)) return await propose(ctx, block);
    return { result: result(block.id, `There is no tool called ${block.name}.`, true) };
  } catch (err) {
    if (err instanceof ProposalError) return { result: result(block.id, `Nothing was saved: ${err.message}`, true) };
    logger.error(`assistant tool ${block.name} failed`, { threadId: ctx.threadId, error: String(err) });
    return { result: result(block.id, 'That tool failed unexpectedly, so nothing was done. You can try it again.', true) };
  }
}

/**
 * One admin turn. Stores the admin's message (with the per-turn app context),
 * then loops: send the stored history to the model, store its reply verbatim,
 * run any tool calls (read tools answer at once; propose tools only record
 * proposals), and store all their results as one message. Ends when the model
 * stops calling tools, refuses, runs out of tokens, or the turn hits its step
 * or time limit. The reply is the text of the last assistant message.
 */
export async function runTurn(
  deps: { db: Firestore; createMessage: CreateMessage; now?: () => Date },
  args: { threadId: string; caller: AdminCaller; userText: string; turnToken?: string },
): Promise<{ reply: string; actionIds: string[] }> {
  const { db, createMessage } = deps;
  const now = deps.now ?? (() => new Date());
  const { threadId, caller, userText, turnToken } = args;
  const startedAt = now().getTime();
  // Every write of this turn is fenced by its token (see appendMessage).
  const append = (entry: Parameters<typeof appendMessage>[2]) => appendMessage(db, threadId, entry, turnToken);

  await append({
    role: 'user',
    kind: 'user_text',
    content: [{ type: 'text', text: `${turnContext({ caller, now: now() })}\n\n${userText}` }],
    display: { text: userText },
    authorUid: caller.uid,
    authorName: caller.displayName,
  });

  const actionIds: string[] = [];
  let reply = '';
  for (let step = 0; step < MAX_TOOL_ITERATIONS; step++) {
    const elapsed = now().getTime() - startedAt;
    if (step > 0 && elapsed >= TURN_TIME_BUDGET_MS) return { reply: withNote(reply, PAUSED_NOTE), actionIds };
    const remaining = Math.max(1_000, TURN_DEADLINE_MS - elapsed);

    const response = await createMessage(buildRequest(await loadHistory(db, threadId)), {
      timeout: remaining,
      maxRetries: 1,
      signal: AbortSignal.timeout(remaining),
    });

    if (response.stop_reason === 'refusal') {
      // A refused reply may be empty or cut off, so it can't be replayed; the
      // friendly reply takes its place in the history.
      await append({
        role: 'assistant',
        kind: 'assistant',
        content: [{ type: 'text', text: REFUSAL_REPLY }],
        display: { text: REFUSAL_REPLY },
      });
      return { reply: REFUSAL_REPLY, actionIds };
    }

    const toolUses = response.content.filter(isToolUse);
    // A final message with no text still gets a reply. Empty content can't be
    // replayed (the API rejects an empty message mid-history), so it is stored
    // as that reply, like a refusal; any other content is stored verbatim.
    reply = textOf(response.content) || (toolUses.length === 0 ? emptyReply(actionIds.length) : '');
    await append({
      role: 'assistant',
      kind: 'assistant',
      content: response.content.length > 0 ? response.content : [{ type: 'text', text: reply }],
      display: { text: reply, tools: toolUses.map((t) => ({ name: t.name, label: labelOf(t.name) })) },
    });

    const truncated = response.stop_reason === 'max_tokens';
    if (toolUses.length === 0) return { reply: truncated ? withNote(reply, TRUNCATED_NOTE) : reply, actionIds };

    const results: BetaToolResultBlockParam[] = [];
    for (const block of toolUses) {
      if (truncated) {
        // A tool call cut off at max_tokens has incomplete input: never run it.
        results.push(result(block.id, 'Your reply was cut off before this call was complete, so it was not run.', true));
        continue;
      }
      const ran = await runTool({ db, threadId, caller, now: now() }, block);
      results.push(ran.result);
      if (ran.actionId) actionIds.push(ran.actionId);
    }
    await append({
      role: 'user',
      kind: 'tool_results',
      content: results,
      display: { text: `${results.length} tool result${results.length === 1 ? '' : 's'}` },
    });
    if (truncated) return { reply: withNote(reply, TRUNCATED_NOTE), actionIds };
  }
  return { reply: withNote(reply, PAUSED_NOTE), actionIds };
}
