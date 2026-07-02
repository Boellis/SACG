import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Card } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import { listenPlots } from '../plots/plotsApi';
import { listenDirectory } from './directoryApi';
import { startConversation } from './chatApi';
import type { Plot, DirectoryEntry } from '../../lib/types';

function fmtDate(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return 'unknown';
  return ts.toDate().toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'long' });
}

export default function MemberProfilePage() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const { user, member } = useAuth();
  const [dir, setDir] = useState<DirectoryEntry[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => listenDirectory(setDir), []);
  useEffect(() => listenPlots(setPlots), []);

  const entry = dir.find((d) => d.id === memberId);
  const theirPlots = useMemo(() => plots.filter((p) => p.holderMemberId === memberId), [plots, memberId]);

  const myUid = user?.uid;
  const isSelf = !!entry?.uid && entry.uid === myUid;
  const canMessage = !!entry?.uid && !isSelf && !!myUid;

  async function handleMessage() {
    if (!entry?.uid || !myUid) return;
    setStarting(true);
    try {
      const cid = await startConversation(
        { uid: myUid, name: member?.displayName || 'Me' },
        { uid: entry.uid, name: entry.displayName },
      );
      navigate(`/messages/${cid}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button variant="ghost" onClick={() => navigate('/lounge')}>
        ← Lounge
      </Button>

      {!entry ? (
        <Card>
          <p className="text-sm text-gray-500">Member not found.</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{entry.displayName}</h1>
                <p className="text-sm text-gray-500 mt-1">Member since {fmtDate(entry.joinedAt)}</p>
              </div>
              {canMessage && (
                <Button onClick={handleMessage} disabled={starting}>
                  {starting ? 'Opening…' : '💬 Message'}
                </Button>
              )}
              {isSelf && <span className="text-xs text-gray-400">This is you</span>}
            </div>
            {!entry.uid && !isSelf && (
              <p className="text-xs text-gray-400 mt-2">
                This member hasn&apos;t set up online access yet, so they can&apos;t be messaged.
              </p>
            )}
          </Card>

          <Card title="Plots">
            {theirPlots.length === 0 ? (
              <p className="text-sm text-gray-500">No plots.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {theirPlots.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/plots/${p.id}`}
                      className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded px-1"
                    >
                      <span className="text-sm font-medium text-gray-800">Plot {p.id}</span>
                      <span className="text-xs text-gray-500">
                        {(p.crops?.length ?? 0) > 0
                          ? `${p.crops.length} crop${p.crops.length === 1 ? '' : 's'}`
                          : 'no crops'}{' '}
                        · view 2D/3D →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
