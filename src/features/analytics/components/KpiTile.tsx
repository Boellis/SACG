import type { KpiDatum } from '../../../logic/analytics';
import type { VizTokens } from '../tokens';
import { DeltaBadge } from './DeltaBadge';
import { Sparkline } from './Sparkline';

export function KpiTile({ kpi, prevLabel, tokens }:
  { kpi: KpiDatum; prevLabel: string; tokens: VizTokens }) {
  return (
    <div className="alx-card flex flex-col gap-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--alx-text-2)' }}>{kpi.label}</p>
      <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>{kpi.display}</p>
      <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>{kpi.detail}</p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <DeltaBadge delta={kpi.delta} goodWhenUp={kpi.goodWhenUp} prevLabel={prevLabel} />
        {kpi.spark && <Sparkline points={kpi.spark} tokens={tokens} />}
      </div>
    </div>
  );
}
