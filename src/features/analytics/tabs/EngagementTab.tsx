import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAlx } from '../AnalyticsPage';
import {
  hoursCohorts, expectedHoursPace, participationSeries, topVolunteers, rsvpBreakdown,
  threadsSeries, votesSeries, inRange, fmtCompact,
} from '../../../logic/analytics';
import type { CohortKey, TsLike } from '../../../logic/analytics';
import type { Member } from '../../../lib/types';
import { ChartCard } from '../components/ChartCard';
import { Table, Th, Td } from '../../../components/ui';
import { RED_POLE } from '../tokens';

// Status colors (done/on-track/behind) — never color alone: every bar is also
// labeled by its XAxis category name and carries a direct count label on its cap.
const COHORTS: { key: CohortKey; name: string; token: 'good' | 'warning' | 'serious' }[] = [
  { key: 'done', name: 'Done', token: 'good' },
  { key: 'onTrack', name: 'On track', token: 'warning' },
  { key: 'behind', name: 'Behind', token: 'serious' },
];

function cohortNames(members: Member[]): string {
  if (members.length === 0) return '—';
  const names = members.map((m) => m.displayName);
  if (names.length <= 10) return names.join(', ');
  return `${names.slice(0, 10).join(', ')} +${names.length - 10} more`;
}

export default function EngagementTab() {
  const { data, w, bucket, tokens, now } = useAlx();
  const bucketHeader = bucket === 'week' ? 'Week' : 'Month';

  const cohorts = hoursCohorts(data.members, data.hours, data.settings, now);
  const cohortData = COHORTS.map((c) => ({ name: c.name, count: cohorts[c.key].length }));
  const pace = expectedHoursPace(data.settings, now);

  const participation = participationSeries(data.hours, w, bucket);
  const participationEmpty = participation.every((p) => p.value === 0);

  const volunteers = topVolunteers(data.members, data.hours, w);

  const rsvpEvents = data.events
    .filter((e) => inRange(e.start as unknown as TsLike, w.start, w.end))
    .sort((a, b) => (b.start as unknown as TsLike).toMillis() - (a.start as unknown as TsLike).toMillis())
    .slice(0, 6);
  const rsvpData = rsvpEvents.map((e) => ({
    name: e.title,
    ...rsvpBreakdown(data.rsvpsByEvent[e.id] ?? []),
  }));

  const threadPoints = threadsSeries(data.threads, w, bucket);
  const threadsEmpty = threadPoints.every((p) => p.value === 0);
  const allVotes = Object.values(data.votesByPoll).flat();
  const votePoints = votesSeries(allVotes, w, bucket);
  const votesEmpty = votePoints.every((p) => p.value === 0);

  return (
    <div data-testid="tab-engagement" className="flex flex-col gap-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Hours requirement"
          subtitle={`${data.settings.requiredHours}h required · pace today: ${pace.toFixed(1)}h`}
          table={{
            columns: ['Cohort', 'Members', 'Names'],
            rows: COHORTS.map((c) => [c.name, cohorts[c.key].length, cohortNames(cohorts[c.key])]),
          }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cohortData}>
              <CartesianGrid stroke={tokens.grid} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: tokens.muted, fontSize: 11 }}
                axisLine={{ stroke: tokens.baseline }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: tokens.muted, fontSize: 11 }}
                axisLine={{ stroke: tokens.baseline }}
                tickLine={false}
              />
              <Tooltip cursor={{ fill: 'transparent' }} />
              <Bar dataKey="count" barSize={20} radius={[4, 4, 0, 0]}>
                {cohortData.map((c, i) => (
                  <Cell key={c.name} fill={tokens[COHORTS[i].token]} />
                ))}
                <LabelList dataKey="count" position="top" fill={tokens.textSecondary} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Participation trend"
          empty={{ when: participationEmpty, message: 'No hours logged in this window' }}
          table={{ columns: [bucketHeader, 'Members logging'], rows: participation.map((p) => [p.label, p.value]) }}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={participation}>
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
          title="Top volunteers"
          empty={{ when: volunteers.length === 0, message: 'No hours logged in this window' }}
        >
          <Table>
            <thead>
              <tr><Th>Rank</Th><Th>Name</Th><Th>Hours</Th></tr>
            </thead>
            <tbody>
              {volunteers.map((r, i) => (
                <tr key={r.member.id}>
                  <Td>{i + 1}</Td>
                  <Td>
                    <Link className="underline text-garden-700" to={`/members/${r.member.id}`}>
                      {r.member.displayName}
                    </Link>
                  </Td>
                  <Td className="tabular-nums">{fmtCompact(r.hours)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ChartCard>

        <ChartCard
          title="Event RSVPs"
          empty={{ when: rsvpData.length === 0, message: 'No events in this window' }}
          table={{
            columns: ['Event', 'Yes', 'Maybe', 'No'],
            rows: rsvpData.map((r) => [r.name, r.yes, r.maybe, r.no]),
          }}
        >
          <div className="flex flex-col gap-3">
            <ResponsiveContainer width="100%" height={Math.max(180, rsvpData.length * 36)}>
              <BarChart data={rsvpData} layout="vertical">
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: tokens.muted, fontSize: 11 }}
                  axisLine={{ stroke: tokens.baseline }}
                  tickLine={false}
                />
                <XAxis type="number" hide />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar dataKey="yes" stackId="rsvp" fill={tokens.series1} stroke={tokens.surface} strokeWidth={2} barSize={14} />
                <Bar dataKey="maybe" stackId="rsvp" fill={tokens.neutralFill} stroke={tokens.surface} strokeWidth={2} barSize={14} />
                <Bar dataKey="no" stackId="rsvp" fill={RED_POLE} stroke={tokens.surface} strokeWidth={2} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: tokens.series1 }} aria-hidden="true" />
                <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>Yes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: tokens.neutralFill }} aria-hidden="true" />
                <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>Maybe</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: RED_POLE }} aria-hidden="true" />
                <span className="text-xs" style={{ color: 'var(--alx-text-2)' }}>No</span>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartCard
          title="Forum threads"
          empty={{ when: threadsEmpty, message: 'No threads in this window' }}
          table={{ columns: [bucketHeader, 'Threads'], rows: threadPoints.map((p) => [p.label, p.value]) }}
        >
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={threadPoints}>
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
          title="Poll votes"
          empty={{ when: votesEmpty, message: 'No votes in this window' }}
          table={{ columns: [bucketHeader, 'Votes'], rows: votePoints.map((p) => [p.label, p.value]) }}
        >
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={votePoints}>
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
      </div>
    </div>
  );
}
