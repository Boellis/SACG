import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import {
  listenPolls,
  createPoll,
  deletePoll,
  listenVotes,
  castVote,
  tally,
  isPollOpen,
} from './pollsApi';
import { Button, Card, Badge, Modal, Field } from '../../components/ui';
import type { Timestamp } from 'firebase/firestore';
import type { Poll, PollVote } from '../../lib/types';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

function formatWhen(ts: Timestamp): string {
  return ts.toDate().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ---------------------------------------------------------------------------
// One poll — subscribes to its own votes, shows the ballot or live results.
// ---------------------------------------------------------------------------

interface PollCardProps {
  poll: Poll;
  uid: string;
  isAdmin: boolean;
  onDelete: (poll: Poll) => void;
}

function PollCard({ poll, uid, isAdmin, onDelete }: PollCardProps) {
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = listenVotes(poll.id, setVotes);
    return unsub;
  }, [poll.id]);

  const open = isPollOpen(poll, Date.now());
  const myVote = votes.find((v) => v.id === uid);
  const { results, total } = tally(poll.options, votes);

  // Ballot shows while the poll is open and the member either hasn't voted or
  // has chosen to change their vote; otherwise show the results breakdown.
  const showBallot = open && (!myVote || changing);

  async function handleVote(optionId: string) {
    setSaving(true);
    setError('');
    try {
      await castVote(poll.id, uid, optionId);
      setChanging(false);
    } catch {
      setError('Could not record your vote. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-800">{poll.question}</h3>
        {isAdmin && (
          <Button
            variant="danger"
            className="text-xs px-2 py-1 shrink-0"
            onClick={() => onDelete(poll)}
          >
            Delete
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">by {poll.authorName}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {open ? (
          poll.expiresAt ? (
            <Badge color="amber">Closes {formatWhen(poll.expiresAt)}</Badge>
          ) : (
            <Badge color="green">Open</Badge>
          )
        ) : (
          <Badge color="gray">Closed</Badge>
        )}
        <span className="text-xs text-gray-500">
          {total} {total === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {showBallot
          ? poll.options.map((opt) => (
              <Button
                key={opt.id}
                variant="secondary"
                disabled={saving}
                onClick={() => handleVote(opt.id)}
                className="w-full"
              >
                {opt.text}
              </Button>
            ))
          : results.map((r) => {
              const mine = myVote?.optionId === r.id;
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between text-sm mb-0.5">
                    <span className={mine ? 'font-semibold text-garden-700' : 'text-gray-700'}>
                      {r.text}
                      {mine && ' ✓'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {r.count} · {r.pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${mine ? 'bg-garden-600' : 'bg-garden-500'}`}
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {open && myVote && (
        <button
          type="button"
          onClick={() => setChanging((c) => !c)}
          className="text-xs text-garden-700 hover:underline mt-3"
        >
          {changing ? 'Cancel' : 'Change vote'}
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create-poll modal (admin only)
// ---------------------------------------------------------------------------

interface CreatePollModalProps {
  createdBy: string;
  authorName: string;
  onClose: () => void;
}

function CreatePollModal({ createdBy, authorName, onClose }: CreatePollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [closeStr, setCloseStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ''] : prev));
  }
  function removeOption(i: number) {
    setOptions((prev) => (prev.length > MIN_OPTIONS ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question.trim()) {
      setError('Enter a question.');
      return;
    }
    if (trimmed.length < MIN_OPTIONS) {
      setError('Enter at least two options.');
      return;
    }
    let expiresAt: Date | null = null;
    if (closeStr) {
      const d = new Date(closeStr);
      if (Number.isNaN(d.getTime())) {
        setError('Enter a valid close date.');
        return;
      }
      expiresAt = d;
    }
    setError('');
    setSaving(true);
    try {
      await createPoll({ question, options: trimmed, expiresAt, createdBy, authorName });
      onClose();
    } catch {
      setError('Failed to create poll. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Create poll">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="poll-question" className="text-sm font-medium text-gray-700">
            Question
          </label>
          <input
            id="poll-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should we plant in the common bed?"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Options</span>
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
              />
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() => removeOption(i)}
                  className="text-gray-400 hover:text-red-600 text-xl leading-none px-1"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="text-sm text-garden-700 hover:underline self-start"
            >
              + Add option
            </button>
          )}
        </div>

        <Field
          label="Close date (optional)"
          type="datetime-local"
          value={closeStr}
          onChange={(e) => setCloseStr(e.target.value)}
        />

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Creating…' : 'Create poll'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PollsPage() {
  const { user, member, role } = useAuth();
  const isAdmin = role === 'admin';
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const unsub = listenPolls(setPolls);
    return unsub;
  }, []);

  async function handleDelete(poll: Poll) {
    if (!window.confirm(`Delete the poll "${poll.question}"? This also removes its votes.`)) return;
    await deletePoll(poll.id);
  }

  if (!user || !member) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Polls</h1>
        {isAdmin && <Button onClick={() => setShowCreate(true)}>Create poll</Button>}
      </div>

      {polls.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            No polls yet.{isAdmin ? ' Create one to gather member input.' : ''}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              uid={user.uid}
              isAdmin={isAdmin}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePollModal
          createdBy={user.uid}
          authorName={member.displayName}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
