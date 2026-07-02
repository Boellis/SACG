import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore so no real backend is hit.
vi.mock('firebase/firestore', () => {
  const addDoc = vi.fn().mockResolvedValue({ id: 'generated-id' });
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const onSnapshot = vi.fn(() => vi.fn());
  const query = vi.fn((...args: unknown[]) => ({ _query: args }));
  const orderBy = vi.fn((...args: unknown[]) => ({ _orderBy: args }));
  const limit = vi.fn((n: number) => ({ _limit: n }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  return { addDoc, serverTimestamp, onSnapshot, query, orderBy, limit, collection };
});

vi.mock('../../lib/firebase', () => ({ db: {} }));

// Mock the collections module so the real one (which calls
// collection(...).withConverter(...) at import) never loads under the stub SDK.
vi.mock('../../data/collections', () => ({ mailCol: { _path: 'mail' } }));

import * as firestoreMod from 'firebase/firestore';
import { enqueueIndividualEmails } from './mailApi';

const mockedAddDoc = vi.mocked(firestoreMod.addDoc);

const recipients = [
  { displayName: 'Alice Adams', email: 'alice@example.com' },
  { displayName: 'Bob Brown', email: 'bob@example.com' },
];

describe('enqueueIndividualEmails', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes one mail doc per recipient and returns the count', async () => {
    const count = await enqueueIndividualEmails(recipients, 'Hello', 'Hi there', 'admin-1');
    expect(count).toBe(2);
    expect(mockedAddDoc).toHaveBeenCalledTimes(2);
  });

  it('addresses each doc to a single recipient (individual, not a group)', async () => {
    await enqueueIndividualEmails(recipients, 'Hello', 'Body', null);
    const tos = mockedAddDoc.mock.calls.map(
      (c) => (c[1] as { to: string[] }).to,
    );
    expect(tos).toEqual([['alice@example.com'], ['bob@example.com']]);
  });

  it('personalizes subject and body per recipient', async () => {
    await enqueueIndividualEmails(
      recipients,
      'Hi {firstName}',
      'Dear {name}, welcome.',
      'admin-1',
    );
    const first = mockedAddDoc.mock.calls[0][1] as { message: { subject: string; text: string } };
    expect(first.message.subject).toBe('Hi Alice');
    expect(first.message.text).toBe('Dear Alice Adams, welcome.');
    const second = mockedAddDoc.mock.calls[1][1] as { message: { subject: string; text: string } };
    expect(second.message.subject).toBe('Hi Bob');
    expect(second.message.text).toBe('Dear Bob Brown, welcome.');
  });

  it('records createdBy and the recipient display name', async () => {
    await enqueueIndividualEmails([recipients[0]], 'S', 'B', 'admin-1');
    const doc = mockedAddDoc.mock.calls[0][1] as { toName: string; createdBy: string };
    expect(doc.toName).toBe('Alice Adams');
    expect(doc.createdBy).toBe('admin-1');
  });

  it('queues nothing when there are no recipients', async () => {
    const count = await enqueueIndividualEmails([], 'S', 'B');
    expect(count).toBe(0);
    expect(mockedAddDoc).not.toHaveBeenCalled();
  });

  it('reports progress once per recipient', async () => {
    const calls: Array<[number, number]> = [];
    await enqueueIndividualEmails(recipients, 'S', 'B', null, { onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
