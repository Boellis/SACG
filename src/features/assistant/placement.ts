import type { AssistantAction, AssistantMessage } from './types';

/**
 * The `tool_use` block ids inside a message's `raw` Anthropic content (a JSON
 * array of blocks, or an object wrapping one as `content`). Anything else
 * yields no ids: the page then shows the proposal at the end instead.
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
  /** Message id → the proposals to show right after that message, in creation order. */
  after: Map<string, AssistantAction[]>;
  /** Proposals that match no message (still loading, or unreadable `raw`). */
  unplaced: AssistantAction[];
}

/**
 * Decide where each proposal appears in the chat. The model proposes in the
 * middle of a turn and then writes its wrap-up ("Here's the plan…"), so a
 * proposal goes after the *last* assistant message of the turn it came from
 * (up to the next `user_text`), which keeps "text, then the cards it describes"
 * in reading order. While the turn is still running, that is the proposing
 * message itself.
 */
export function placeActions(messages: AssistantMessage[], actions: AssistantAction[]): ActionPlacement {
  const indexByToolUse = new Map<string, number>();
  messages.forEach((m, i) => {
    if (m.kind !== 'assistant') return;
    for (const id of toolUseIds(m.raw)) indexByToolUse.set(id, i);
  });

  const after = new Map<string, AssistantAction[]>();
  const unplaced: AssistantAction[] = [];
  for (const action of actions) {
    const from = indexByToolUse.get(action.toolUseId);
    if (from === undefined) {
      unplaced.push(action);
      continue;
    }
    let last = from;
    for (let j = from + 1; j < messages.length && messages[j].kind !== 'user_text'; j++) {
      if (messages[j].kind === 'assistant') last = j;
    }
    const anchor = messages[last].id;
    after.set(anchor, [...(after.get(anchor) ?? []), action]);
  }
  return { after, unplaced };
}
