import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Badge } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import type { Plot, PlotLayout3D } from '../../lib/types';
import { listenPlot, updatePlot, toggleDuesPaid, toggleDepositPaid, unassignPlot, splitPlot, setPlotLayout3d } from './plotsApi';
import { splitPlotIds } from '../../logic/plots';
import AssignPlotModal from './AssignPlotModal';
import CropsEditor from './CropsEditor';
import PlotLayoutEditor from './PlotLayoutEditor';

// Lazy-loaded so the three.js / R3F bundle is code-split into its own chunk and
// only fetched when a plot detail page is opened (keeps the main app bundle lean).
const PlotLayoutCard = lazy(() => import('./layout3d/PlotLayoutCard'));

function PaidBadge({ paid }: { paid: boolean }) {
  return paid ? <Badge color="green">Paid</Badge> : <Badge color="amber">Unpaid</Badge>;
}

function StatusBadge({ status }: { status: Plot['status'] }) {
  const colorMap: Record<Plot['status'], 'green' | 'amber' | 'gray' | 'blue'> = {
    available: 'gray',
    assigned: 'green',
    reserved: 'blue',
    inactive: 'amber',
  };
  return <Badge color={colorMap[status]}>{status}</Badge>;
}

export default function PlotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { member, role } = useAuth();

  const [plot, setPlot] = useState<Plot | null | undefined>(undefined); // undefined = loading
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  // Edit form state
  const [editSize, setEditSize] = useState('');
  const [editDues, setEditDues] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!id) return;
    const unsub = listenPlot(id, (p) => setPlot(p));
    return unsub;
  }, [id]);

  function startEdit() {
    if (!plot) return;
    setEditSize(plot.size ?? '');
    setEditDues(String(plot.duesAmount));
    setEditNotes(plot.notes ?? '');
    setSaveError('');
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!plot) return;
    setSaving(true);
    setSaveError('');
    try {
      await updatePlot(plot.id, {
        size: editSize.trim() || undefined,
        duesAmount: parseFloat(editDues) || 0,
        notes: editNotes.trim() || undefined,
      });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleDues() {
    if (!plot) return;
    await toggleDuesPaid(plot.id, !plot.duesPaid);
  }

  async function handleToggleDeposit() {
    if (!plot) return;
    await toggleDepositPaid(plot.id, !plot.depositPaid);
  }

  if (plot === undefined) {
    return (
      <div className="p-6 text-gray-500 text-sm">Loading plot…</div>
    );
  }

  if (plot === null) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-medium">Plot not found.</p>
        <Button variant="ghost" onClick={() => navigate('/plots')} className="mt-4">
          Back to Plots
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/plots')}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Plot {plot.id}</h1>
        <StatusBadge status={plot.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Info */}
        <Card title="Plot Info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Number</dt>
              <dd className="font-medium">{plot.number}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Half</dt>
              <dd className="font-medium">{plot.half}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Size</dt>
              <dd className="font-medium">{plot.size || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Season</dt>
              <dd className="font-medium">{plot.season}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Holder</dt>
              <dd className="font-medium">{plot.holderName || '—'}</dd>
            </div>
            {plot.notes && (
              <div className="pt-2 border-t border-gray-100">
                <dt className="text-gray-500 mb-1">Notes</dt>
                <dd className="text-gray-800">{plot.notes}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Dues & Deposit */}
        <Card title="Dues & Deposit">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">Dues Amount</dt>
              <dd className="font-medium">${plot.duesAmount.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">Dues Paid</dt>
              <dd>
                <PaidBadge paid={plot.duesPaid} />
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">Deposit Amount</dt>
              <dd className="font-medium">${plot.depositAmount.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-gray-500">Deposit Paid</dt>
              <dd>
                <PaidBadge paid={plot.depositPaid} />
              </dd>
            </div>
            {plot.paidDate && (
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Paid Date</dt>
                <dd className="font-medium">
                  {plot.paidDate.toDate().toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>

          {role === 'admin' && (
            <div className="mt-4 flex gap-2 pt-4 border-t border-gray-100">
              <Button
                variant={plot.duesPaid ? 'secondary' : 'primary'}
                onClick={handleToggleDues}
                className="text-xs"
              >
                {plot.duesPaid ? 'Mark Dues Unpaid' : 'Mark Dues Paid'}
              </Button>
              <Button
                variant={plot.depositPaid ? 'secondary' : 'primary'}
                onClick={handleToggleDeposit}
                className="text-xs"
              >
                {plot.depositPaid ? 'Mark Deposit Unpaid' : 'Mark Deposit Paid'}
              </Button>
            </div>
          )}
        </Card>

        {/* Holder assignment (admin) */}
        {role === 'admin' && (
          <Card title="Holder">
            {plot.holderMemberId ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-800 font-medium">{plot.holderName}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="text-xs" onClick={() => setAssignOpen(true)}>
                    Reassign
                  </Button>
                  <Button
                    variant="danger"
                    className="text-xs"
                    onClick={async () => {
                      if (confirm('Unassign this plot holder?')) {
                        await unassignPlot(plot.id);
                      }
                    }}
                  >
                    Unassign
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="text-xs" onClick={() => setAssignOpen(true)}>
                Assign holder
              </Button>
            )}
            {plot.half === 'whole' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={async () => {
                    if (confirm('Split this plot into A and B halves? This cannot be undone.')) {
                      await splitPlot(plot);
                      navigate('/plots/' + splitPlotIds(plot.number).a);
                    }
                  }}
                >
                  Split into A/B
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Crops */}
        <Card title="Crops">
          <CropsEditor plot={plot} />
        </Card>

        {/* Plot Layout — existing 2D SVG editor + immersive 3D tool behind a toggle */}
        <Suspense
          fallback={
            <Card title="Plot Layout" className="md:col-span-2">
              <p className="text-sm text-gray-500">Loading layout…</p>
            </Card>
          }
        >
          <PlotLayoutCard
            key={plot.id}
            widthFt={8}
            depthFt={50}
            half={plot.half !== 'whole'}
            layout={plot.layout3d ?? null}
            onSave={(l: PlotLayout3D) => setPlotLayout3d(plot.id, l)}
            readOnly={!(role === 'admin' || plot.holderMemberId === member?.id)}
          >
            <PlotLayoutEditor plot={plot} />
          </PlotLayoutCard>
        </Suspense>

        {assignOpen && (
          <AssignPlotModal open={assignOpen} onClose={() => setAssignOpen(false)} plot={plot} />
        )}

        {/* Admin: edit */}
        {role === 'admin' && (
          <Card title="Edit Plot">
            {editing ? (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="edit-size">
                    Size
                  </label>
                  <input
                    id="edit-size"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    placeholder="e.g. 10x20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="edit-dues">
                    Dues Amount
                  </label>
                  <input
                    id="edit-dues"
                    type="number"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
                    value={editDues}
                    onChange={(e) => setEditDues(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700" htmlFor="edit-notes">
                    Notes
                  </label>
                  <textarea
                    id="edit-notes"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-garden-500"
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
                {saveError && <p className="text-sm text-red-600">{saveError}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={startEdit}>Edit size / dues / notes</Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
