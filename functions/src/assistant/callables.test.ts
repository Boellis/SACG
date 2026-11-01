import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { APIConnectionError, AuthenticationError, InternalServerError, RateLimitError } from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { testDb, clearFirestore } from '../testing/emulator';
import { assistantChat, handleAssistantChat, NOT_SET_UP, type ChatDeps } from './callables';
import type { CreateMessage } from './loop';

// Callables must never reach Secret Manager or Anthropic in tests: every path
// here injects its own key and model, and this stub makes a leak fail loudly.
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class {
    constructor() {
      throw new Error('tests must never reach Secret Manager');
    }
  },
}));

const db = testDb();
const NOW = new Date('2026-11-01T15:00:00Z');
const ADMIN = { uid: 'admin1' };

const reply = (t: string): BetaMessage =>
  ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: t, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  }) as unknown as BetaMessage;

const answering = (t: string): CreateMessage => vi.fn(async () => reply(t));
const failing = (err: unknown): CreateMessage =>
  vi.fn(async () => {
    throw err;
  });

function deps(createMessage: CreateMessage = answering('Happy to help!'), over: Partial<ChatDeps> = {}) {
  return {
    getApiKey: vi.fn(async () => 'test-key-1'),
    createMessageFor: vi.fn(() => createMessage),
    now: () => NOW,
    ...over,
  };
}

const count = async (col: string) => (await db.collection(col).get()).size;

beforeEach(async () => {
  await clearFirestore();
  await db.doc('members/admin1').set({ displayName: 'Brandon Ellis', email: 'brandon@example.com', role: 'admin', status: 'active' });
  await db.doc('members/m-denny').set({ displayName: 'Denny Smith', email: 'denny@example.com', role: 'member', status: 'active' });
});

describe('assistantChat (deployed wrapper)', () => {
  it('answers the prod smoke check (anonymous, empty payload) with unauthenticated', async () => {
    await expect(assistantChat.run({ data: {}, rawRequest: {} } as unknown as CallableRequest)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('runs in us-central1 with 300 s and 512 MiB', () => {
    expect(assistantChat.__endpoint).toMatchObject({ region: ['us-central1'], timeoutSeconds: 300, availableMemoryMb: 512 });
  });
});

describe('handleAssistantChat', () => {
  it('checks the caller before the input, the key or the daily limit', async () => {
    const d = deps();
    await expect(handleAssistantChat(db, undefined, {}, d)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(handleAssistantChat(db, { uid: 'm-denny' }, { message: 'Hi' }, d)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(d.getApiKey).not.toHaveBeenCalled();
    expect(await count('assistantUsage')).toBe(0);
  });

  it.each([
    ['an empty payload', {}],
    ['a blank message', { message: '   ' }],
    ['a message over 20,000 characters', { message: 'x'.repeat(20_001) }],
    ['a non-string message', { message: 42 }],
    ['a path-like thread id', { message: 'Hi', threadId: 'a/b' }],
    ['an extra field', { message: 'Hi', model: 'other' }],
  ])('rejects %s as invalid-argument', async (_label, data) => {
    const d = deps();
    await expect(handleAssistantChat(db, ADMIN, data, d)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(d.getApiKey).not.toHaveBeenCalled();
  });

  it("says the assistant isn't set up when there is no API key, before using a turn", async () => {
    const d = deps(undefined, { getApiKey: vi.fn(async () => null) });
    await expect(handleAssistantChat(db, ADMIN, { message: 'Hi' }, d)).rejects.toMatchObject({
      code: 'failed-precondition',
      message: NOT_SET_UP,
    });
    expect(NOT_SET_UP).toBe(
      "AI assistant isn't set up yet. Brandon needs to add the Anthropic API key in Google Cloud Secret Manager (ANTHROPIC_API_KEY).",
    );
    expect(await count('assistantThreads')).toBe(0);
    expect(await count('assistantUsage')).toBe(0);
  });

  it('starts a thread, runs the turn with the key, and returns the reply and usage', async () => {
    const d = deps();
    const res = await handleAssistantChat(db, ADMIN, { message: 'Can you set up the Nov 7 RSVP?' }, d);
    expect(res).toEqual({
      threadId: expect.any(String),
      reply: 'Happy to help!',
      actionIds: [],
      usage: { turnsToday: 1, limit: 60 },
    });
    expect(d.createMessageFor).toHaveBeenCalledWith('test-key-1');
    const thread = (await db.doc(`assistantThreads/${res.threadId}`).get()).data()!;
    expect(thread).toMatchObject({
      title: 'Can you set up the Nov 7 RSVP?',
      createdBy: 'admin1',
      createdByName: 'Brandon Ellis',
      lastReplyPreview: 'Happy to help!',
      messageCount: 2,
    });
    expect(thread.createdAt).toBeInstanceOf(Timestamp);
    expect(thread.updatedAt).toBeInstanceOf(Timestamp);
    expect(thread).not.toHaveProperty('turnStartedAt');
  });

  it('continues the same thread on the next message', async () => {
    const first = await handleAssistantChat(db, ADMIN, { message: 'Hi' }, deps());
    const second = await handleAssistantChat(db, ADMIN, { message: 'And the workday?', threadId: first.threadId }, deps());
    expect(second.threadId).toBe(first.threadId);
    expect(second.usage.turnsToday).toBe(2);
    expect((await db.doc(`assistantThreads/${first.threadId}`).get()).get('messageCount')).toBe(4);
  });

  it('rejects a thread that is full or does not exist', async () => {
    await db.doc('assistantThreads/FULL').set({ title: 'Long', messageCount: 200, updatedAt: Timestamp.fromDate(NOW) });
    await expect(handleAssistantChat(db, ADMIN, { message: 'Hi', threadId: 'FULL' }, deps())).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'This conversation is full. Start a new one.',
    });
    await expect(handleAssistantChat(db, ADMIN, { message: 'Hi', threadId: 'NOPE' }, deps())).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it.each([
    [
      'a rejected API key',
      new AuthenticationError(401, { type: 'error' }, 'invalid x-api-key', new Headers()),
      'failed-precondition',
      /API key was rejected/,
    ],
    ['a rate limit', new RateLimitError(429, { type: 'error' }, 'rate limited', new Headers()), 'resource-exhausted', /busy/],
    ['a server error', new InternalServerError(500, { type: 'error' }, 'boom', new Headers()), 'unavailable', /try again/i],
    ['a network failure', new APIConnectionError({ message: 'Connection error.' }), 'unavailable', /try again/i],
  ])('maps %s from Anthropic to %s, and frees the thread', async (_label, err, code, message) => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      const first = handleAssistantChat(db, ADMIN, { message: 'Hi' }, deps(failing(err)));
      await expect(first).rejects.toMatchObject({ code, message: expect.stringMatching(message) });
      const [thread] = (await db.collection('assistantThreads').get()).docs;
      expect(thread.get('updatedAt')).toBeInstanceOf(Timestamp);
      expect(thread.get('turnStartedAt')).toBeUndefined();
      await expect(handleAssistantChat(db, ADMIN, { message: 'Again', threadId: thread.id }, deps())).resolves.toMatchObject({
        reply: 'Happy to help!',
      });
    } finally {
      logged.mockRestore();
    }
  });
});
