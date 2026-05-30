import { useEffect, useState } from 'react';
import { Badge, Button, Card, Table, Td, Th } from '../../components/ui';
import { computeDuesRollup } from '../../logic/dues';
import type { Plot } from '../../lib/types';
import {
  listenPlots,
  toggleDuesPaid,
  toggleDepositPaid,
  updatePlot,
} from '../plots/plotsApi';

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function DuesPage() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [editingAmount, setEditingAmount] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = listenPlots((data) => {
      setPlots(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const rollup = computeDuesRollup(plots);
  const assignedPlots = plots.filter((p) => p.status === 'assigned');
  const visiblePlots = unpaidOnly ? assignedPlots.filter((p) => !p.duesPaid) : assignedPlots;

  function handleDuesAmountBlur(plotId: string) {
    const raw = editingAmount[plotId];
    if (raw === undefined) return;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      void updatePlot(plotId, { duesAmount: parsed });
    }
    setEditingAmount((prev) => {
      const next = { ...prev };
      delete next[plotId];
      return next;
    });
  }

  if (loading) {
    return <p className="p-6 text-gray-500">Loading…</p>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dues</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-gray-500 mb-1">Expected</p>
          <p className="text-2xl font-semibold text-gray-800">{formatCurrency(rollup.expected)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Collected</p>
          <p className="text-2xl font-semibold text-green-700">{formatCurrency(rollup.collected)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 mb-1">Outstanding</p>
          <p className="text-2xl font-semibold text-amber-700">{formatCurrency(rollup.outstanding)}</p>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <input
          id="unpaid-only"
          type="checkbox"
          checked={unpaidOnly}
          onChange={(e) => setUnpaidOnly(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-garden-600 focus:ring-garden-500"
        />
        <label htmlFor="unpaid-only" className="text-sm text-gray-700 cursor-pointer">
          Show unpaid only
        </label>
      </div>

      {/* Table */}
      {visiblePlots.length === 0 ? (
        <p className="text-gray-500">No assigned plots yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Plot</Th>
              <Th>Holder</Th>
              <Th>Dues Amount</Th>
              <Th>Deposit Paid</Th>
              <Th>Dues Paid</Th>
              <Th>Paid Date</Th>
            </tr>
          </thead>
          <tbody>
            {visiblePlots.map((plot) => {
              const editVal =
                editingAmount[plot.id] !== undefined
                  ? editingAmount[plot.id]
                  : String(plot.duesAmount);

              return (
                <tr key={plot.id}>
                  <Td>{plot.id}</Td>
                  <Td>{plot.holderName ?? '—'}</Td>
                  <Td>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={editVal}
                      onChange={(e) =>
                        setEditingAmount((prev) => ({ ...prev, [plot.id]: e.target.value }))
                      }
                      onBlur={() => handleDuesAmountBlur(plot.id)}
                      className="w-24 border rounded px-2 py-1 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-garden-500"
                      aria-label={`Dues amount for plot ${plot.id}`}
                    />
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      className="text-xs px-2 py-1"
                      onClick={() => void toggleDepositPaid(plot.id, !plot.depositPaid)}
                      aria-label={
                        plot.depositPaid
                          ? `Mark deposit unpaid for plot ${plot.id}`
                          : `Mark deposit paid for plot ${plot.id}`
                      }
                    >
                      <Badge color={plot.depositPaid ? 'green' : 'amber'}>
                        {plot.depositPaid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </Button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Badge color={plot.duesPaid ? 'green' : 'amber'}>
                        {plot.duesPaid ? 'Paid' : 'Unpaid'}
                      </Badge>
                      <Button
                        variant="ghost"
                        className="text-xs px-2 py-1"
                        onClick={() => void toggleDuesPaid(plot.id, !plot.duesPaid)}
                      >
                        {plot.duesPaid ? 'Mark Unpaid' : 'Mark Paid'}
                      </Button>
                    </div>
                  </Td>
                  <Td>
                    {plot.paidDate ? plot.paidDate.toDate().toLocaleDateString() : '—'}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
