import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Badge, Modal } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import { listenPlots } from '../plots/plotsApi';
import { listenDirectory } from './directoryApi';
import {
  listenAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  visibleAnnouncements,
} from './announcementsApi';
import type { Plot, DirectoryEntry, Announcement } from '../../lib/types';

const inputCls =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500';

function fmtDate(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' });
}

export default function MembersLoungePage() {
  const { role, member, user } = useAuth();
  const [dir, setDir] = useState<DirectoryEntry[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => listenDirectory(setDir), []);
  useEffect(() => listenPlots(setPlots), []);
  useEffect(() => listenAnnouncements(setAnns), []);

  const plotsByMember = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of plots) {
      if (p.holderMemberId) {
        const arr = m.get(p.holderMemberId) ?? [];
        arr.push(p.id);
        m.set(p.holderMemberId, arr);
      }
    }
    return m;
  }, [plots]);

  const visible = visibleAnnouncements(anns, Date.now());
  const myUid = user?.uid;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Members Lounge</h1>
        {role === 'admin' && <Button onClick={() => setShowForm(true)}>Post announcement</Button>}
      </div>

      {/* Billboard */}
      <div className="space-y-3">
        {visible.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">No announcements right now.</p>
          </Card>
        ) : (
          visible.map((a) => (
            <Card key={a.id} className={a.pinned ? 'border-garden-300' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {a.pinned && <Badge color="green">Pinned</Badge>}
                    <h3 className="font-semibold text-gray-800">{a.title}</h3>
                  </div>
                  {a.body && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{a.body}</p>}
                  {a.linkUrl && (
                    <a
                      href={a.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-garden-700 font-medium hover:underline mt-2 inline-block"
                    >
                      {a.linkLabel || 'Open link'} ↗
                    </a>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {a.authorName || 'Admin'} · {fmtDate(a.createdAt)}
                    {a.expiresAt && <> · shows until {fmtDate(a.expiresAt)}</>}
                  </p>
                </div>
                {role === 'admin' && (
                  <button
                    onClick={() => {
                      if (confirm('Delete this announcement?')) void deleteAnnouncement(a.id);
                    }}
                    className="text-gray-400 hover:text-red-600 text-sm shrink-0"
                    aria-label="Delete announcement"
                  >
                    ✕
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Directory */}
      <Card title="Members">
        {dir.length === 0 ? (
          <p className="text-sm text-gray-500">No members listed yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {dir.map((d) => {
              const ps = plotsByMember.get(d.id) ?? [];
              return (
                <li key={d.id}>
                  <Link
                    to={`/lounge/${d.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 rounded px-1"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {d.displayName}
                      {d.uid === myUid && <span className="text-gray-400 font-normal"> (you)</span>}
                    </span>
                    <span className="text-xs text-gray-500">{ps.length ? 'Plot ' + ps.join(', ') : '—'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {showForm && role === 'admin' && (
        <AnnouncementForm
          onClose={() => setShowForm(false)}
          createdBy={member?.id ?? ''}
          authorName={member?.displayName ?? 'Admin'}
        />
      )}
    </div>
  );
}

function AnnouncementForm({
  onClose,
  createdBy,
  authorName,
}: {
  onClose: () => void;
  createdBy: string;
  authorName: string;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [pinned, setPinned] = useState(false);
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErr('A title is required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        linkUrl: linkUrl.trim() || undefined,
        linkLabel: linkLabel.trim() || undefined,
        pinned,
        expiresAt: expires ? new Date(expires) : null,
        createdBy,
        authorName,
      });
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to post.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Post announcement">
      <form onSubmit={submit} className="space-y-3">
        <input className={inputCls} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className={inputCls + ' resize-y'}
          rows={4}
          placeholder="Message — a rule, notice, reminder…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Link URL (optional — e.g. a Google Doc of the bylaws)"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Link label (optional — e.g. 'Read the bylaws')"
          value={linkLabel}
          onChange={(e) => setLinkLabel(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-garden-600" />
          Pin to top
        </label>
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Show until (optional — leave blank to keep it up indefinitely)</label>
          <input type="date" className={inputCls} value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
