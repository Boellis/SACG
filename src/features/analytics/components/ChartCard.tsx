import { useState } from 'react';
import type { ReactNode } from 'react';
import { Table, Th, Td } from '../../../components/ui';

export function ChartCard({ title, subtitle, empty, table, children }: {
  title: string; subtitle?: string;
  empty?: { when: boolean; message: string };
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const isEmpty = empty?.when ?? false;
  return (
    <section className="alx-card flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--alx-text)' }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>{subtitle}</p>}
        </div>
        {table && !isEmpty && (
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            className="text-xs px-2 py-1 rounded-md border"
            style={{ borderColor: 'var(--alx-border)', color: 'var(--alx-text-2)' }}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </header>
      {isEmpty ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--alx-muted)' }}>{empty!.message}</p>
      ) : showTable && table ? (
        <Table>
          <thead><tr>{table.columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => (
                <Td key={j} className={j > 0 ? 'tabular-nums' : ''}>{cell}</Td>
              ))}</tr>
            ))}
          </tbody>
        </Table>
      ) : children}
    </section>
  );
}
