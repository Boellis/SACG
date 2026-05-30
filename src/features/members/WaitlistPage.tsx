import { useEffect, useState } from 'react';
import { Button, Card, Table, Th, Td } from '../../components/ui';
import type { Member } from '../../lib/types';
import { listenMembers, approveMember } from './membersApi';
import { waitlistOrder } from '../../logic/waitlist';

export default function WaitlistPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = listenMembers((data) => {
      setMembers(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const waitlist = waitlistOrder(members);

  function formatDate(ts: Member['createdAt']): string {
    try {
      return ts.toDate().toLocaleDateString();
    } catch {
      return '—';
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
            {waitlist.map((m) => (
              <tr key={m.id}>
                <Td>{m.displayName}</Td>
                <Td>{m.email}</Td>
                <Td>{formatDate(m.createdAt)}</Td>
                <Td>
                  <Button onClick={() => approveMember(m.id)}>Approve</Button>
                  {/* Approve & Assign plot modal wired in a later task */}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
