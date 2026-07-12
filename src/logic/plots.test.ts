import { describe, it, expect } from 'vitest';
import { groupByNumber, splitPlotIds, isAvailable, plotOccupancy, plotHolderIds, isPlotHeldBy } from './plots';

describe('plotHolderIds / isPlotHeldBy (multi-holder)', () => {
  it('uses the holderMemberIds array when present', () => {
    const p = { holderMemberId: 'a', holderMemberIds: ['a', 'b', 'c'] } as any;
    expect(plotHolderIds(p)).toEqual(['a', 'b', 'c']);
    expect(isPlotHeldBy(p, 'b')).toBe(true);
    expect(isPlotHeldBy(p, 'c')).toBe(true);
    expect(isPlotHeldBy(p, 'z')).toBe(false);
  });

  it('falls back to the single holderMemberId when no array', () => {
    const p = { holderMemberId: 'a' } as any;
    expect(plotHolderIds(p)).toEqual(['a']);
    expect(isPlotHeldBy(p, 'a')).toBe(true);
    expect(isPlotHeldBy(p, 'b')).toBe(false);
  });

  it('falls back when the array is present but empty', () => {
    const p = { holderMemberId: 'a', holderMemberIds: [] } as any;
    expect(plotHolderIds(p)).toEqual(['a']);
    expect(isPlotHeldBy(p, 'a')).toBe(true);
  });

  it('returns empty for an unheld plot and never matches null/undefined', () => {
    expect(plotHolderIds({} as any)).toEqual([]);
    expect(isPlotHeldBy({ holderMemberId: 'a' } as any, null)).toBe(false);
    expect(isPlotHeldBy({ holderMemberId: 'a' } as any, undefined)).toBe(false);
  });
});
describe('plots logic', () => {
  it('splitPlotIds builds A/B ids', () => {
    expect(splitPlotIds(12)).toEqual({ a:'12A', b:'12B' });
  });
  it('isAvailable true only when available', () => {
    expect(isAvailable({ status:'available' } as any)).toBe(true);
    expect(isAvailable({ status:'assigned' } as any)).toBe(false);
  });
  it('groupByNumber groups halves under their number', () => {
    const g = groupByNumber([{ number:12, half:'A' }, { number:12, half:'B' }, { number:5, half:'whole' }] as any);
    expect(g.get(12)).toHaveLength(2);
    expect(g.get(5)).toHaveLength(1);
  });

  describe('plotOccupancy', () => {
    it('returns "full" for a whole assigned plot', () => {
      expect(plotOccupancy([{ status: 'assigned', half: 'whole' }] as any)).toBe('full');
    });

    it('returns "empty" for a whole available plot', () => {
      expect(plotOccupancy([{ status: 'available', half: 'whole' }] as any)).toBe('empty');
    });

    it('returns "partial" for a split plot where A is assigned and B is available', () => {
      expect(plotOccupancy([
        { status: 'assigned', half: 'A' },
        { status: 'available', half: 'B' },
      ] as any)).toBe('partial');
    });

    it('returns "full" for a split plot where both halves are assigned', () => {
      expect(plotOccupancy([
        { status: 'assigned', half: 'A' },
        { status: 'assigned', half: 'B' },
      ] as any)).toBe('full');
    });
  });
});
