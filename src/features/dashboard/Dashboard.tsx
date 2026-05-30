import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { listenPlots } from '../plots/plotsApi';
import { listenMembers } from '../members/membersApi';
import { computeDuesRollup } from '../../logic/dues';
import { waitlistOrder } from '../../logic/waitlist';
import { Card, Badge, Button } from '../../components/ui';
import type { Plot, Member } from '../../lib/types';

// ---------------------------------------------------------------------------
// Admin view
// ---------------------------------------------------------------------------

function AdminDashboard({ displayName }: { displayName: string }) {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    const unsubPlots = listenPlots(setPlots);
    const unsubMembers = listenMembers(setMembers);
    return () => {
      unsubPlots();
      unsubMembers();
    };
  }, []);

  if (plots === null || members === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const occupied = plots.filter((p) => p.status === 'assigned').length;
  const total = plots.length;
  const rollup = computeDuesRollup(plots);
  const activeCount = members.filter((m) => m.status === 'active').length;
  const waitlistCount = waitlistOrder(members).length;

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

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member view
// ---------------------------------------------------------------------------

const ANNUAL_HOURS_REQUIRED = 12;

function MemberDashboard({ memberId, displayName, currentYearHours }: {
  memberId: string;
  displayName: string;
  currentYearHours: number;
}) {
  const [plots, setPlots] = useState<Plot[] | null>(null);

  useEffect(() => {
    const unsub = listenPlots(setPlots);
    return unsub;
  }, []);

  if (plots === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const myPlots = plots.filter((p) => p.holderMemberId === memberId);
  const hoursPercent = Math.min(100, (currentYearHours / ANNUAL_HOURS_REQUIRED) * 100);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-800">Welcome, {displayName}</h1>

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
          {currentYearHours} / {ANNUAL_HOURS_REQUIRED} hours this year
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

  return (
    <MemberDashboard
      memberId={member.id}
      displayName={member.displayName}
      currentYearHours={member.currentYearHours}
    />
  );
}
