import type { Delta } from '../../../logic/analytics';

export function DeltaBadge({ delta, goodWhenUp, prevLabel }:
  { delta: Delta | null; goodWhenUp: boolean; prevLabel: string }) {
  if (!delta || delta.pct === null) {
    return <span className="text-xs" style={{ color: 'var(--alx-muted)' }}>—</span>;
  }
  const up = delta.dir === 'up';
  const flat = delta.dir === 'flat';
  const good = flat ? null : up === goodWhenUp;
  const color = flat ? 'var(--alx-muted)' : good ? 'var(--alx-delta-good, #006300)' : '#d03b3b';
  const arrow = flat ? '■' : up ? '▲' : '▼';
  return (
    <span className="text-xs font-medium inline-flex items-baseline gap-1">
      <span style={{ color }}>{arrow} {Math.abs(delta.pct)}%</span>
      {prevLabel && <span style={{ color: 'var(--alx-muted)' }}>vs {prevLabel}</span>}
    </span>
  );
}
