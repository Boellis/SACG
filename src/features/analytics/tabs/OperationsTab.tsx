import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAlx } from '../AnalyticsPage';
import {
  upkeepDistribution, cropPopularity, splitPlotUtilization, occupancyKpi, waitlistCount,
} from '../../../logic/analytics';
import type { UpkeepTier } from '../../../logic/analytics';
import { ChartCard } from '../components/ChartCard';

// Status colors (the tiers mean good/bad) — never color alone: every swatch is
// paired with an icon + text label + direct-labeled count in the legend below.
const TIERS: { key: UpkeepTier; label: string; icon: string; token: 'good' | 'warning' | 'serious' | 'neutralFill' }[] = [
  { key: 'thriving', label: 'Thriving', icon: '🌿', token: 'good' },
  { key: 'okay', label: 'Okay', icon: '☀️', token: 'warning' },
  { key: 'attention', label: 'Attention', icon: '⚠️', token: 'serious' },
  { key: 'nodata', label: 'No data', icon: '▫️', token: 'neutralFill' },
];

export default function OperationsTab() {
  const { data, tokens, now } = useAlx();

  const upkeep = upkeepDistribution(data.plots, now);
  const assignedCount = TIERS.reduce((s, t) => s + upkeep[t.key].length, 0);
  const upkeepRow = [Object.fromEntries(TIERS.map((t) => [t.key, upkeep[t.key].length]))];

  const crops = cropPopularity(data.plots);
  const cropChartHeight = Math.max(180, crops.length * 28);

  const util = splitPlotUtilization(data.plots);
  const wholeRate = util.wholes === 0 ? 0 : util.assignedWholes / util.wholes;
  const halfRate = util.halves === 0 ? 0 : util.assignedHalves / util.halves;

  const occ = occupancyKpi(data.plots);
  const openPlots = occ.total - occ.occupied;
  const waitlist = waitlistCount(data.members);

  return (
    <div data-testid="tab-operations" className="flex flex-col gap-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Plot upkeep"
          subtitle={`${assignedCount} assigned plots`}
          table={{
            columns: ['Tier', 'Plots'],
            rows: TIERS.map((t) => [t.label, upkeep[t.key].length]),
          }}
        >
          <div className="flex flex-col gap-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={upkeepRow} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" hide />
                <Tooltip />
                {TIERS.map((t) => (
                  <Bar
                    key={t.key}
                    stackId="u"
                    dataKey={t.key}
                    fill={tokens[t.token]}
                    stroke={tokens.surface}
                    strokeWidth={2}
                    maxBarSize={20}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4">
              {TIERS.map((t) => (
                <div key={t.key} className="flex items-center gap-1.5">
                  <span aria-hidden="true">{t.icon}</span>
                  <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>
                    {t.label} <span className="tabular-nums">{upkeep[t.key].length}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Needs attention"
          empty={{
            when: upkeep.attention.length === 0 && upkeep.nodata.length === 0,
            message: 'Every assigned plot shows recent activity 🎉',
          }}
        >
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-1.5">
              {upkeep.attention.map((p) => (
                <li key={p.id} className="text-sm" style={{ color: 'var(--alx-text)' }}>
                  <Link className="underline text-garden-700" to={`/plots/${p.id}`}>Plot {p.id}</Link>
                  {' '}— {p.holderName ?? '—'}
                </li>
              ))}
            </ul>
            {upkeep.attention.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
                No plots currently need attention.
              </p>
            )}
            {upkeep.nodata.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
                {upkeep.nodata.length} plots have no upkeep data yet
              </p>
            )}
          </div>
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard
            title="Crop popularity"
            empty={{ when: crops.length === 0, message: 'No crops recorded yet' }}
            table={{ columns: ['Crop', 'Plots'], rows: crops.map((c) => [c.name, c.count]) }}
          >
            <ResponsiveContainer width="100%" height={cropChartHeight}>
              <BarChart data={crops} layout="vertical">
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fill: tokens.muted, fontSize: 11 }}
                  axisLine={{ stroke: tokens.baseline }}
                  tickLine={false}
                />
                <XAxis type="number" hide />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="count" barSize={14} radius={[0, 4, 4, 0]}>
                  {crops.map((c) => (
                    <Cell key={c.name} fill={c.name === 'Other' ? tokens.neutralFill : tokens.series1} />
                  ))}
                  <LabelList dataKey="count" position="right" fill={tokens.textSecondary} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Split-plot utilization">
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
                Whole plots: {util.assignedWholes} of {util.wholes} assigned
              </p>
              <div
                role="progressbar"
                aria-label="Whole plots assigned"
                aria-valuenow={Math.round(wholeRate * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ background: tokens.seqTrack, height: 12, borderRadius: 6 }}
              >
                <div
                  style={{
                    background: tokens.series1,
                    width: `${Math.round(wholeRate * 100)}%`,
                    height: 12,
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
                Half plots: {util.assignedHalves} of {util.halves} assigned
              </p>
              <div
                role="progressbar"
                aria-label="Half plots assigned"
                aria-valuenow={Math.round(halfRate * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ background: tokens.seqTrack, height: 12, borderRadius: 6 }}
              >
                <div
                  style={{
                    background: tokens.series1,
                    width: `${Math.round(halfRate * 100)}%`,
                    height: 12,
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Open plots vs waitlist">
          <div className="flex flex-col gap-3 py-2">
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>{openPlots}</p>
                <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>Open plots</p>
              </div>
              <div>
                <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>{waitlist}</p>
                <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>Waitlist</p>
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--alx-text-2)' }}>
              {waitlist} {waitlist === 1 ? 'person' : 'people'} waiting for {openPlots} open {openPlots === 1 ? 'plot' : 'plots'}
            </p>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
