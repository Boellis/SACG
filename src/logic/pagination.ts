/**
 * Pure pagination helper. Clamps the requested page into range and returns the
 * slice plus the metadata a pager UI needs ("Showing 1–10 of 52", prev/next).
 */
export interface PageResult<T> {
  page: number;       // 1-based, clamped into [1, pageCount]
  pageSize: number;
  pageCount: number;  // always >= 1
  total: number;
  items: T[];         // the slice for the current page
  startIndex: number; // 1-based index of first item shown (0 when empty)
  endIndex: number;   // 1-based index of last item shown (0 when empty)
  hasPrev: boolean;
  hasNext: boolean;
}

export function paginate<T>(all: T[], page: number, pageSize: number): PageResult<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const from = (current - 1) * size;
  const items = all.slice(from, from + size);
  return {
    page: current,
    pageSize: size,
    pageCount,
    total,
    items,
    startIndex: total === 0 ? 0 : from + 1,
    endIndex: from + items.length,
    hasPrev: current > 1,
    hasNext: current < pageCount,
  };
}
