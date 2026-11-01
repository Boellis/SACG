import Anthropic, { APIError, AuthenticationError, RateLimitError } from '@anthropic-ai/sdk';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { REGION } from '../config';
import { DocIdSchema } from '../email/audience';
import { requireAdmin } from '../lib/auth';
import { withPublicErrors } from '../lib/publicErrors';
import { executeAction, rejectAction } from './actions';
import { getAnthropicApiKey } from './apiKey';
import { MAX_MESSAGE_CHARS } from './config';
import { finishTurn, startTurn } from './history';
import { runTurn, type CreateMessage } from './loop';
import { consumeTurn } from './usage';

export const NOT_SET_UP =
  "AI assistant isn't set up yet. Brandon needs to add the Anthropic API key in Google Cloud Secret Manager (ANTHROPIC_API_KEY).";

const ChatInput = z
  .object({
    threadId: DocIdSchema.optional(),
    message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  })
  .strict();

/** What a chat turn needs from the outside world (injected by tests). */
export interface ChatDeps {
  getApiKey: () => Promise<string | null>;
  createMessageFor: (apiKey: string) => CreateMessage;
  now?: () => Date;
}

const defaultChatDeps: ChatDeps = {
  getApiKey: () => getAnthropicApiKey(),
  createMessageFor: (apiKey) => {
    const client = new Anthropic({ apiKey });
    return (params) => client.beta.messages.create(params);
  },
};

/** Anthropic API failures as answers the admin can act on. */
function fromAnthropic(err: unknown): unknown {
  if (!(err instanceof APIError)) return err;
  logger.error('assistantChat: Anthropic API error', { status: err.status, type: err.type, message: err.message });
  if (err instanceof AuthenticationError) {
    return new HttpsError(
      'failed-precondition',
      'The Anthropic API key was rejected. Brandon needs to check ANTHROPIC_API_KEY in Google Cloud Secret Manager.',
    );
  }
  if (err instanceof RateLimitError) {
    return new HttpsError('resource-exhausted', 'The AI service is busy right now. Wait a minute, then send your message again.');
  }
  return new HttpsError('unavailable', "The AI service didn't answer. Please try again in a minute.");
}

/**
 * One assistant turn for a signed-in admin: `{threadId?, message}` →
 * `{threadId, reply, actionIds, usage}`. The admin check comes first, before the
 * input is even read. History lives server-side; the client only ever sends text.
 */
export async function handleAssistantChat(
  db: Firestore,
  auth: { uid: string } | undefined,
  data: unknown,
  deps: ChatDeps = defaultChatDeps,
) {
  const caller = await requireAdmin(db, auth);
  const parsed = ChatInput.safeParse(data);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === 'message' && i.code === 'too_big');
    throw new HttpsError(
      'invalid-argument',
      tooLong ? `Messages can be up to ${MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters.` : "That message isn't valid.",
    );
  }
  const { threadId: requested, message } = parsed.data;
  const apiKey = await deps.getApiKey();
  if (!apiKey) throw new HttpsError('failed-precondition', NOT_SET_UP);
  const now = deps.now ?? (() => new Date());
  const usage = await consumeTurn(db, caller.uid, now());
  const threadId = await startTurn(db, { threadId: requested, caller, message, now: now() });

  let reply: string | undefined;
  try {
    const turn = await runTurn({ db, createMessage: deps.createMessageFor(apiKey), now }, { threadId, caller, userText: message });
    reply = turn.reply;
    return { threadId, reply: turn.reply, actionIds: turn.actionIds, usage };
  } catch (err) {
    throw fromAnthropic(err);
  } finally {
    await finishTurn(db, threadId, reply).catch((err) =>
      logger.error('assistantChat: could not finish the turn', { threadId, error: String(err) }),
    );
  }
}

/** Admin-only: one message to the assistant (Claude tool-use loop; proposals only). */
export const assistantChat = onCall({ region: REGION, timeoutSeconds: 300, memory: '512MiB' }, (request) =>
  withPublicErrors('assistantChat', () => handleAssistantChat(getFirestore(), request.auth, request.data)),
);

const ExecuteInput = z
  .object({
    threadId: DocIdSchema,
    actionId: DocIdSchema,
    mode: z.enum(['run', 'test']),
    overrides: z.record(z.string(), z.unknown()).optional(),
    testMemberId: DocIdSchema.optional(),
  })
  .strict();

const RejectInput = z.object({ threadId: DocIdSchema, actionId: DocIdSchema }).strict();

/** Admin-only: approve a proposal (`run`), or test-send a proposed email to one member (`test`). */
export const assistantExecuteAction = onCall({ region: REGION, timeoutSeconds: 60 }, (request) =>
  withPublicErrors('assistantExecuteAction', async () => {
    const db = getFirestore();
    const caller = await requireAdmin(db, request.auth);
    const parsed = ExecuteInput.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', "That approval request isn't valid.");
    return executeAction(db, { ...parsed.data, caller });
  }),
);

/** Admin-only: reject a proposal. */
export const assistantRejectAction = onCall({ region: REGION }, (request) =>
  withPublicErrors('assistantRejectAction', async () => {
    const db = getFirestore();
    const caller = await requireAdmin(db, request.auth);
    const parsed = RejectInput.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', "That request isn't valid.");
    return rejectAction(db, { ...parsed.data, caller });
  }),
);
