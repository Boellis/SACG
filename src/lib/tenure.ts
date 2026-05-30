/**
 * Format time elapsed since `joinedAt` as a human-readable tenure string.
 * Examples: "2 years, 3 months" | "5 months" | "Less than a month" | "—"
 */
export function formatTenure(
  joinedAt: { toDate(): Date } | undefined,
  now: Date,
): string {
  if (!joinedAt) return '—';

  const start = joinedAt.toDate();
  const diffMs = now.getTime() - start.getTime();
  if (diffMs < 0) return '—';

  // Calculate years and months elapsed (calendar-aware)
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();

  // Adjust if day-of-month hasn't reached the anniversary yet
  if (now.getDate() < start.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;

  if (totalMonths < 1) return 'Less than a month';

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);

  return parts.join(', ');
}
