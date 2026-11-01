import { describe, it, expect } from 'vitest';
import { placeActions, toolUseIds } from './placement';
import type { AssistantAction, AssistantMessage, MessageKind } from './types';

const toolUse = (id: string) => ({ type: 'tool_use', id, name: 'propose_calendar_event', input: {} });
const textBlock = (text: string) => ({ type: 'text', text });

let n = 0;
function msg(kind: MessageKind, raw: unknown = [], over: Partial<AssistantMessage> = {}): AssistantMessage {
  n += 1;
  return {
    id: String(n).padStart(6, '0'),
    seq: n,
    role: kind === 'assistant' ? 'assistant' : 'user',
    kind,
    raw: typeof raw === 'string' ? raw : JSON.stringify(raw),
    display: { text: kind },
    ...over,
  };
}

const action = (id: string, toolUseId: string): AssistantAction =>
  ({
    id,
    type: 'create_event',
    summary: `Summary ${id}`,
    status: 'proposed',
    toolUseId,
    input: { title: 'T', type: 'meeting', start: '2026-11-07T09:00', end: '2026-11-07T10:00', allDay: false },
  }) as AssistantAction;

describe('toolUseIds', () => {
  it('lists the tool_use block ids of an assistant message', () => {
    expect(toolUseIds(JSON.stringify([textBlock('hi'), toolUse('toolu_1'), toolUse('toolu_2')]))).toEqual([
      'toolu_1',
      'toolu_2',
    ]);
  });

  it('copes with bad or unexpected JSON', () => {
    expect(toolUseIds('not json')).toEqual([]);
    expect(toolUseIds('"just text"')).toEqual([]);
    expect(toolUseIds('null')).toEqual([]);
    expect(toolUseIds(JSON.stringify([null, 3, { type: 'tool_use' }, { type: 'text', text: 'x' }]))).toEqual([]);
  });

  it('also reads a {content: [...]} wrapper', () => {
    expect(toolUseIds(JSON.stringify({ role: 'assistant', content: [toolUse('toolu_9')] }))).toEqual(['toolu_9']);
  });
});

describe('placeActions', () => {
  it('puts a proposal right after the assistant message that made it, not after the turn\'s closing message', () => {
    n = 0;
    const user = msg('user_text');
    const proposing = msg('assistant', [toolUse('toolu_1'), toolUse('toolu_2')]);
    const results = msg('tool_results');
    const closing = msg('assistant', [textBlock("Here's the plan")]);
    const a1 = action('a1', 'toolu_1');
    const a2 = action('a2', 'toolu_2');

    const { after, unplaced } = placeActions([user, proposing, results, closing], [a1, a2]);

    expect(after.get(proposing.id)).toEqual([a1, a2]);
    expect(after.has(closing.id)).toBe(false);
    expect(unplaced).toEqual([]);
  });

  it('gives each proposal the message that made it, across calls and turns', () => {
    n = 0;
    const first = msg('assistant', [toolUse('toolu_1')]);
    const second = msg('assistant', [toolUse('toolu_2')]); // a later tool call in the same turn
    const later = msg('assistant', [toolUse('toolu_3')]); // a follow-up turn
    const messages = [
      msg('user_text'),
      first,
      msg('tool_results'),
      second,
      msg('tool_results'),
      msg('assistant', [textBlock('plan')]),
      msg('app_note'),
      msg('user_text'),
      later,
    ];
    const [a1, a2, a3] = [action('a1', 'toolu_1'), action('a2', 'toolu_2'), action('a3', 'toolu_3')];

    const { after } = placeActions(messages, [a1, a2, a3]);

    expect(after.get(first.id)).toEqual([a1]);
    expect(after.get(second.id)).toEqual([a2]);
    expect(after.get(later.id)).toEqual([a3]);
  });

  it('never moves a proposal as later messages arrive', () => {
    n = 0;
    const all = [
      msg('user_text'),
      msg('assistant', [toolUse('toolu_1')]), // <- made the proposal
      msg('tool_results'),
      msg('assistant', [textBlock('plan')]),
      msg('app_note'),
      msg('user_text'),
      msg('assistant', [textBlock('anything else?')]),
    ];
    const a1 = action('a1', 'toolu_1');

    // Replay the conversation arriving one message at a time (from the moment the proposing message exists).
    for (let upTo = 2; upTo <= all.length; upTo++) {
      const { after, unplaced } = placeActions(all.slice(0, upTo), [a1]);
      expect([...after.keys()]).toEqual([all[1].id]);
      expect(unplaced).toEqual([]);
    }
  });

  it("keeps the model's order of tool calls within one message, whatever order the proposals were stored in", () => {
    n = 0;
    const proposing = msg('assistant', [toolUse('toolu_1'), toolUse('toolu_2'), toolUse('toolu_3')]);
    const [a1, a2, a3] = [action('a1', 'toolu_1'), action('a2', 'toolu_2'), action('a3', 'toolu_3')];

    const { after } = placeActions([msg('user_text'), proposing], [a3, a1, a2]);

    expect(after.get(proposing.id)?.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('leaves proposals it cannot place (unknown tool id, bad raw JSON) at the end', () => {
    n = 0;
    const messages = [msg('user_text'), msg('assistant', 'garbage'), msg('assistant', [textBlock('hi')])];
    const stray = action('a1', 'toolu_unknown');

    const { after, unplaced } = placeActions(messages, [stray]);

    expect(after.size).toBe(0);
    expect(unplaced).toEqual([stray]);
  });

  it('treats every action as unplaced when there are no messages', () => {
    const a1 = action('a1', 'toolu_1');
    expect(placeActions([], [a1]).unplaced).toEqual([a1]);
  });
});
