import { describe, it, expect } from 'vitest';
import { formatTenure } from './tenure';

function ts(dateStr: string) {
  return { toDate: () => new Date(dateStr) };
}

describe('formatTenure', () => {
  it('returns "—" when joinedAt is undefined', () => {
    expect(formatTenure(undefined, new Date('2026-01-01'))).toBe('—');
  });

  it('returns "1 year, 2 months" for ~14 months', () => {
    // joined 2024-11-01, now 2026-01-01 → 1 year, 2 months
    expect(formatTenure(ts('2024-11-01'), new Date('2026-01-01'))).toBe('1 year, 2 months');
  });

  it('returns "Less than a month" for ~20 days', () => {
    // joined 2026-01-01, now 2026-01-21 → 20 days
    expect(formatTenure(ts('2026-01-01'), new Date('2026-01-21'))).toBe('Less than a month');
  });

  it('returns "7 months" for ~7 months', () => {
    // joined 2025-06-01, now 2026-01-01 → 7 months
    expect(formatTenure(ts('2025-06-01'), new Date('2026-01-01'))).toBe('7 months');
  });

  it('returns "2 years, 3 months" for 2 years and 3 months', () => {
    expect(formatTenure(ts('2023-10-01'), new Date('2026-01-01'))).toBe('2 years, 3 months');
  });

  it('omits zero months when exactly on year boundary', () => {
    // joined 2024-01-01, now 2026-01-01 → exactly 2 years
    expect(formatTenure(ts('2024-01-01'), new Date('2026-01-01'))).toBe('2 years');
  });

  it('returns "1 month" for exactly 1 month', () => {
    expect(formatTenure(ts('2025-12-01'), new Date('2026-01-01'))).toBe('1 month');
  });

  it('returns "1 year" for exactly 1 year', () => {
    expect(formatTenure(ts('2025-01-01'), new Date('2026-01-01'))).toBe('1 year');
  });
});
