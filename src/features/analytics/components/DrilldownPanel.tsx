import { Link } from 'react-router-dom';
import { Modal, Table, Th, Td } from '../../../components/ui';

export function DrilldownPanel({ open, onClose, title, columns, rows }: {
  open: boolean; onClose: () => void; title: string;
  columns: string[]; rows: { cells: (string | number)[]; href?: string }[];
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Table>
        <thead><tr>{columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.cells.map((cell, j) => (
                <Td key={j} className={j > 0 ? 'tabular-nums' : ''}>
                  {j === 0 && r.href
                    ? <Link className="underline text-garden-700" to={r.href}>{cell}</Link>
                    : cell}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Modal>
  );
}
