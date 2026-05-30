import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { listenThreads, createThread, deleteThread } from './forumApi';
import { Button, Card } from '../../components/ui';
import type { ForumThread } from '../../lib/types';

function formatDate(ts: { toDate?: () => Date; seconds?: number } | null | undefined): string {
  if (!ts) return '';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ForumPage() {
  const { member, role } = useAuth();
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = listenThreads(setThreads);
    return unsub;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await createThread({
        title: title.trim(),
        body: body.trim(),
        authorId: member.id,
        authorName: member.displayName,
      });
      setTitle('');
      setBody('');
    } catch {
      setError('Failed to post thread. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this thread?')) return;
    await deleteThread(id);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Message Board</h1>

      <Card title="New Thread">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="thread-title" className="text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="thread-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Thread title"
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 border-gray-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="thread-body" className="text-sm font-medium text-gray-700">
              Body
            </label>
            <textarea
              id="thread-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 border-gray-300 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Posting...' : 'Post Thread'}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {threads.length === 0 && (
          <p className="text-gray-500 text-sm">No threads yet. Be the first to post!</p>
        )}
        {threads.map((thread) => {
          const canDelete = role === 'admin' || member?.id === thread.authorId;
          return (
            <div
              key={thread.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <Link
                  to={`/forum/${thread.id}`}
                  className="text-garden-700 font-semibold hover:underline line-clamp-1"
                >
                  {thread.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  by {thread.authorName} &middot; {formatDate(thread.createdAt as any)}
                </p>
              </div>
              {canDelete && (
                <Button
                  variant="danger"
                  className="text-xs px-2 py-1 shrink-0"
                  onClick={() => void handleDelete(thread.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
