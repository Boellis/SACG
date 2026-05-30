import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { listenThreads, listenReplies, addReply, deleteThread, deleteReply } from './forumApi';
import { Button, Card } from '../../components/ui';
import type { ForumThread, ForumReply } from '../../lib/types';

function formatDate(ts: { toDate?: () => Date; seconds?: number } | null | undefined): string {
  if (!ts) return '';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date((ts.seconds ?? 0) * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { member, role } = useAuth();
  const [thread, setThread] = useState<ForumThread | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!threadId) return;
    const unsub = listenThreads((threads) => {
      const found = threads.find((t) => t.id === threadId) ?? null;
      setThread(found);
    });
    return unsub;
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    const unsub = listenReplies(threadId, setReplies);
    return unsub;
  }, [threadId]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !threadId) return;
    if (!replyBody.trim()) {
      setError('Reply cannot be empty.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await addReply(threadId, {
        body: replyBody.trim(),
        authorId: member.id,
        authorName: member.displayName,
      });
      setReplyBody('');
    } catch {
      setError('Failed to post reply. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteThread() {
    if (!threadId || !window.confirm('Delete this thread and all replies?')) return;
    await deleteThread(threadId);
  }

  async function handleDeleteReply(rid: string) {
    if (!threadId || !window.confirm('Delete this reply?')) return;
    await deleteReply(threadId, rid);
  }

  if (!thread) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link to="/forum" className="text-garden-600 text-sm hover:underline">
          &larr; Back to Message Board
        </Link>
        <p className="mt-4 text-gray-500">Thread not found.</p>
      </div>
    );
  }

  const canDeleteThread = role === 'admin' || member?.id === thread.authorId;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/forum" className="text-garden-600 text-sm hover:underline">
        &larr; Back to Message Board
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-800">{thread.title}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              by {thread.authorName} &middot; {formatDate(thread.createdAt as any)}
            </p>
          </div>
          {canDeleteThread && (
            <Button
              variant="danger"
              className="text-xs px-2 py-1 shrink-0"
              onClick={() => void handleDeleteThread()}
            >
              Delete Thread
            </Button>
          )}
        </div>
        <p className="mt-4 text-gray-700 whitespace-pre-wrap">{thread.body}</p>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-700">
          Replies ({replies.length})
        </h2>
        {replies.length === 0 && (
          <p className="text-gray-500 text-sm">No replies yet. Be the first!</p>
        )}
        {replies.map((reply) => {
          const canDeleteReply = role === 'admin' || member?.id === reply.authorId;
          return (
            <div
              key={reply.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-1">
                  {reply.authorName} &middot; {formatDate(reply.createdAt as any)}
                </p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{reply.body}</p>
              </div>
              {canDeleteReply && (
                <Button
                  variant="danger"
                  className="text-xs px-2 py-1 shrink-0"
                  onClick={() => void handleDeleteReply(reply.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Card title="Add Reply">
        <form onSubmit={handleReply} className="space-y-3">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 border-gray-300 resize-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Posting...' : 'Post Reply'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
