import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock plotsApi so no Firestore calls happen
vi.mock('../plots/plotsApi', () => ({
  listenPlots: vi.fn(),
  updatePlot: vi.fn().mockResolvedValue(undefined),
  toggleDuesPaid: vi.fn().mockResolvedValue(undefined),
  toggleDepositPaid: vi.fn().mockResolvedValue(undefined),
}));

// Mock useAuth to return an admin user
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ uid: 'admin-uid', role: 'admin', status: 'active', displayName: 'Admin' }),
}));

// Mock firebase/firestore (not used directly in DuesPage, but needed for module resolution)
vi.mock('firebase/firestore', () => ({}));

import * as plotsApiMod from '../plots/plotsApi';
import DuesPage from './DuesPage';

const mockedListenPlots = vi.mocked(plotsApiMod.listenPlots);
const mockedToggleDuesPaid = vi.mocked(plotsApiMod.toggleDuesPaid);

// Helper to build a fake Plot with required fields
function makePlot(overrides: Record<string, unknown>) {
  return {
    id: 'test-id',
    number: 1,
    half: 'whole',
    status: 'assigned',
    holderName: 'Test Holder',
    duesAmount: 30,
    depositAmount: 25,
    duesPaid: false,
    depositPaid: false,
    paidDate: null,
    season: '2026',
    crops: [],
    notes: '',
    ...overrides,
  };
}

describe('DuesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default fixture: 3 assigned + 1 available
    mockedListenPlots.mockImplementation((cb) => {
      cb([
        makePlot({ id: 'plot-1', number: 1, holderName: 'Alice', duesAmount: 30, duesPaid: true }) as any,
        makePlot({ id: 'plot-2', number: 2, holderName: 'Bob', duesAmount: 20, duesPaid: false }) as any,
        makePlot({ id: 'plot-3', number: 3, holderName: 'Carol', duesAmount: 50, duesPaid: false }) as any,
        makePlot({ id: 'plot-4', number: 4, holderName: null, duesAmount: 30, duesPaid: false, status: 'available' }) as any,
      ]);
      return vi.fn(); // unsubscribe
    });
  });

  it('shows Outstanding of $70.00 (unpaid: 20 + 50)', () => {
    render(
      <MemoryRouter>
        <DuesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('$70.00')).toBeInTheDocument();
  });

  it('shows Collected of $30.00', () => {
    render(
      <MemoryRouter>
        <DuesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });

  it('renders only assigned plots in the table (not available)', () => {
    render(
      <MemoryRouter>
        <DuesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    // plot-4 is available, should not appear (no holderName in assigned rows)
    // The available plot has no holderName so we verify the table only has 3 rows
    const rows = screen.getAllByRole('row');
    // 1 header row + 3 assigned plot rows
    expect(rows).toHaveLength(4);
  });

  it('clicking "Mark Paid" on an unpaid row calls toggleDuesPaid with correct id and true', () => {
    render(
      <MemoryRouter>
        <DuesPage />
      </MemoryRouter>,
    );

    // Bob (plot-2) is unpaid — find their "Mark Paid" button
    const markPaidButtons = screen.getAllByRole('button', { name: /mark paid/i });
    // First one should be for Bob (plot-2, first unpaid)
    fireEvent.click(markPaidButtons[0]);

    expect(mockedToggleDuesPaid).toHaveBeenCalledWith('plot-2', true);
  });

  it('clicking "Mark Unpaid" on a paid row calls toggleDuesPaid with correct id and false', () => {
    render(
      <MemoryRouter>
        <DuesPage />
      </MemoryRouter>,
    );

    // Alice (plot-1) is paid — find her "Mark Unpaid" button
    const markUnpaidButtons = screen.getAllByRole('button', { name: /mark unpaid/i });
    fireEvent.click(markUnpaidButtons[0]);

    expect(mockedToggleDuesPaid).toHaveBeenCalledWith('plot-1', false);
  });

  it('"Show unpaid only" checkbox hides the paid row', () => {
    render(
      <MemoryRouter>
        <DuesPage />
      </MemoryRouter>,
    );

    const checkbox = screen.getByRole('checkbox', { name: /show unpaid only/i });
    fireEvent.click(checkbox);

    // Alice (paid) should no longer be visible
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    // Bob and Carol (unpaid) should still be visible
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });
});
