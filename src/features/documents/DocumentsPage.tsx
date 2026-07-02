import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Card, Badge, Modal } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import {
  listenDocuments,
  uploadDocument,
  deleteDocument,
  visibleDocuments,
} from './documentsApi';
import type { Document } from '../../lib/types';

const inputCls =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500';

function fmtDateTime(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function fmtDate(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleDateString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' });
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${i === 0 ? val : val.toFixed(1)} ${units[i]}`;
}

export default function DocumentsPage() {
  const { role, member } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => listenDocuments(setDocs), []);

  const visible = useMemo(() => visibleDocuments(docs, Date.now()), [docs]);
  const isAdmin = role === 'admin';

  async function handleDelete(d: Document) {
    if (!confirm(`Delete "${d.title}"? This removes the file for everyone.`)) return;
    try {
      await deleteDocument(d);
    } catch {
      alert('Failed to delete the document. Please try again.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        {isAdmin && <Button onClick={() => setShowForm(true)}>Upload document</Button>}
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">No documents available yet.</p>
          </Card>
        ) : (
          visible.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-800 break-words">{d.title}</h3>
                    {d.category && <Badge color="blue">{d.category}</Badge>}
                  </div>
                  {d.description && (
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{d.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {formatBytes(d.size)} · {fmtDateTime(d.createdAt)}
                    {d.uploaderName && <> · {d.uploaderName}</>}
                    {d.expiresAt && <> · shows until {fmtDate(d.expiresAt)}</>}
                  </p>
                  <a
                    href={d.downloadURL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-garden-700 font-medium hover:underline mt-2 inline-block"
                  >
                    Download ↓
                  </a>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => void handleDelete(d)}
                    className="text-gray-400 hover:text-red-600 text-sm shrink-0"
                    aria-label="Delete document"
                  >
                    ✕
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {showForm && isAdmin && (
        <UploadForm
          onClose={() => setShowForm(false)}
          uploadedBy={member?.id ?? ''}
          uploaderName={member?.displayName ?? 'Admin'}
        />
      )}
    </div>
  );
}

function UploadForm({
  onClose,
  uploadedBy,
  uploaderName,
}: {
  onClose: () => void;
  uploadedBy: string;
  uploaderName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    // Default the title to the file's name (minus extension) if none set yet.
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setErr('Please choose a file to upload.');
      return;
    }
    if (!title.trim()) {
      setErr('A title is required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await uploadDocument(file, {
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        expiresAt: expires ? new Date(expires) : null,
        uploadedBy,
        uploaderName,
      });
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Upload failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Upload document">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-600">File (PDF, doc, image…)</label>
          <input type="file" className={inputCls} onChange={onPickFile} />
        </div>
        <input
          className={inputCls}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className={inputCls + ' resize-y'}
          rows={3}
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Category (optional — e.g. Bylaws, Forms, Newsletter)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <div className="space-y-1">
          <label className="text-xs text-gray-600">
            Show until (optional — leave blank to keep it up indefinitely)
          </label>
          <input type="date" className={inputCls} value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
