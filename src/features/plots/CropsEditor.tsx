import { useState } from 'react';
import { Button } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import { setCrops } from './plotsApi';
import type { Plot, Crop } from '../../lib/types';

interface Props {
  plot: Plot;
}

interface EditableCrop {
  name: string;
  notes: string;
}

function toEditable(c: Crop): EditableCrop {
  return { name: c.name, notes: c.notes ?? '' };
}

function fromEditable(c: EditableCrop): Crop {
  const crop: Crop = { name: c.name };
  if (c.notes.trim()) crop.notes = c.notes.trim();
  return crop;
}

export default function CropsEditor({ plot }: Props) {
  const { member, role } = useAuth();
  const canEdit = role === 'admin' || member?.id === plot.holderMemberId;

  const [rows, setRows] = useState<EditableCrop[]>(plot.crops.map(toEditable));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const crops = rows.filter((r) => r.name.trim()).map(fromEditable);
      await setCrops(plot.id, crops);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function addRow() {
    setRows((prev) => [...prev, { name: '', notes: '' }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof EditableCrop, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  if (!canEdit) {
    // Read-only chips view
    return (
      <div>
        {plot.crops.length === 0 ? (
          <p className="text-sm text-gray-500">No crops recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {plot.crops.map((c, i) => (
              <li key={i} className="flex justify-between">
                <span className="font-medium">{c.name}</span>
                {c.notes && <span className="text-gray-500">{c.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-sm text-gray-500">No crops yet. Add one below.</p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            aria-label="Crop name"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-garden-500"
            placeholder="Crop name"
            value={row.name}
            onChange={(e) => updateRow(i, 'name', e.target.value)}
          />
          <input
            aria-label="Notes"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-garden-500"
            placeholder="Notes (optional)"
            value={row.notes}
            onChange={(e) => updateRow(i, 'notes', e.target.value)}
          />
          <button
            type="button"
            aria-label="Remove crop"
            onClick={() => removeRow(i)}
            className="text-red-500 hover:text-red-700 text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>
      ))}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" type="button" onClick={addRow} className="text-xs">
          + Add crop
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving} className="text-xs">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
