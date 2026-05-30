import { useEffect, useState } from 'react';
import { Modal, Button, Badge } from '../../components/ui';
import { listenMembers } from '../members/membersApi';
import { assignPlot } from './plotsApi';
import type { Plot, Member } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  plot: Plot;
}

export default function AssignPlotModal({ open, onClose, plot }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = listenMembers((all) => {
      setMembers(all.filter((m) => m.status === 'active' || m.status === 'pending'));
    });
    return unsub;
  }, []);

  // Reset selection when modal opens/closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(null);
      setError('');
    }
  }, [open]);

  const filtered = query.trim()
    ? members.filter(
        (m) =>
          m.displayName.toLowerCase().includes(query.toLowerCase()) ||
          m.email.toLowerCase().includes(query.toLowerCase()),
      )
    : members;

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await assignPlot(plot, selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign plot.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign Plot Holder">
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500"
        />

        <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No members found.</li>
          ) : (
            filtered.map((m) => (
              <li
                key={m.id}
                onClick={() => setSelected(m)}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-garden-50 ${
                  selected?.id === m.id ? 'bg-garden-100' : ''
                }`}
              >
                <span className="font-medium text-gray-800">{m.displayName}</span>
                <span className="text-gray-500 text-xs">{m.email}</span>
                {m.status === 'pending' && (
                  <Badge color="amber">pending</Badge>
                )}
              </li>
            ))
          )}
        </ul>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || saving}>
            {saving ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
