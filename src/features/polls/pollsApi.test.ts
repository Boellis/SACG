import { describe, it, expect, vi } from 'vitest';

// Stub firestore + firebase + collections so importing the module never touches a backend.
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromDate: (d: Date) => ({ _d: d }) },
}));
vi.mock('../../lib/firebase', () => ({ db: {}, app: {}, auth: {} }));
vi.mock('../../data/collections', () => ({
  pollsCol: {},
  pollDoc: () => ({}),
  votesCol: () => ({}),
  votesDoc: () => ({}),
}));

import { tally, isPollOpen } from './pollsApi';
import type { Poll, PollOption, PollVote } from '../../lib/types';

const options: PollOption[] = [
  { id: '0', text: 'Roses' },
  { id: '1', text: 'Tulips' },
  { id: '2', text: 'Daisies' },
];

const vote = (id: string, optionId: string): PollVote =>
  ({ id, optionId, memberId: id, createdAt: {} }) as unknown as PollVote;

describe('tally', () => {
  it('counts votes per option and computes whole-number percentages', () => {
    const votes = [vote('u1', '0'), vote('u2', '0'), vote('u3', '1'), vote('u4', '1')];
    const { results, total } = tally(options, votes);

    expect(total).toBe(4);
    expect(results[0]).toMatchObject({ id: '0', text: 'Roses', count: 2, pct: 50 });
    expect(results[1]).toMatchObject({ id: '1', text: 'Tulips', count: 2, pct: 50 });
    expect(results[2]).toMatchObject({ id: '2', text: 'Daisies', count: 0, pct: 0 });
  });

  it('returns zero counts and 0% for every option when there are no votes', () => {
    const { results, total } = tally(options, []);
    expect(total).toBe(0);
    expect(results.every((r) => r.count === 0 && r.pct === 0)).toBe(true);
  });

  it('rounds percentages to the nearest integer', () => {
    const votes = [vote('u1', '0'), vote('u2', '1'), vote('u3', '2')]; // 1/3 each
    const { results } = tally(options, votes);
    expect(results.map((r) => r.pct)).toEqual([33, 33, 33]);
  });

  it('ignores votes whose optionId matches no option', () => {
    const votes = [vote('u1', '0'), vote('u2', 'ghost')];
    const { results, total } = tally(options, votes);
    expect(total).toBe(2); // total counts every vote
    expect(results[0].count).toBe(1);
    expect(results.reduce((n, r) => n + r.count, 0)).toBe(1); // stray vote not attributed
  });
});

describe('isPollOpen', () => {
  const now = 1_000_000;
  const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Poll['expiresAt'];

  it('is open when not closed and there is no close date', () => {
    expect(isPollOpen({ closed: false } as Poll, now)).toBe(true);
    expect(isPollOpen({} as Poll, now)).toBe(true);
  });

  it('is closed when the closed flag is set, regardless of close date', () => {
    expect(isPollOpen({ closed: true } as Poll, now)).toBe(false);
    expect(isPollOpen({ closed: true, expiresAt: ts(now + 5000) } as Poll, now)).toBe(false);
  });

  it('is open when the close date is in the future', () => {
    expect(isPollOpen({ closed: false, expiresAt: ts(now + 1) } as Poll, now)).toBe(true);
  });

  it('is closed once the close date has passed', () => {
    expect(isPollOpen({ closed: false, expiresAt: ts(now - 1) } as Poll, now)).toBe(false);
    expect(isPollOpen({ closed: false, expiresAt: ts(now) } as Poll, now)).toBe(false); // not strictly future
  });
});
