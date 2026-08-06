import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useAlx } from '../AnalyticsPage';
import {
  buildKpis, memberGrowthSeries, hoursSeries, duesKpi,
  nextEvent, rsvpBreakdown, openPollCount, fmtCurrency, fmtPct,
} from '../../../logic/analytics';
import type { PlotStatus } from '../../../lib/types';
import { KpiTile } from '../components/KpiTile';
import { ChartCard } from '../components/ChartCard';

const PLOT_STATUSES: { key: PlotStatus; label: string; series: 'series1' | 'series2' | 'series3' | 'series4' }[] = [
  { key: 'assigned', label: 'Assigned', series: 'series1' },
  { key: 'available', label: 'Available', series: 'series2' },
  { key: 'reserved', label: 'Reserved', series: 'series3' },
  { key: 'inactive', label: 'Inactive', series: 'series4' },
];

export default function OverviewTab() {
  const { data, w, bucket, tokens, now } = useAlx();

  const kpis = buildKpis(data, w, now);
  const growth = memberGrowthSeries(data.members, w, bucket);
  const hours = hoursSeries(data.hours, w, bucket);
  const hoursEmpty = hours.every((p) => p.value === 0);
  const dues = duesKpi(data.plots);
  const bucketHeader = bucket === 'week' ? 'Week' : 'Month';

  const statusCounts = PLOT_STATUSES.reduce((acc, s) => {
    acc[s.key] = data.plots.filter((p) => p.status === s.key).length;
    return acc;
  }, {} as Record<PlotStatus, number>);
  const statusRow = [statusCounts];

  const ev = nextEvent(data.events, now);
  const evRsvps = ev ? rsvpBreakdown(data.rsvpsByEvent[ev.id] ?? []) : null;
  const newestThreads = [...data.threads]
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .slice(0, 3);
  const openPolls = openPollCount(data.polls, now);

  return (
    <div data-testid="tab-overview" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} prevLabel={w.prevLabel} tokens={tokens} />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Member growth"
          table={{ columns: [bucketHeader, 'Members'], rows: growth.map((p) => [p.label, p.value]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={growth}>
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

        <ChartCard
          title={`Volunteer hours by ${bucket}`}
          empty={{ when: hoursEmpty, message: 'No hours logged in this window' }}
          table={{ columns: [bucketHeader, 'Hours'], rows: hours.map((p) => [p.label, p.value]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hours}>
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
              <Tooltip cursor={{ fill: 'transparent' }} />
              <Bar dataKey="value" fill={tokens.series1} barSize={20} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Dues collection" empty={{ when: dues.expected === 0, message: 'No dues configured' }}>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>
              {fmtCurrency(dues.collected)}
            </p>
            <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
              of {fmtCurrency(dues.expected)} · {fmtPct(dues.rate)}
            </p>
            <div
              role="progressbar"
              aria-label="Dues collected"
              aria-valuenow={Math.round(dues.rate * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ background: tokens.seqTrack, height: 12, borderRadius: 6 }}
            >
              <div
                style={{
                  background: tokens.series1,
                  width: `${Math.round(dues.rate * 100)}%`,
                  height: 12,
                  borderRadius: 6,
                }}
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Plot status"
          table={{
            columns: ['Status', 'Plots'],
            rows: PLOT_STATUSES.map((s) => [s.label, statusCounts[s.key]]),
          }}
        >
          <div className="flex flex-col gap-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusRow} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" hide />
                <Tooltip />
                {PLOT_STATUSES.map((s) => (
                  <Bar
                    key={s.key}
                    stackId="s"
                    dataKey={s.key}
                    fill={tokens[s.series]}
                    stroke={tokens.surface}
                    strokeWidth={2}
                    maxBarSize={20}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4">
              {PLOT_STATUSES.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: tokens[s.series] }}
                    aria-hidden="true"
                  />
                  <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>
                    {s.label} <span className="tabular-nums">{statusCounts[s.key]}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="alx-card flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--alx-text)' }}>Next event</h3>
          {ev ? (
            <>
              <p className="text-sm" style={{ color: 'var(--alx-text)' }}>{ev.title}</p>
              <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>
                {ev.start.toDate().toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </p>
              <p className="text-xs" style={{ color: 'var(--alx-text-2)' }}>
                {evRsvps!.yes} yes · {evRsvps!.maybe} maybe
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>No upcoming events</p>
          )}
        </div>

        <div className="alx-card flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--alx-text)' }}>Newest threads</h3>
          {newestThreads.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {newestThreads.map((t) => (
                <li key={t.id} className="text-sm truncate" style={{ color: 'var(--alx-text)' }}>{t.title}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>No threads yet</p>
          )}
        </div>

        <div className="alx-card flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--alx-text)' }}>Open polls</h3>
          <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>{openPolls}</p>
        </div>
      </div>
    </div>
  );
}
