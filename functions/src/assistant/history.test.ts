import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { testDb, clearFirestore } from '../testing/emulator';
import type { AdminCaller } from '../lib/auth';
import {
  appendMessage,
  finishTurn,
  loadHistory,
  startTurn,
  StaleTurnError,
  toApiMessages,
  TURN_LEASE_MS,
  type StoredEntry,
} from './history';

const db = testDb();
const caller: AdminCaller = { uid: 'admin1', displayName: 'Brandon Ellis', email: 'brandon@example.com' };
const NOW = new Date('2026-11-01T15:00:00Z');
const thread = 'T1';

const userText = (t: string) => ({
  role: 'user' as const,
  kind: 'user_text' as const,
  content: [{ type: 'text', text: t }],
  display: { text: t },
});
const toolUse = (id: string) => ({ type: 'tool_use', id, name: 'list_events', input: { from: '2026-11-01', to: '2026-11-30' } });
const toolResult = (id: string) => ({ type: 'tool_result', tool_use_id: id, content: '{"events":[]}' });

beforeEach(async () => {
  await clearFirestore();
  await db.doc(`assistantThreads/${thread}`).set({ title: 'Nov 7', messageCount: 0 });
});

describe('appendMessage', () => {
  it('stores messages under zero-padded seq ids with raw JSON content and display', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig-abc' },
      { type: 'text', text: 'Checking.' },
    ];
    expect(await appendMessage(db, thread, { ...userText('Hi'), authorUid: 'admin1', authorName: 'Brandon Ellis' })).toBe(0);
    expect(
      await appendMessage(db, thread, { role: 'assistant', kind: 'assistant', content, display: { text: 'Checking.' } }),
    ).toBe(1);
    const first = (await db.doc(`assistantThreads/${thread}/messages/000000`).get()).data()!;
    expect(first).toMatchObject({
      seq: 0,
      role: 'user',
      kind: 'user_text',
      display: { text: 'Hi' },
      authorUid: 'admin1',
      authorName: 'Brandon Ellis',
    });
    expect(first.createdAt).toBeInstanceOf(Timestamp);
    const second = (await db.doc(`assistantThreads/${thread}/messages/000001`).get()).data()!;
    expect(JSON.parse(second.raw)).toEqual(content);
    expect(second).not.toHaveProperty('authorUid');
    expect((await db.doc(`assistantThreads/${thread}`).get()).get('messageCount')).toBe(2);
  });

  it('gives concurrent appends distinct, gap-free seqs', async () => {
    const seqs = await Promise.all([1, 2, 3, 4, 5].map((n) => appendMessage(db, thread, userText(`m${n}`))));
    expect([...seqs].sort()).toEqual([0, 1, 2, 3, 4]);
    expect((await db.collection(`assistantThreads/${thread}/messages`).get()).size).toBe(5);
  });

  it('refuses to append to a thread that does not exist', async () => {
    await expect(appendMessage(db, 'NOPE', userText('Hi'))).rejects.toThrow();
  });
});

describe('loadHistory', () => {
  it('replays stored content in seq order, exactly as stored', async () => {
    const assistant = [
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'text', text: 'Let me look.', citations: null },
      toolUse('tu_1'),
    ];
    await appendMessage(db, thread, userText('When is the meeting?'));
    await appendMessage(db, thread, { role: 'assistant', kind: 'assistant', content: assistant, display: { text: '' } });
    await appendMessage(db, thread, { role: 'user', kind: 'tool_results', content: [toolResult('tu_1')], display: { text: '' } });
    expect(await loadHistory(db, thread)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'When is the meeting?' }] },
      { role: 'assistant', content: assistant },
      { role: 'user', content: [toolResult('tu_1')] },
    ]);
  });
});

describe('toApiMessages', () => {
  const note = (t: string): StoredEntry => ({ role: 'user', kind: 'app_note', content: [{ type: 'text', text: t }] });
  const u = (t: string): StoredEntry => ({ role: 'user', kind: 'user_text', content: [{ type: 'text', text: t }] });
  const a = (...content: unknown[]): StoredEntry => ({ role: 'assistant', kind: 'assistant', content });
  const r = (...ids: string[]): StoredEntry => ({ role: 'user', kind: 'tool_results', content: ids.map(toolResult) });

  it('replays app notes just before the next admin message, never between a tool call and its result', () => {
    const out = toApiMessages([u('Q1'), a(toolUse('tu_1')), note('[App update] approved'), r('tu_1'), a({ type: 'text', text: 'Done' }), u('Q2')]);
    expect(out.map((m) => m.content)).toEqual([
      [{ type: 'text', text: 'Q1' }],
      [toolUse('tu_1')],
      [toolResult('tu_1')],
      [{ type: 'text', text: 'Done' }],
      [{ type: 'text', text: '[App update] approved' }],
      [{ type: 'text', text: 'Q2' }],
    ]);
  });

  it('holds back notes that no admin message follows yet, so a reply in progress keeps its prefix', () => {
    const out = toApiMessages([u('Q1'), a(toolUse('tu_1')), r('tu_1'), note('[App update] approved')]);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1].content).toEqual([toolResult('tu_1')]);
  });

  it('never replays an empty assistant message (the API rejects one mid-history)', () => {
    const blank: StoredEntry = { role: 'assistant', kind: 'assistant', content: '' };
    const out = toApiMessages([u('Q1'), a(toolUse('tu_1')), r('tu_1'), a(), blank, u('Q2')]);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
    expect(out.every((m) => (Array.isArray(m.content) ? m.content.length > 0 : m.content !== ''))).toBe(true);
  });

  it('answers a tool call whose results were never stored (the run died), so the thread stays usable', () => {
    const out = toApiMessages([u('Q1'), a({ type: 'text', text: 'Looking' }, toolUse('tu_1'), toolUse('tu_2')), u('Q2')]);
    expect(out[2]).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu_1', is_error: true }),
        expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu_2', is_error: true }),
      ],
    });
    expect(out[3].content).toEqual([{ type: 'text', text: 'Q2' }]);
  });
});

describe('startTurn / finishTurn', () => {
  it('creates a thread titled from the message, with updatedAt equal to createdAt', async () => {
    const message = '  Hi Brandon,\n\nCan you set up an RSVP for the Nov 7 meeting and the workday after it so we can order food?';
    const { threadId: id } = await startTurn(db, { caller, message, now: NOW });
    const t = (await db.doc(`assistantThreads/${id}`).get()).data()!;
    expect(t).toMatchObject({
      title: 'Hi Brandon, Can you set up an RSVP for the Nov 7 meeting and',
      createdBy: 'admin1',
      createdByName: 'Brandon Ellis',
      messageCount: 0,
    });
    expect(t.title.length).toBeLessThanOrEqual(60);
    expect(t.createdAt).toBeInstanceOf(Timestamp);
    expect((t.updatedAt as Timestamp).isEqual(t.createdAt)).toBe(true);
  });

  it('continues an existing thread, with a fresh turn token', async () => {
    const turn = await startTurn(db, { threadId: thread, caller, message: 'More', now: NOW });
    expect(turn).toEqual({ threadId: thread, turnToken: expect.stringMatching(/^[\w-]{20,}$/) });
    expect((await db.doc(`assistantThreads/${thread}`).get()).get('turnToken')).toBe(turn.turnToken);
  });

  it('rejects an unknown thread id as not-found', async () => {
    await expect(startTurn(db, { threadId: 'NOPE', caller, message: 'Hi', now: NOW })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('rejects a full thread', async () => {
    await db.doc(`assistantThreads/${thread}`).update({ messageCount: 200 });
    await expect(startTurn(db, { threadId: thread, caller, message: 'Hi', now: NOW })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'This conversation is full. Start a new one.',
    });
  });

  it('allows one turn at a time per thread until the previous turn ends or its lease lapses', async () => {
    await startTurn(db, { threadId: thread, caller, message: 'First', now: NOW });
    await expect(startTurn(db, { threadId: thread, caller, message: 'Second', now: NOW })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    const later = new Date(NOW.getTime() + TURN_LEASE_MS + 1);
    const afterCrash = await startTurn(db, { threadId: thread, caller, message: 'After a crash', now: later });
    expect(afterCrash.threadId).toBe(thread);
    await finishTurn(db, { threadId: thread, turnToken: afterCrash.turnToken, reply: 'Here is the plan.' });
    await expect(startTurn(db, { threadId: thread, caller, message: 'Next', now: later })).resolves.toMatchObject({
      threadId: thread,
    });
  });

  it('records the reply preview and frees the thread when a turn ends', async () => {
    const { turnToken } = await startTurn(db, { threadId: thread, caller, message: 'Hi', now: NOW });
    await finishTurn(db, { threadId: thread, turnToken, reply: `Here's the plan:\n\n${'x'.repeat(300)}` });
    const t = (await db.doc(`assistantThreads/${thread}`).get()).data()!;
    expect(t.lastReplyPreview.startsWith("Here's the plan: xxx")).toBe(true);
    expect(t.lastReplyPreview.length).toBeLessThanOrEqual(160);
    expect(t.updatedAt).toBeInstanceOf(Timestamp);
    expect(t).not.toHaveProperty('turnStartedAt');
    expect(t).not.toHaveProperty('turnToken');
  });

  it('frees the thread without a preview when a turn fails', async () => {
    const { turnToken } = await startTurn(db, { threadId: thread, caller, message: 'Hi', now: NOW });
    await finishTurn(db, { threadId: thread, turnToken });
    const t = (await db.doc(`assistantThreads/${thread}`).get()).data()!;
    expect(t).not.toHaveProperty('lastReplyPreview');
    expect(t).not.toHaveProperty('turnStartedAt');
  });
});

describe('turn fencing', () => {
  const later = new Date(NOW.getTime() + TURN_LEASE_MS + 1);
  const note = {
    role: 'user' as const,
    kind: 'app_note' as const,
    content: [{ type: 'text', text: '[App update] approved' }],
    display: { text: '[App update] approved' },
  };

  it('refuses appends from a turn that no longer holds the thread; app notes need no turn', async () => {
    const stale = await startTurn(db, { threadId: thread, caller, message: 'First', now: NOW });
    await expect(appendMessage(db, thread, userText('on time'), stale.turnToken)).resolves.toBe(0);
    // Its lease lapsed and a newer turn took the thread.
    const newer = await startTurn(db, { threadId: thread, caller, message: 'Second', now: later });
    expect(newer.turnToken).not.toBe(stale.turnToken);
    await expect(appendMessage(db, thread, userText('too late'), stale.turnToken)).rejects.toBeInstanceOf(StaleTurnError);
    await expect(appendMessage(db, thread, userText('current'), newer.turnToken)).resolves.toBe(1);
    await expect(appendMessage(db, thread, note)).resolves.toBe(2);
  });

  it("a stale turn's finish leaves the newer turn's claim and preview alone", async () => {
    const stale = await startTurn(db, { threadId: thread, caller, message: 'First', now: NOW });
    const newer = await startTurn(db, { threadId: thread, caller, message: 'Second', now: later });
    await finishTurn(db, { threadId: thread, turnToken: stale.turnToken, reply: 'Late reply' });
    let t = (await db.doc(`assistantThreads/${thread}`).get()).data()!;
    expect(t.turnToken).toBe(newer.turnToken);
    expect(t).not.toHaveProperty('lastReplyPreview');
    await finishTurn(db, { threadId: thread, turnToken: newer.turnToken, reply: 'Current reply' });
    t = (await db.doc(`assistantThreads/${thread}`).get()).data()!;
    expect(t).not.toHaveProperty('turnToken');
    expect(t.lastReplyPreview).toBe('Current reply');
  });
});
