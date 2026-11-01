import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, clearFirestore } from '../testing/emulator';
import { requireAdmin } from './auth';

const db = testDb();

beforeEach(async () => {
  await clearFirestore();
  await db.doc('members/admin1').set({
    displayName: 'Ada Admin',
    email: 'ada@example.com',
    role: 'admin',
    status: 'active',
  });
  await db.doc('members/m1').set({
    displayName: 'Denny Smith',
    email: 'denny@example.com',
    role: 'member',
    status: 'active',
  });
});

describe('requireAdmin', () => {
  it('rejects a call with no auth as unauthenticated', async () => {
    await expect(requireAdmin(db, undefined)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects a regular member as permission-denied', async () => {
    await expect(requireAdmin(db, { uid: 'm1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a signed-in user with no member record as permission-denied', async () => {
    await expect(requireAdmin(db, { uid: 'stranger' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it("returns the admin's uid, name and email", async () => {
    await expect(requireAdmin(db, { uid: 'admin1' })).resolves.toEqual({
      uid: 'admin1',
      displayName: 'Ada Admin',
      email: 'ada@example.com',
    });
  });
});
