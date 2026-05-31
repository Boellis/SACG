import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Plot } from '../../lib/types';
import { groupByNumber, plotOccupancy } from '../../logic/plots';
import type { Occupancy } from '../../logic/plots';

interface PlotMapProps {
  plots: Plot[];
}

function cellColorClass(occupancy: Occupancy): string {
  if (occupancy === 'full') return 'bg-garden-100 border-garden-400 text-garden-800';
  if (occupancy === 'partial') return 'bg-amber-100 border-amber-400 text-amber-800';
  return 'bg-gray-100 border-gray-300 text-gray-700';
}

function MapLegend() {
  return (
    <div className="mt-4 flex gap-4 text-xs text-gray-600">
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-garden-300 border border-garden-400" />
        Full
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-amber-200 border border-amber-400" />
        Partial
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-gray-200 border border-gray-300" />
        Empty
      </span>
    </div>
  );
}

const halfOrder: Record<string, number> = { whole: 0, A: 1, B: 2 };
const byNumberThenHalf = (a: Plot, b: Plot) =>
  a.number - b.number || (halfOrder[a.half] ?? 0) - (halfOrder[b.half] ?? 0);

export default function PlotMap({ plots }: PlotMapProps) {
  const navigate = useNavigate();
  const grouped = groupByNumber(plots);

  // A plot's color reflects occupancy of its whole/number group (e.g. both
  // halves of a split plot show "partial" when only one half is assigned).
  function renderCell(p: Plot) {
    const occupancy = plotOccupancy(grouped.get(p.number) ?? [p]);
    return (
      <button
        key={p.id}
        data-occupancy={occupancy}
        onClick={() => navigate(`/plots/${p.id}`)}
        className={`rounded-lg border-2 p-2 text-xs font-medium text-center cursor-pointer hover:opacity-80 transition-opacity ${cellColorClass(occupancy)}`}
      >
        <div className="font-bold">{p.id}</div>
        <div className="truncate">{p.holderName ?? 'Available'}</div>
      </button>
    );
  }

  // Grid layout: only used when at least one plot has an explicit map position.
  // Plots WITHOUT a position are still rendered below the grid so nothing is
  // ever hidden from the map (the table view shows everything; the map must too).
  const placed = plots.filter((p) => p.mapPos != null);

  if (placed.length > 0) {
    const unplaced = plots.filter((p) => p.mapPos == null).sort(byNumberThenHalf);
    let maxRow = 0;
    let maxCol = 0;
    for (const p of placed) {
      if (p.mapPos!.row > maxRow) maxRow = p.mapPos!.row;
      if (p.mapPos!.col > maxCol) maxCol = p.mapPos!.col;
    }
    const posMap = new Map<string, Plot>();
    for (const p of placed) posMap.set(`${p.mapPos!.row}-${p.mapPos!.col}`, p);

    return (
      <div className="space-y-6">
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${maxCol + 1}, minmax(80px, 1fr))`,
              gridTemplateRows: `repeat(${maxRow + 1}, auto)`,
            }}
          >
            {Array.from({ length: maxRow + 1 }, (_, row) =>
              Array.from({ length: maxCol + 1 }, (_, col) => {
                const p = posMap.get(`${row}-${col}`);
                return p ? renderCell(p) : <div key={`empty-${row}-${col}`} />;
              }),
            )}
          </div>
        </div>

        {unplaced.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Unplaced plots ({unplaced.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {unplaced.map((p) => renderCell(p))}
            </div>
          </div>
        )}

        <MapLegend />
      </div>
    );
  }

  // No positions set: lay every plot out in numeric order, split halves adjacent.
  const sortedNumbers = Array.from(grouped.keys()).sort((a, b) => a - b);
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {sortedNumbers.map((num) => {
          const group = [...grouped.get(num)!].sort(byNumberThenHalf);
          return <React.Fragment key={num}>{group.map((p) => renderCell(p))}</React.Fragment>;
        })}
      </div>
      <MapLegend />
    </div>
  );
}
