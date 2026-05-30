import { useEffect, useState } from 'react';
import { Button, Card, Badge, Modal, Field, Table, Th, Td } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import type { Plot } from '../../lib/types';
import { listenPlots, createPlot } from './plotsApi';
import PlotMap from './PlotMap';

type ViewMode = 'map' | 'table';

function PaidBadge({ paid }: { paid: boolean }) {
  return paid ? <Badge color="green">Paid</Badge> : <Badge color="amber">Unpaid</Badge>;
}

export default function PlotsPage() {
  const { role } = useAuth();
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('map');
  const [showAdd, setShowAdd] = useState(false);

  // Form state
  const [formId, setFormId] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formSize, setFormSize] = useState('');
  const [formDues, setFormDues] = useState('');
  const [formSeason, setFormSeason] = useState(new Date().getFullYear().toString());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = listenPlots((data) => {
      setPlots(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleAddPlot(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!formId.trim() || !formNumber.trim()) {
      setFormError('ID and number are required.');
      return;
    }
    const num = parseInt(formNumber, 10);
    if (isNaN(num)) {
      setFormError('Number must be a valid integer.');
      return;
    }
    setSaving(true);
    try {
      await createPlot({
        id: formId.trim(),
        number: num,
        size: formSize.trim() || undefined,
        duesAmount: formDues ? parseFloat(formDues) : undefined,
        season: formSeason.trim() || new Date().getFullYear().toString(),
      });
      setShowAdd(false);
      setFormId('');
      setFormNumber('');
      setFormSize('');
      setFormDues('');
      setFormSeason(new Date().getFullYear().toString());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create plot.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Plots</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('map')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'map'
                  ? 'bg-garden-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'table'
                  ? 'bg-garden-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Table
            </button>
          </div>
          {role === 'admin' && (
            <Button onClick={() => setShowAdd(true)}>Add plot</Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <p className="text-gray-500 text-sm">Loading plots…</p>
        </Card>
      ) : plots.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-sm">No plots yet.</p>
        </Card>
      ) : view === 'map' ? (
        <Card>
          <PlotMap plots={plots} />
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Holder</Th>
              <Th>Dues Amount</Th>
              <Th>Dues Paid</Th>
              <Th>Season</Th>
            </tr>
          </thead>
          <tbody>
            {plots.map((p) => (
              <tr key={p.id}>
                <Td>{p.id}</Td>
                <Td>{p.holderName ?? <span className="text-gray-400">—</span>}</Td>
                <Td>${p.duesAmount.toFixed(2)}</Td>
                <Td>
                  <PaidBadge paid={p.duesPaid} />
                </Td>
                <Td>{p.season}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Plot">
        <form onSubmit={handleAddPlot} className="space-y-4">
          <Field
            label="Plot ID"
            placeholder="e.g. 12 or 12A"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
          />
          <Field
            label="Number"
            type="number"
            placeholder="e.g. 12"
            value={formNumber}
            onChange={(e) => setFormNumber(e.target.value)}
          />
          <Field
            label="Size"
            placeholder="e.g. 10x20"
            value={formSize}
            onChange={(e) => setFormSize(e.target.value)}
          />
          <Field
            label="Dues Amount"
            type="number"
            placeholder="e.g. 50"
            value={formDues}
            onChange={(e) => setFormDues(e.target.value)}
          />
          <Field
            label="Season"
            placeholder="e.g. 2026"
            value={formSeason}
            onChange={(e) => setFormSeason(e.target.value)}
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
