import { vi, describe, it, expect, beforeEach } from 'vitest';

const callableFn = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => callableFn),
}));
vi.mock('./firebase', () => ({ functions: { _name: 'functions' } }));

import * as functionsMod from 'firebase/functions';
import { callFn } from './callables';

const mockedHttpsCallable = vi.mocked(functionsMod.httpsCallable);

describe('callFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the named function with a 70 s default timeout and returns .data', async () => {
    callableFn.mockResolvedValueOnce({ data: { jobId: 'j1' } });
    await expect(callFn('queueMemberEmail', { a: 1 })).resolves.toEqual({ jobId: 'j1' });
    expect(mockedHttpsCallable).toHaveBeenCalledWith({ _name: 'functions' }, 'queueMemberEmail', { timeout: 70_000 });
    expect(callableFn).toHaveBeenCalledWith({ a: 1 });
  });

  it('honours a custom timeout', async () => {
    callableFn.mockResolvedValueOnce({ data: null });
    await callFn('assistantChat', {}, 300_000);
    expect(mockedHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'assistantChat', { timeout: 300_000 });
  });

  it('drops undefined fields, which the SDK would otherwise send as null', async () => {
    callableFn.mockResolvedValueOnce({ data: null });
    await callFn('queueMemberEmail', {
      subject: 'S',
      testMemberId: undefined,
      audience: { kind: 'members', memberIds: ['m1'], extra: undefined },
    });
    expect(callableFn).toHaveBeenCalledWith({ subject: 'S', audience: { kind: 'members', memberIds: ['m1'] } });
  });

  it('rethrows the callable error with its message and code intact', async () => {
    const err = Object.assign(new Error("This RSVP link isn't valid."), { code: 'functions/not-found' });
    callableFn.mockRejectedValueOnce(err);
    await expect(callFn('rsvpGetInvite', { token: 'x' })).rejects.toBe(err);
  });
});
