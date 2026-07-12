import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui';
import { listenMembers } from '../members/membersApi';
import { setPlotHolders } from './plotsApi';
import { plotHolderIds } from '../../logic/plots';
import type { Plot, Member } from '../../lib/types';

/**
 * Admin control for a plot's gardeners (multi-holder). Lists every current
 * holder with a Remove button and an "Add gardener" member picker. Writes the
 * full holder list via {@link setPlotHolders}; the first holder is the primary.
 */
export default function PlotGardeners({ plot }: { plot: Plot }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => listenMembers(setMembers), []);

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const holderIds = plotHolderIds(plot);
  const holders = holderIds.map((id) => ({
    id,
    name: byId.get(id)?.displayName ?? plot.holderName ?? 'Gardener',
  }));

  async function commit(next: { id: string; name: string }[]) {
    setBusy(true);
    setError('');
    try {
      await setPlotHolders(plot.id, next);
      setAdding(false);
      setQuery('');
    } catch (e) {
      setError((e as Error)?.message ?? 'Failed to update gardeners.');
    } finally {
      setBusy(false);
    }
  }

  const remove = (id: string) => commit(holders.filter((h) => h.id !== id));
  const add = (m: Member) => commit([...holders, { id: m.id, name: m.displayName }]);

  const candidates = members
    .filter((m) => m.status === 'active' && !holderIds.includes(m.id))
    .filter(
      (m) =>
        !query.trim() ||
        m.displayName.toLowerCase().includes(query.toLowerCase()) ||
        m.email.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {holders.length === 0 ? (
          <li className="text-sm text-gray-500">No gardeners assigned.</li>
        ) : (
          holders.map((h, i) => (
            <li key={h.id} className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-800">
                {h.name}
                {i === 0 && <span className="ml-1 text-xs text-gray-400">(primary)</span>}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(h.id)}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {adding ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500"
          />
          <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {candidates.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No members found.</li>
            ) : (
              candidates.map((m) => (
                <li
                  key={m.id}
                  onClick={() => !busy && add(m)}
                  className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-garden-50"
                >
                  <span className="font-medium text-gray-800">{m.displayName}</span>
                  <span className="text-gray-500 text-xs">{m.email}</span>
                </li>
              ))
            )}
          </ul>
          <Button
            variant="ghost"
            className="text-xs"
            onClick={() => {
              setAdding(false);
              setQuery('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="text-xs" onClick={() => setAdding(true)} disabled={busy}>
          + Add gardener
        </Button>
      )}
    </div>
  );
}
