import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
vi.mock('firebase/firestore', () => ({}));
import { DeltaBadge } from './DeltaBadge';
import { KpiTile } from './KpiTile';
import { ChartCard } from './ChartCard';
import { DrilldownPanel } from './DrilldownPanel';
import { VIZ } from '../tokens';

describe('DeltaBadge', () => {
  it('renders signed pct with direction arrow', () => {
    render(<DeltaBadge delta={{ pct: 12, dir: 'up' }} goodWhenUp prevLabel="2025 season" />);
    expect(screen.getByText(/▲\s*12%/)).toBeInTheDocument();
    expect(screen.getByText(/vs 2025 season/)).toBeInTheDocument();
  });
  it('renders an em dash when no prior window', () => {
    render(<DeltaBadge delta={{ pct: null, dir: 'flat' }} goodWhenUp prevLabel="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('KpiTile', () => {
  it('shows label, value, detail, sparkline', () => {
    render(
      <KpiTile
        prevLabel="2025 season"
        tokens={VIZ}
        kpi={{ key: 'hours', label: 'Volunteer hours', display: '128', detail: '2026 season',
               delta: { pct: 5, dir: 'up' }, goodWhenUp: true, spark: [1, 2, 3] }}
      />,
    );
    expect(screen.getByText('Volunteer hours')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeNull(); // sparkline
  });
});

describe('ChartCard', () => {
  it('renders children normally and the empty state when empty.when', () => {
    const { rerender } = render(
      <ChartCard title="Hours"><div data-testid="chart" /></ChartCard>,
    );
    expect(screen.getByTestId('chart')).toBeInTheDocument();
    rerender(
      <ChartCard title="Hours" empty={{ when: true, message: 'No hours logged in this window' }}>
        <div data-testid="chart" />
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByText('No hours logged in this window')).toBeInTheDocument();
  });
  it('table toggle swaps chart for the table twin', () => {
    render(
      <ChartCard title="Hours" table={{ columns: ['Week', 'Hours'], rows: [['Mar 2', 4]] }}>
        <div data-testid="chart" />
      </ChartCard>,
    );
    fireEvent.click(screen.getByRole('button', { name: /table/i }));
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByText('Mar 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /chart/i }));
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });
});

describe('DrilldownPanel', () => {
  it('lists rows with links when open', () => {
    render(
      <MemoryRouter>
        <DrilldownPanel
          open onClose={() => {}} title="Unpaid plots"
          columns={['Plot', 'Holder', 'Amount']}
          rows={[{ cells: ['12', 'Ada', '$42'], href: '/plots/12' }]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Unpaid plots')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /12/ })).toHaveAttribute('href', '/plots/12');
  });
});
