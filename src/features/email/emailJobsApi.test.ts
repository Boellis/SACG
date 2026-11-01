import { describe, it, expect, vi } from 'vitest';

// A real Firestore instance, so the ids are the SDK's own: making a document
// reference is local, nothing goes over the network.
vi.mock('../../lib/firebase', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');
  return { db: getFirestore(initializeApp({ projectId: 'demo-sacg' }, 'email-jobs-api-test')) };
});
vi.mock('../../lib/callables', () => ({ callFn: vi.fn() }));

import { newEmailJobId } from './emailJobsApi';

describe('newEmailJobId', () => {
  it('makes a fresh id on the device each time, one the server accepts as a job id', () => {
    const ids = Array.from({ length: 50 }, () => newEmailJobId());
    // queueMemberEmail takes any 1-200 characters without a "/" (DocIdSchema); auto-ids are 20 letters and digits.
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
