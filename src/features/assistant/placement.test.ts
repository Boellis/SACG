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
  it("puts a turn's proposals after the assistant's closing message for that turn", () => {
    n = 0;
    const user = msg('user_text');
    const proposing = msg('assistant', [toolUse('toolu_1'), toolUse('toolu_2')]);
    const results = msg('tool_results');
    const closing = msg('assistant', [textBlock("Here's the plan")]);
    const a1 = action('a1', 'toolu_1');
    const a2 = action('a2', 'toolu_2');

    const { after, unplaced } = placeActions([user, proposing, results, closing], [a1, a2]);

    expect(after.get(closing.id)).toEqual([a1, a2]);
    expect(after.has(proposing.id)).toBe(false);
    expect(unplaced).toEqual([]);
  });

  it('keeps each turn separate and ignores approval notes between turns', () => {
    n = 0;
    const turn1 = [msg('user_text'), msg('assistant', [toolUse('toolu_1')]), msg('tool_results'), msg('assistant', [textBlock('one')])];
    const note = msg('app_note');
    const turn2 = [msg('user_text'), msg('assistant', [toolUse('toolu_2')]), msg('tool_results'), msg('assistant', [textBlock('two')])];
    const a1 = action('a1', 'toolu_1');
    const a2 = action('a2', 'toolu_2');

    const { after } = placeActions([...turn1, note, ...turn2], [a1, a2]);

    expect(after.get(turn1[3].id)).toEqual([a1]);
    expect(after.get(turn2[3].id)).toEqual([a2]);
  });

  it('falls back to the proposing message while the turn is still running', () => {
    n = 0;
    const user = msg('user_text');
    const proposing = msg('assistant', [toolUse('toolu_1')]);
    const a1 = action('a1', 'toolu_1');

    expect(placeActions([user, proposing], [a1]).after.get(proposing.id)).toEqual([a1]);
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
