import { describe, it, expect } from 'vitest';
import { paginate } from './pagination';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('returns the first page slice with correct metadata', () => {
    const r = paginate(range(25), 1, 10);
    expect(r.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.pageCount).toBe(3);
    expect(r.total).toBe(25);
    expect(r.startIndex).toBe(1);
    expect(r.endIndex).toBe(10);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(true);
  });

  it('returns a middle page', () => {
    const r = paginate(range(25), 2, 10);
    expect(r.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(r.startIndex).toBe(11);
    expect(r.endIndex).toBe(20);
    expect(r.hasPrev).toBe(true);
    expect(r.hasNext).toBe(true);
  });

  it('returns a partial last page', () => {
    const r = paginate(range(25), 3, 10);
    expect(r.items).toEqual([21, 22, 23, 24, 25]);
    expect(r.endIndex).toBe(25);
    expect(r.hasPrev).toBe(true);
    expect(r.hasNext).toBe(false);
  });

  it('clamps a too-high page to the last page', () => {
    const r = paginate(range(25), 99, 10);
    expect(r.page).toBe(3);
    expect(r.items[0]).toBe(21);
  });

  it('clamps a too-low or invalid page to 1', () => {
    expect(paginate(range(25), 0, 10).page).toBe(1);
    expect(paginate(range(25), -5, 10).page).toBe(1);
    expect(paginate(range(25), NaN, 10).page).toBe(1);
  });

  it('handles an empty list', () => {
    const r = paginate([], 1, 10);
    expect(r.items).toEqual([]);
    expect(r.pageCount).toBe(1);
    expect(r.total).toBe(0);
    expect(r.startIndex).toBe(0);
    expect(r.endIndex).toBe(0);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(false);
  });

  it('handles an exact multiple of page size', () => {
    const r = paginate(range(20), 2, 10);
    expect(r.pageCount).toBe(2);
    expect(r.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(r.hasNext).toBe(false);
  });
});
