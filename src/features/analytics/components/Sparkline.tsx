import type { VizTokens } from '../tokens';

export function Sparkline({ points, tokens }: { points: number[]; tokens: VizTokens }) {
  if (points.length < 2) return null;
  const w = 96, h = 28, pad = 3;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - 2 * pad)) / (max - min || 1);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = x(points.length - 1), lastY = y(points[points.length - 1]);
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={d} fill="none" stroke={tokens.sparkLine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={4} fill={tokens.sparkDot} stroke={tokens.surface} strokeWidth={2} />
    </svg>
  );
}
