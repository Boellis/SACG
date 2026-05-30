import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Plot } from '../../lib/types';
import { groupByNumber } from '../../logic/plots';

interface PlotMapProps {
  plots: Plot[];
}

function cellColorClass(plot: Plot): string {
  if (plot.status === 'available') {
    return 'bg-gray-100 border-gray-300 text-gray-700';
  }
  if (plot.duesPaid) {
    return 'bg-garden-100 border-garden-400 text-garden-800';
  }
  return 'bg-amber-100 border-amber-400 text-amber-800';
}

function cellStatusKey(plot: Plot): string {
  if (plot.status === 'available') return 'available';
  if (plot.duesPaid) return 'paid';
  return 'unpaid';
}

export default function PlotMap({ plots }: PlotMapProps) {
  const navigate = useNavigate();
  const grouped = groupByNumber(plots);

  // Sort by number
  const sortedNumbers = Array.from(grouped.keys()).sort((a, b) => a - b);

  // Determine grid layout: use mapPos if available, else numeric order
  const hasMapPos = plots.some((p) => p.mapPos != null);

  if (hasMapPos) {
    // Determine grid dimensions
    let maxRow = 0;
    let maxCol = 0;
    for (const p of plots) {
      if (p.mapPos) {
        if (p.mapPos.row > maxRow) maxRow = p.mapPos.row;
        if (p.mapPos.col > maxCol) maxCol = p.mapPos.col;
      }
    }

    // Build a map by position
    const posMap = new Map<string, Plot>();
    for (const p of plots) {
      if (p.mapPos) {
        posMap.set(`${p.mapPos.row}-${p.mapPos.col}`, p);
      }
    }

    return (
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
              if (!p) {
                return <div key={`${row}-${col}`} />;
              }
              return (
                <button
                  key={p.id}
                  data-status={cellStatusKey(p)}
                  onClick={() => navigate(`/plots/${p.id}`)}
                  className={`rounded-lg border-2 p-2 text-xs font-medium text-center cursor-pointer hover:opacity-80 transition-opacity ${cellColorClass(p)}`}
                >
                  <div className="font-bold">{p.id}</div>
                  <div className="truncate">{p.holderName ?? 'Available'}</div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Numeric order layout
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {sortedNumbers.map((num) => {
        const group = grouped.get(num)!;
        // Sort: whole first, then A, then B
        const sorted = [...group].sort((a, b) => {
          const order = { whole: 0, A: 1, B: 2 };
          return (order[a.half] ?? 0) - (order[b.half] ?? 0);
        });

        return (
          <React.Fragment key={num}>
            {sorted.map((p) => (
              <button
                key={p.id}
                data-status={cellStatusKey(p)}
                onClick={() => navigate(`/plots/${p.id}`)}
                className={`rounded-lg border-2 p-2 text-xs font-medium text-center cursor-pointer hover:opacity-80 transition-opacity ${cellColorClass(p)}`}
              >
                <div className="font-bold">{p.id}</div>
                <div className="truncate">{p.holderName ?? 'Available'}</div>
              </button>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}
