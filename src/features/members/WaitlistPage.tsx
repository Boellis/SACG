import { useEffect, useState } from 'react';
import { Button, Card, Table, Th, Td } from '../../components/ui';
import type { Member, Plot } from '../../lib/types';
import { listenMembers, approveMember, mergeMembers } from './membersApi';
import { listenPlots } from '../plots/plotsApi';
import { waitlistOrder } from '../../logic/waitlist';
import { findRosterDuplicate, buildMergePlan } from '../../logic/duplicates';

export default function WaitlistPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubMembers = listenMembers((data) => {
      setMembers(data);
      setLoading(false);
    });
    const unsubPlots = listenPlots(setPlots);
    return () => {
      unsubMembers();
      unsubPlots();
    };
  }, []);

  const waitlist = waitlistOrder(members);

  function formatDate(ts: Member['createdAt']): string {
    try {
      return ts.toDate().toLocaleDateString();
    } catch {
      return '—';
    }
  }

  async function run(id: string, action: () => Promise<void>): Promise<void> {
    setBusyId(id);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error)?.message ?? 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <p className="text-gray-500 text-sm">Loading waitlist…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Waitlist</h1>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {waitlist.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-sm">No one on the waitlist.</p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Waiting Since</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {waitlist.map((m) => {
              const duplicate = findRosterDuplicate(members, m);
              const plan = duplicate ? buildMergePlan(m, duplicate, plots) : null;
              const busy = busyId === m.id;
              return (
                <tr key={m.id}>
                  <Td>
                    {m.displayName}
                    {duplicate && (
                      <div className="mt-1 text-xs text-amber-700">
                        Looks like existing member “{duplicate.displayName}”.{' '}
                        {plan && plan.plotIds.length > 0
                          ? `Merging keeps this login and assigns plot ${plan.plotIds.join(', ')}.`
                          : 'Merging links their records (no plot on file).'}
                      </div>
                    )}
                  </Td>
                  <Td>{m.email}</Td>
                  <Td>{formatDate(m.createdAt)}</Td>
                  <Td>
                    {duplicate && plan ? (
                      <Button disabled={busy} onClick={() => run(m.id, () => mergeMembers(plan))}>
                        {busy ? 'Merging…' : 'Approve & merge'}
                      </Button>
                    ) : (
                      <Button disabled={busy} onClick={() => run(m.id, () => approveMember(m.id))}>
                        {busy ? 'Approving…' : 'Approve'}
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
