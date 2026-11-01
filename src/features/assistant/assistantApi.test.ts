import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../lib/callables', () => ({ callFn: vi.fn() }));
vi.mock('../../lib/firebase', () => ({ db: { _db: true } }));
// Tiny stand-ins that record what was asked for, so the queries can be asserted.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  orderBy: vi.fn((field: string, dir?: string) => ({ orderBy: [field, dir ?? 'asc'] })),
  limit: vi.fn((n: number) => ({ limit: n })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
  onSnapshot: vi.fn(() => vi.fn()),
}));

import * as callablesMod from '../../lib/callables';
import * as firestoreMod from 'firebase/firestore';
import {
  sendAssistantMessage,
  executeAssistantAction,
  rejectAssistantAction,
  listenThreads,
  listenThreadMessages,
  listenThreadActions,
} from './assistantApi';

const mockedCallFn = vi.mocked(callablesMod.callFn);
const mockedOnSnapshot = vi.mocked(firestoreMod.onSnapshot);

const usage = { turnsToday: 1, limit: 60 };

describe('assistantApi callables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a thread without sending a threadId (the server rejects null) and waits up to 300 s', async () => {
    mockedCallFn.mockResolvedValue({ threadId: 't1', reply: 'Hello', actionIds: [], usage });

    const res = await sendAssistantMessage(null, 'Hi');

    expect(mockedCallFn).toHaveBeenCalledWith('assistantChat', { message: 'Hi' }, 300_000);
    expect(mockedCallFn.mock.calls[0][1]).not.toHaveProperty('threadId');
    expect(res).toEqual({ threadId: 't1', reply: 'Hello', actionIds: [], usage });
  });

  it('continues an existing thread', async () => {
    mockedCallFn.mockResolvedValue({ threadId: 't1', reply: 'Sure', actionIds: ['a1'], usage });
    await sendAssistantMessage('t1', 'Again');
    expect(mockedCallFn).toHaveBeenCalledWith('assistantChat', { threadId: 't1', message: 'Again' }, 300_000);
  });

  it('executes an action with the given mode, overrides and test recipient (120 s)', async () => {
    mockedCallFn.mockResolvedValue({ status: 'proposed', result: { jobId: 'job-1' } });
    const input = {
      threadId: 't1',
      actionId: 'a1',
      mode: 'test' as const,
      overrides: { subject: 'New' },
      testMemberId: 'm1',
    };

    const res = await executeAssistantAction(input);

    expect(mockedCallFn).toHaveBeenCalledWith('assistantExecuteAction', input, 120_000);
    expect(res).toEqual({ status: 'proposed', result: { jobId: 'job-1' } });
  });

  it('rejects an action', async () => {
    mockedCallFn.mockResolvedValue({ status: 'rejected' });
    await rejectAssistantAction('t1', 'a1');
    expect(mockedCallFn).toHaveBeenCalledWith('assistantRejectAction', { threadId: 't1', actionId: 'a1' });
  });

  it('lets the server error reach the caller unchanged', async () => {
    const err = Object.assign(new Error('Daily assistant limit reached (60). It resets at midnight.'), {
      code: 'functions/resource-exhausted',
    });
    mockedCallFn.mockRejectedValue(err);
    await expect(sendAssistantMessage('t1', 'More')).rejects.toBe(err);
  });
});

describe('assistantApi listeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Fire the snapshot callback that listener N registered. */
  const deliver = (docs: Array<{ id: string; data: () => unknown }>) => {
    const next = mockedOnSnapshot.mock.calls[0][1] as unknown as (snap: unknown) => void;
    next({ docs });
  };

  it('lists the 30 most recently updated threads, newest first, with their ids', () => {
    const cb = vi.fn();
    listenThreads(cb);

    expect(mockedOnSnapshot.mock.calls[0][0]).toEqual({
      ref: { path: 'assistantThreads' },
      constraints: [{ orderBy: ['updatedAt', 'desc'] }, { limit: 30 }],
    });
    deliver([{ id: 't2', data: () => ({ title: 'Second' }) }]);
    expect(cb).toHaveBeenCalledWith([{ id: 't2', title: 'Second' }]);
  });

  it("reads a thread's messages in seq order", () => {
    const cb = vi.fn();
    listenThreadMessages('t1', cb);

    expect(mockedOnSnapshot.mock.calls[0][0]).toEqual({
      ref: { path: 'assistantThreads/t1/messages' },
      constraints: [{ orderBy: ['seq', 'asc'] }],
    });
    deliver([{ id: '000001', data: () => ({ seq: 1, kind: 'user_text' }) }]);
    expect(cb).toHaveBeenCalledWith([{ id: '000001', seq: 1, kind: 'user_text' }]);
  });

  it("reads a thread's actions in creation order", () => {
    const cb = vi.fn();
    listenThreadActions('t1', cb);

    expect(mockedOnSnapshot.mock.calls[0][0]).toEqual({
      ref: { path: 'assistantThreads/t1/actions' },
      constraints: [{ orderBy: ['createdAt', 'asc'] }],
    });
    deliver([{ id: 'a1', data: () => ({ type: 'create_event' }) }]);
    expect(cb).toHaveBeenCalledWith([{ id: 'a1', type: 'create_event' }]);
  });

  it('returns the unsubscribe function and forwards listener errors', () => {
    const unsub = vi.fn();
    mockedOnSnapshot.mockReturnValueOnce(unsub);
    const onError = vi.fn();

    expect(listenThreads(vi.fn(), onError)).toBe(unsub);
    expect(mockedOnSnapshot.mock.calls[0][2]).toBe(onError);
  });
});
