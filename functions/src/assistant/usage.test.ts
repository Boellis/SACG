import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, clearFirestore } from '../testing/emulator';
import { DAILY_TURN_LIMIT } from './config';
import { consumeTurn } from './usage';

const db = testDb();
// 9:00 AM Sunday, November 1, 2026 in Chicago (CST: UTC-6 since 2 AM).
const NOW = new Date('2026-11-01T15:00:00Z');
// 11:59 PM the same garden day, though already Nov 2 in UTC.
const LATE_SAME_DAY = new Date('2026-11-02T05:59:00Z');
// Midnight Monday, November 2 in Chicago.
const NEXT_DAY = new Date('2026-11-02T06:00:00Z');

beforeEach(clearFirestore);

describe('consumeTurn', () => {
  it('counts turns per admin per garden day', async () => {
    expect(DAILY_TURN_LIMIT).toBe(60);
    await expect(consumeTurn(db, 'admin1', NOW)).resolves.toEqual({ turnsToday: 1, limit: 60 });
    await expect(consumeTurn(db, 'admin1', NOW)).resolves.toEqual({ turnsToday: 2, limit: 60 });
    await expect(consumeTurn(db, 'admin2', NOW)).resolves.toEqual({ turnsToday: 1, limit: 60 });
    expect((await db.doc('assistantUsage/admin1_2026-11-01').get()).get('turns')).toBe(2);
  });

  it('refuses the 61st turn of the garden day, then resets at garden midnight', async () => {
    for (let i = 1; i <= 60; i++) {
      const at = i === 60 ? LATE_SAME_DAY : NOW;
      expect((await consumeTurn(db, 'admin1', at)).turnsToday).toBe(i);
    }
    await expect(consumeTurn(db, 'admin1', LATE_SAME_DAY)).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: 'Daily assistant limit reached (60). It resets at midnight.',
    });
    expect((await db.doc('assistantUsage/admin1_2026-11-01').get()).get('turns')).toBe(60);
    await expect(consumeTurn(db, 'admin1', NEXT_DAY)).resolves.toEqual({ turnsToday: 1, limit: 60 });
  });

  it('counts concurrent turns exactly', async () => {
    await Promise.all(Array.from({ length: 5 }, () => consumeTurn(db, 'admin1', NOW)));
    expect((await db.doc('assistantUsage/admin1_2026-11-01').get()).get('turns')).toBe(5);
  });
});
