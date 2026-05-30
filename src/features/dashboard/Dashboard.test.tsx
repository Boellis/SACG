import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock plotsApi so no Firestore calls happen
vi.mock('../plots/plotsApi', () => ({
  listenPlots: vi.fn(),
}));

// Mock membersApi so no Firestore calls happen
vi.mock('../members/membersApi', () => ({
  listenMembers: vi.fn(),
}));

// Mock hoursApi so no Firestore calls happen
vi.mock('../hours/hoursApi', () => ({
  listenMemberHours: vi.fn(),
  listenAllHours: vi.fn(),
}));

// Mock firebase/firestore (not used directly in Dashboard, but needed for module resolution)
vi.mock('firebase/firestore', () => ({}));

// Mock useAuth – we'll override the return value per-suite via vi.mocked
vi.mock('../../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

import * as plotsApiMod from '../plots/plotsApi';
import * as membersApiMod from '../members/membersApi';
import * as hoursApiMod from '../hours/hoursApi';
import * as useAuthMod from '../../auth/useAuth';
import Dashboard from './Dashboard';

const mockedListenPlots = vi.mocked(plotsApiMod.listenPlots);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedListenMemberHours = vi.mocked(hoursApiMod.listenMemberHours);
const mockedListenAllHours = vi.mocked(hoursApiMod.listenAllHours);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

// Helper to build a fake Plot with required fields
function makePlot(overrides: Record<string, unknown>) {
  return {
    id: 'test-id',
    number: 1,
    half: 'whole',
    status: 'assigned',
    holderMemberId: null,
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

// Helper to build a fake Member with required fields
function makeMember(overrides: Record<string, unknown>) {
  return {
    id: 'mem-id',
    uid: null,
    email: 'test@test.com',
    displayName: 'Test Member',
    role: 'member',
    status: 'active',
    createdAt: { toMillis: () => 0 },
    currentYearHours: 0,
    ...overrides,
  };
}

describe('Dashboard — Admin view', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      user: null,
      role: 'admin',
      status: 'active',
      loading: false,
      member: makeMember({ id: 'admin-uid', displayName: 'Ada' }) as any,
    });

    // 3 plots: 2 assigned (one unpaid $40, one paid), 1 available
    mockedListenPlots.mockImplementation((cb) => {
      cb([
        makePlot({ id: 'plot-1', number: 1, status: 'assigned', holderMemberId: 'm1', duesAmount: 40, duesPaid: false }) as any,
        makePlot({ id: 'plot-2', number: 2, status: 'assigned', holderMemberId: 'm2', duesAmount: 30, duesPaid: true }) as any,
        makePlot({ id: 'plot-3', number: 3, status: 'available', holderMemberId: null, duesAmount: 0, duesPaid: false }) as any,
      ]);
      return vi.fn();
    });

    // 3 members: 2 active, 1 pending
    mockedListenMembers.mockImplementation((cb) => {
      cb([
        makeMember({ id: 'm1', status: 'active', createdAt: { toMillis: () => 1000 } }) as any,
        makeMember({ id: 'm2', status: 'active', createdAt: { toMillis: () => 2000 } }) as any,
        makeMember({ id: 'm3', status: 'pending', createdAt: { toMillis: () => 3000 } }) as any,
      ]);
      return vi.fn();
    });

    // All hours (admin community total)
    mockedListenAllHours.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });
  });

  it('shows occupied 2/3 plots', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('shows outstanding $40.00', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('$40.00')).toBeInTheDocument();
  });

  it('shows 2 active members', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    // The "2" active members card – use getAllByText since "1" also appears (waitlist)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('shows 1 waitlist pending', () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });
});

describe('Dashboard — Member view', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      user: null,
      role: 'member',
      status: 'active',
      loading: false,
      member: makeMember({ id: 'm1', displayName: 'Rosa', currentYearHours: 4 }) as any,
    });

    // Plots: one held by m1 (unpaid), one held by m2 (not theirs), one available
    mockedListenPlots.mockImplementation((cb) => {
      cb([
        makePlot({ id: 'plot-A', number: 5, status: 'assigned', holderMemberId: 'm1', duesAmount: 30, duesPaid: false }) as any,
        makePlot({ id: 'plot-B', number: 6, status: 'assigned', holderMemberId: 'm2', duesAmount: 30, duesPaid: true }) as any,
        makePlot({ id: 'plot-C', number: 7, status: 'available', holderMemberId: null, duesAmount: 0, duesPaid: false }) as any,
      ]);
      return vi.fn();
    });

    // listenMembers not called by member view, but mock to avoid unhandled
    mockedListenMembers.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });

    // Member hours – 4 hours in 2026
    mockedListenMemberHours.mockImplementation((_id, cb) => {
      cb([
        {
          id: 'h1',
          memberId: 'm1',
          date: { toDate: () => new Date('2026-03-01T00:00:00Z') },
          hours: 4,
          recordedBy: 'm1',
          createdAt: { toDate: () => new Date('2026-03-01T00:00:00Z') },
        },
      ] as any);
      return vi.fn();
    });
  });

  it("shows their own plot id but not others' plot ids", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    // Their plot is plot-A
    expect(screen.getByText('plot-A')).toBeInTheDocument();
    // Other plots should not appear
    expect(screen.queryByText('plot-B')).not.toBeInTheDocument();
    expect(screen.queryByText('plot-C')).not.toBeInTheDocument();
  });

  it('shows volunteer hours 4 / 12', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    // hours come from live entries via listenMemberHours (4 hrs from fixture)
    expect(await screen.findByText(/4\s*\/\s*12/)).toBeInTheDocument();
  });
});
