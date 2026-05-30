import { describe, it, expect } from 'vitest';
import { groupByNumber, splitPlotIds, isAvailable, plotOccupancy } from './plots';
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
