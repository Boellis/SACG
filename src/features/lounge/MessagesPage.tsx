import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import { listenConversations } from './chatApi';
import type { Conversation } from '../../lib/types';

function fmtTime(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<Conversation[]>([]);

  useEffect(() => {
    if (user?.uid) return listenConversations(user.uid, setConvos);
  }, [user?.uid]);

  const myUid = user?.uid;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
      <Card>
        {convos.length === 0 ? (
          <p className="text-sm text-gray-500">
            No conversations yet. Start one from the{' '}
            <Link to="/lounge" className="text-garden-700 hover:underline">
              Members Lounge
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {convos.map((c) => {
              const otherUid = c.participants.find((p) => p !== myUid);
              const name = (otherUid && c.participantNames?.[otherUid]) || 'Member';
              return (
                <li key={c.id}>
                  <Link
                    to={`/messages/${c.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-gray-50 rounded px-1"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{name}</p>
                      <p className="text-xs text-gray-500 truncate">{c.lastMessage || 'No messages yet'}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{fmtTime(c.lastAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
