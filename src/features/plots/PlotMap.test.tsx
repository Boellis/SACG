import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import PlotMap from './PlotMap';
import type { Plot } from '../../lib/types';

// Mock firebase/firestore to avoid initialization in transitive imports
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(() => vi.fn()),
  collection: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

const makeTimestamp = () => ({
  toDate: () => new Date(),
  seconds: 0,
  nanoseconds: 0,
  toMillis: () => 0,
  isEqual: () => false,
} as unknown as import('firebase/firestore').Timestamp);

const fixture: Plot[] = [
  {
    id: '5',
    number: 5,
    half: 'whole',
    status: 'available',
    duesAmount: 50,
    depositAmount: 25,
    duesPaid: false,
    depositPaid: false,
    season: '2026',
    crops: [],
  },
  {
    id: '3',
    number: 3,
    half: 'whole',
    status: 'assigned',
    holderMemberId: 'uid-1',
    holderName: 'Alice Smith',
    duesAmount: 60,
    depositAmount: 25,
    duesPaid: true,
    depositPaid: true,
    paidDate: makeTimestamp(),
    season: '2026',
    crops: [],
  },
  {
    id: '7A',
    number: 7,
    half: 'A',
    status: 'assigned',
    holderMemberId: 'uid-2',
    holderName: 'Bob Jones',
    duesAmount: 30,
    depositAmount: 25,
    duesPaid: false,
    depositPaid: false,
    season: '2026',
    crops: [],
  },
  {
    id: '7B',
    number: 7,
    half: 'B',
    status: 'available',
    duesAmount: 30,
    depositAmount: 25,
    duesPaid: false,
    depositPaid: false,
    season: '2026',
    crops: [],
  },
];

describe('PlotMap', () => {
  it('renders all plot cells', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7A')).toBeInTheDocument();
    expect(screen.getByText('7B')).toBeInTheDocument();
  });

  it('shows "Available" for plots without a holder', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    // Plot 5 is available with no holder, Plot 7B is available with no holder
    const availableCells = screen.getAllByText('Available');
    expect(availableCells.length).toBeGreaterThanOrEqual(2);
  });

  it('shows holder name for assigned plots', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('uses data-status="available" for available plot', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    const buttons = document.querySelectorAll('[data-status]');
    const statusMap = new Map<string, string>();
    buttons.forEach((btn) => {
      const id = btn.querySelector('div')?.textContent;
      if (id) statusMap.set(id, btn.getAttribute('data-status') ?? '');
    });

    expect(statusMap.get('5')).toBe('available');
    expect(statusMap.get('7B')).toBe('available');
  });

  it('uses data-status="paid" for assigned+duesPaid plot', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    const buttons = document.querySelectorAll('[data-status]');
    const statusMap = new Map<string, string>();
    buttons.forEach((btn) => {
      const id = btn.querySelector('div')?.textContent;
      if (id) statusMap.set(id, btn.getAttribute('data-status') ?? '');
    });

    expect(statusMap.get('3')).toBe('paid');
  });

  it('uses data-status="unpaid" for assigned+!duesPaid plot', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    const buttons = document.querySelectorAll('[data-status]');
    const statusMap = new Map<string, string>();
    buttons.forEach((btn) => {
      const id = btn.querySelector('div')?.textContent;
      if (id) statusMap.set(id, btn.getAttribute('data-status') ?? '');
    });

    expect(statusMap.get('7A')).toBe('unpaid');
  });

  it('renders both halves of a split plot (7A and 7B)', () => {
    render(
      <MemoryRouter>
        <PlotMap plots={fixture} />
      </MemoryRouter>,
    );

    expect(screen.getByText('7A')).toBeInTheDocument();
    expect(screen.getByText('7B')).toBeInTheDocument();
  });
});
