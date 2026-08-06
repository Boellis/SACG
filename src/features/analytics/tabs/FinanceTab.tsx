import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAlx } from '../AnalyticsPage';
import {
  duesByTier, duesIncreaseTable, collectedSeries, fmtCurrency,
} from '../../../logic/analytics';
import type { TierRollup } from '../../../logic/analytics';
import { ChartCard } from '../components/ChartCard';
import { DrilldownPanel } from '../components/DrilldownPanel';
import { Table, Th, Td } from '../../../components/ui';

interface DrilldownState {
  title: string;
  columns: string[];
  rows: { cells: (string | number)[]; href?: string }[];
}

export default function FinanceTab() {
  const { data, w, bucket, tokens } = useAlx();
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  const bucketHeader = bucket === 'week' ? 'Week' : 'Month';

  const tiers = duesByTier(data.plots);
  const seasonTable = duesIncreaseTable(data.duesHistory);

  const runningSeries = collectedSeries(data.plots, w, bucket);
  let running = 0;
  const cumulative = runningSeries.map((p) => { running += p.value; return { ...p, value: running }; });
  const collectionEmpty = cumulative.every((p) => p.value === 0);

  const assignedPlots = data.plots.filter((p) => p.status === 'assigned');
  const depositsCollected = assignedPlots
    .filter((p) => p.depositPaid)
    .reduce((s, p) => s + (p.depositAmount || 0), 0);
  const depositsExpected = assignedPlots.reduce((s, p) => s + (p.depositAmount || 0), 0);
  const depositsRate = depositsExpected === 0 ? 0 : depositsCollected / depositsExpected;

  function openTierDrilldown(tier: TierRollup) {
    setDrilldown({
      title: `Unpaid — ${tier.tier}`,
      columns: ['Plot', 'Holder', 'Amount'],
      rows: tier.unpaid.map((p) => ({
        cells: [p.id, p.holderName ?? '—', fmtCurrency(p.duesAmount)],
        href: `/plots/${p.id}`,
      })),
    });
  }

  function openAllUnpaid() {
    setDrilldown({
      title: 'Unpaid dues',
      columns: ['Plot', 'Holder', 'Tier'],
      rows: tiers.flatMap((t) => t.unpaid.map((p) => ({
        cells: [p.id, p.holderName ?? '—', t.tier],
        href: `/plots/${p.id}`,
      }))),
    });
  }

  return (
    <div data-testid="tab-finance" className="flex flex-col gap-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Dues by size tier"
          table={{
            columns: ['Tier', 'Collected', 'Outstanding', 'Total'],
            rows: tiers.map((t) => [t.tier, fmtCurrency(t.collected), fmtCurrency(t.outstanding), fmtCurrency(t.expected)]),
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex justify-end items-center gap-3">
              <Link to="/dues" className="underline text-garden-700 text-xs">Open dues page →</Link>
              <button
                type="button"
                onClick={openAllUnpaid}
                className="text-xs px-2 py-1 rounded-md border"
                style={{ borderColor: 'var(--alx-border)', color: 'var(--alx-text-2)' }}
              >
                View unpaid
              </button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tiers}>
                <CartesianGrid stroke={tokens.grid} vertical={false} />
                <XAxis
                  dataKey="tier"
                  tick={{ fill: tokens.muted, fontSize: 11 }}
                  axisLine={{ stroke: tokens.baseline }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: tokens.muted, fontSize: 11 }}
                  axisLine={{ stroke: tokens.baseline }}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar
                  dataKey="collected"
                  stackId="d"
                  fill={tokens.series1}
                  stroke={tokens.surface}
                  strokeWidth={2}
                  barSize={20}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="outstanding"
                  stackId="d"
                  fill={tokens.neutralFill}
                  stroke={tokens.surface}
                  strokeWidth={2}
                  barSize={20}
                  radius={[4, 4, 0, 0]}
                  onClick={(barData) => openTierDrilldown(barData.payload as TierRollup)}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: tokens.series1 }}
                  aria-hidden="true"
                />
                <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>Collected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: tokens.neutralFill }}
                  aria-hidden="true"
                />
                <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>Outstanding</span>
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Collection over time"
          empty={{ when: collectionEmpty, message: 'No payments recorded in this window' }}
          table={{ columns: [bucketHeader, 'Collected'], rows: cumulative.map((p) => [p.label, fmtCurrency(p.value)]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cumulative}>
              <CartesianGrid stroke={tokens.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: tokens.muted, fontSize: 11 }}
                axisLine={{ stroke: tokens.baseline }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: tokens.muted, fontSize: 11 }}
                axisLine={{ stroke: tokens.baseline }}
                tickLine={false}
              />
              <Tooltip cursor={{ stroke: tokens.baseline }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={tokens.series1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Deposits" empty={{ when: depositsExpected === 0, message: 'No deposits configured' }}>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>
              {fmtCurrency(depositsCollected)}
            </p>
            <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
              of {fmtCurrency(depositsExpected)}
            </p>
            <div
              role="progressbar"
              aria-label="Deposits collected"
              aria-valuenow={Math.round(depositsRate * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ background: tokens.seqTrack, height: 12, borderRadius: 6 }}
            >
              <div
                style={{
                  background: tokens.series1,
                  width: `${Math.round(depositsRate * 100)}%`,
                  height: 12,
                  borderRadius: 6,
                }}
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Dues rates by season"
          subtitle={seasonTable.seasons.length <= 1 ? 'One season of recorded rates' : undefined}
        >
          <Table>
            <thead>
              <tr>
                <Th>Tier</Th>
                {seasonTable.seasons.map((s) => <Th key={s}>{s}</Th>)}
              </tr>
            </thead>
            <tbody>
              {seasonTable.rows.map((r) => (
                <tr key={r.tier}>
                  <Td>{r.tier}</Td>
                  {r.amounts.map((a, i) => {
                    const pct = r.pctChanges[i];
                    return (
                      <Td key={i} className="tabular-nums">
                        {a === null ? '—' : `${fmtCurrency(a)}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}`}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </ChartCard>
      </div>

      <DrilldownPanel
        open={drilldown !== null}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        columns={drilldown?.columns ?? []}
        rows={drilldown?.rows ?? []}
      />
    </div>
  );
}
