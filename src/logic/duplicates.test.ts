import { describe, it, expect } from 'vitest';
import { findRosterDuplicate, buildMergePlan, normalizeEmail } from './duplicates';
import type { Member, Plot } from '../lib/types';

const mkMember = (p: Partial<Member>): Member => ({
  id: 'x',
  uid: null,
  email: '',
  displayName: '',
  role: 'member',
  status: 'pending',
  createdAt: { toMillis: () => 0 } as Member['createdAt'],
  currentYearHours: 0,
  ...p,
});

const mkPlot = (p: Partial<Plot>): Plot => ({
  id: '1',
  number: 1,
  half: 'whole',
  status: 'assigned',
  duesAmount: 0,
  depositAmount: 0,
  duesPaid: false,
  depositPaid: false,
  season: '2026',
  crops: [],
  ...p,
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Donna.R719@Gmail.com ')).toBe('donna.r719@gmail.com');
  });
  it('handles null/undefined', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('findRosterDuplicate', () => {
  const stub = mkMember({ id: 'old', uid: null, email: 'a@x.com', displayName: 'Ann A' });
  const signup = mkMember({ id: 'new', uid: 'new', email: 'a@x.com', displayName: 'Ann' });

  it('finds the uid:null roster stub sharing the signup email', () => {
    expect(findRosterDuplicate([stub, signup], signup)).toBe(stub);
  });

  it('matches case-insensitively', () => {
    const s2 = mkMember({ id: 'old', uid: null, email: 'Donna.R@X.com' });
    const p2 = mkMember({ id: 'new', uid: 'new', email: 'donna.r@x.com' });
    expect(findRosterDuplicate([s2, p2], p2)).toBe(s2);
  });

  it('ignores the record itself', () => {
    expect(findRosterDuplicate([signup], signup)).toBeNull();
  });

  it('ignores same-email records that already have a uid (not a roster stub)', () => {
    const other = mkMember({ id: 'other', uid: 'other', email: 'a@x.com' });
    expect(findRosterDuplicate([other, signup], signup)).toBeNull();
  });

  it('returns null when the signup has no email', () => {
    const noEmail = mkMember({ id: 'new', uid: 'new', email: '' });
    expect(findRosterDuplicate([stub, noEmail], noEmail)).toBeNull();
  });

  it('returns null when there is no match', () => {
    const lone = mkMember({ id: 'new', uid: 'new', email: 'z@x.com' });
    expect(findRosterDuplicate([stub, lone], lone)).toBeNull();
  });
});

describe('buildMergePlan', () => {
  const roster = mkMember({
    id: 'old',
    uid: null,
    email: 'a@x.com',
    displayName: 'Jane Roe',
    phone: '555-1234',
    joinedAt: { toMillis: () => 111 } as Member['joinedAt'],
  });
  const pending = mkMember({ id: 'new', uid: 'new', email: 'a@x.com', displayName: 'Jane' });
  const plots = [
    mkPlot({ id: '7', holderMemberId: 'old' }),
    mkPlot({ id: '8', holderMemberId: 'old' }),
    mkPlot({ id: '9', holderMemberId: 'someone-else' }),
  ];

  it('keeps the signup id, absorbs the roster id, carries roster name/phone/join-date', () => {
    const plan = buildMergePlan(pending, roster, plots);
    expect(plan.keepId).toBe('new');
    expect(plan.absorbId).toBe('old');
    expect(plan.displayName).toBe('Jane Roe');
    expect(plan.phone).toBe('555-1234');
    expect(plan.joinedAt).toBe(roster.joinedAt);
  });

  it('swaps the stub for the kept id on every plot it solely holds, as primary', () => {
    const plan = buildMergePlan(pending, roster, plots);
    expect(plan.plotUpdates.map((u) => u.id)).toEqual(['7', '8']);
    expect(plan.plotUpdates[0]).toEqual({ id: '7', holderMemberIds: ['new'], setPrimary: true });
    expect(plan.plotUpdates[1]).toEqual({ id: '8', holderMemberIds: ['new'], setPrimary: true });
  });

  it('handles a co-held plot: swaps in the array without becoming primary', () => {
    const coPlot = mkPlot({ id: '2', holderMemberId: 'katie', holderMemberIds: ['katie', 'old'] });
    const plan = buildMergePlan(pending, roster, [coPlot]);
    expect(plan.plotUpdates).toEqual([
      { id: '2', holderMemberIds: ['katie', 'new'], setPrimary: false },
    ]);
  });

  it('falls back to the signup name/phone when the roster record lacks them', () => {
    const bareRoster = mkMember({ id: 'old', uid: null, email: 'a@x.com', displayName: '' });
    const richPending = mkMember({ id: 'new', uid: 'new', displayName: 'Jane', phone: '999' });
    const plan = buildMergePlan(richPending, bareRoster, []);
    expect(plan.displayName).toBe('Jane');
    expect(plan.phone).toBe('999');
    expect(plan.plotUpdates).toEqual([]);
  });
});
