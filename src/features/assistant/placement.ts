import type { AssistantAction, AssistantMessage } from './types';

/**
 * The `tool_use` block ids inside a message's `raw` Anthropic content (a JSON
 * array of blocks, or an object wrapping one as `content`), in the order the
 * model made the calls. Anything else yields no ids: the page then shows the
 * proposal at the end instead.
 */
export function toolUseIds(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const blocks =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { content?: unknown }).content : parsed;
  if (!Array.isArray(blocks)) return [];
  const ids: string[] = [];
  for (const block of blocks) {
    if (block && typeof block === 'object') {
      const { type, id } = block as { type?: unknown; id?: unknown };
      if (type === 'tool_use' && typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

export interface ActionPlacement {
  /** Message id → the proposals that message made, to show right after it, in the order it made them. */
  after: Map<string, AssistantAction[]>;
  /** Proposals whose message isn't there (yet), or can't be read. */
  unplaced: AssistantAction[];
}

/**
 * Decide where each proposal appears in the chat: right after the assistant
 * message that made it (the one holding the `tool_use` block its action came
 * from). That message never changes once it exists, so a proposal stays put as
 * the rest of the turn and later turns arrive; only a proposal that shows up
 * before its message (the listeners aren't ordered) starts at the end and then
 * takes its place. Proposals from one message keep the model's order of calls,
 * whatever order their documents were created in.
 */
export function placeActions(messages: AssistantMessage[], actions: AssistantAction[]): ActionPlacement {
  // Which message made each tool call, and where it came in that message's calls.
  const madeBy = new Map<string, { messageId: string; order: number }>();
  for (const message of messages) {
    if (message.kind !== 'assistant') continue;
    toolUseIds(message.raw).forEach((id, order) => madeBy.set(id, { messageId: message.id, order }));
  }

  const grouped = new Map<string, Array<{ action: AssistantAction; order: number }>>();
  const unplaced: AssistantAction[] = [];
  for (const action of actions) {
    const made = madeBy.get(action.toolUseId);
    if (!made) {
      unplaced.push(action);
      continue;
    }
    grouped.set(made.messageId, [...(grouped.get(made.messageId) ?? []), { action, order: made.order }]);
  }

  const after = new Map<string, AssistantAction[]>();
  for (const [messageId, list] of grouped) {
    after.set(
      messageId,
      [...list].sort((a, b) => a.order - b.order).map((entry) => entry.action),
    );
  }
  return { after, unplaced };
}
