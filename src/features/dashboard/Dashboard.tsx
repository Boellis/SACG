import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { listenPlots } from '../plots/plotsApi';
import { listenMembers } from '../members/membersApi';
import { listenMemberHours, listenAllHours } from '../hours/hoursApi';
import { computeDuesRollup } from '../../logic/dues';
import { waitlistOrder } from '../../logic/waitlist';
import { isPlotHeldBy } from '../../logic/plots';
import { yearToDateHours } from '../../logic/hours';
import { formatTenure } from '../../lib/tenure';
import { Card, Badge, Button } from '../../components/ui';
import type { Plot, Member, VolunteerHour } from '../../lib/types';

// ---------------------------------------------------------------------------
// Admin view
// ---------------------------------------------------------------------------

function AdminDashboard({ displayName }: { displayName: string }) {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [allHours, setAllHours] = useState<VolunteerHour[] | null>(null);

  useEffect(() => {
    const unsubPlots = listenPlots(setPlots);
    const unsubMembers = listenMembers(setMembers);
    const unsubHours = listenAllHours(setAllHours);
    return () => {
      unsubPlots();
      unsubMembers();
      unsubHours();
    };
  }, []);

  if (plots === null || members === null || allHours === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const occupied = plots.filter((p) => p.status === 'assigned').length;
  const total = plots.length;
  const rollup = computeDuesRollup(plots);
  const activeCount = members.filter((m) => m.status === 'active').length;
  const waitlistCount = waitlistOrder(members).length;
  const communityHours = yearToDateHours(allHours, new Date().getUTCFullYear());

  const outstanding = rollup.outstanding.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-800">Welcome, {displayName}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <Card title="Plots">
          <p className="text-3xl font-bold text-garden-700">{occupied}/{total}</p>
          <p className="text-sm text-gray-500 mt-1">occupied</p>
          <Link to="/plots">
            <Button variant="secondary" className="mt-4 w-full">View Plots</Button>
          </Link>
        </Card>

        <Card title="Dues Outstanding">
          <p className="text-3xl font-bold text-garden-700">{outstanding}</p>
          <p className="text-sm text-gray-500 mt-1">outstanding</p>
          <Link to="/dues">
            <Button variant="secondary" className="mt-4 w-full">View Dues</Button>
          </Link>
        </Card>

        <Card title="Members">
          <p className="text-3xl font-bold text-garden-700">{activeCount}</p>
          <p className="text-sm text-gray-500 mt-1">active</p>
          <Link to="/members">
            <Button variant="secondary" className="mt-4 w-full">View Members</Button>
          </Link>
        </Card>

        <Card title="Waitlist">
          <p className="text-3xl font-bold text-garden-700">{waitlistCount}</p>
          <p className="text-sm text-gray-500 mt-1">pending</p>
          <Link to="/waitlist">
            <Button variant="secondary" className="mt-4 w-full">View Waitlist</Button>
          </Link>
        </Card>

        <Card title="Community hours (this year)">
          <p className="text-3xl font-bold text-garden-700">{communityHours}</p>
          <p className="text-sm text-gray-500 mt-1">hours logged</p>
        </Card>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member view
// ---------------------------------------------------------------------------

const ANNUAL_HOURS_REQUIRED = 12;

function MemberDashboard({ member }: { member: Member }) {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [entries, setEntries] = useState<VolunteerHour[] | null>(null);

  useEffect(() => {
    const unsubPlots = listenPlots(setPlots);
    const unsubHours = listenMemberHours(member.id, setEntries);
    return () => {
      unsubPlots();
      unsubHours();
    };
  }, [member.id]);

  if (plots === null || entries === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const myPlots = plots.filter((p) => isPlotHeldBy(p, member.id));
  const ytdHours = yearToDateHours(entries, new Date().getUTCFullYear());
  const hoursPercent = Math.min(100, (ytdHours / ANNUAL_HOURS_REQUIRED) * 100);
  const tenure = formatTenure(member.joinedAt, new Date());

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {member.displayName}</h1>
        {tenure !== '—' && (
          <span className="text-sm text-gray-500">Member for {tenure}</span>
        )}
      </div>

      {myPlots.length === 0 ? (
        <Card>
          <p className="text-gray-600">You don't have a plot yet — an admin will assign one soon.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {myPlots.map((plot) => (
            <Card key={plot.id} title="Your Plot">
              <p className="text-sm font-mono text-gray-700 mb-2">{plot.id}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Dues:</span>
                {plot.duesPaid
                  ? <Badge color="green">Paid</Badge>
                  : <Badge color="amber">Unpaid</Badge>}
              </div>
              <Link to={`/plots/${plot.id}`}>
                <Button variant="secondary" className="mt-4 w-full">View Plot</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Card title="Volunteer Hours">
        <p className="text-sm text-gray-700 mb-2">
          {ytdHours} / {ANNUAL_HOURS_REQUIRED} hours this year
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-garden-600 h-2.5 rounded-full transition-all"
            style={{ width: `${hoursPercent}%` }}
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard (role-routing)
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { role, member } = useAuth();

  if (!member) {
    return <p className="p-6 text-gray-500">Loading…</p>;
  }

  if (role === 'admin') {
    return <AdminDashboard displayName={member.displayName} />;
  }

  return <MemberDashboard member={member} />;
}
