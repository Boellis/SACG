import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Table, Th, Td, Field } from '../../components/ui';
import type { Member, Plot, Role, MemberStatus } from '../../lib/types';
import { listenMembers } from './membersApi';
import { listenPlots } from '../plots/plotsApi';

function RoleBadge({ role }: { role: Role }) {
  return <Badge color={role === 'admin' ? 'blue' : 'gray'}>{role}</Badge>;
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const colorMap: Record<MemberStatus, 'green' | 'amber' | 'gray'> = {
    active: 'green',
    pending: 'amber',
    inactive: 'gray',
  };
  return <Badge color={colorMap[status]}>{status}</Badge>;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let membersLoaded = false;
    let plotsLoaded = false;

    const checkLoaded = () => {
      if (membersLoaded && plotsLoaded) setLoading(false);
    };

    const unsubMembers = listenMembers((data) => {
      setMembers(data);
      membersLoaded = true;
      checkLoaded();
    });

    const unsubPlots = listenPlots((data) => {
      setPlots(data);
      plotsLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubMembers();
      unsubPlots();
    };
  }, []);

  const q = search.toLowerCase();
  const filtered = members.filter(
    (m) =>
      m.displayName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q),
  );

  function plotsForMember(memberId: string): Plot[] {
    return plots.filter((p) => p.holderMemberId === memberId);
  }

  if (loading) {
    return (
      <Card>
        <p className="text-gray-500 text-sm">Loading members…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <div className="w-64">
          <Field
            label="Search"
            placeholder="Name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-sm">
            {members.length === 0 ? 'No members yet.' : 'No members match your search.'}
          </p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Plots</Th>
              <Th>Hours</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const memberPlots = plotsForMember(m.id);
              return (
                <tr key={m.id}>
                  <Td>
                    <Link
                      to={`/members/${m.id}`}
                      className="text-garden-700 hover:underline font-medium"
                    >
                      {m.displayName}
                    </Link>
                  </Td>
                  <Td>{m.email}</Td>
                  <Td>
                    <RoleBadge role={m.role} />
                  </Td>
                  <Td>
                    <StatusBadge status={m.status} />
                  </Td>
                  <Td>
                    {memberPlots.length === 0
                      ? <span className="text-gray-400">—</span>
                      : memberPlots.map((p) => p.id).join(', ')}
                  </Td>
                  <Td>{m.currentYearHours}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
