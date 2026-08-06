import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('firebase/firestore', () => ({}));

// Mock every listener/fetch API the shell's useAnalyticsData hook consumes so no
// Firestore calls happen (same idiom as OverviewTab.test.tsx).
vi.mock('../../plots/plotsApi', () => ({
  listenPlots: vi.fn(),
}));
vi.mock('../../members/membersApi', () => ({
  listenMembers: vi.fn(),
}));
vi.mock('../../hours/hoursApi', () => ({
  listenAllHours: vi.fn(),
}));
vi.mock('../../calendar/eventsApi', () => ({
  listenEvents: vi.fn(),
  fetchRsvps: vi.fn(),
}));
vi.mock('../../forum/forumApi', () => ({
  listenThreads: vi.fn(),
}));
vi.mock('../../polls/pollsApi', () => ({
  listenPolls: vi.fn(),
  fetchVotes: vi.fn(),
}));
vi.mock('../../settings/settingsApi', () => ({
  listenSettings: vi.fn(),
}));

import AnalyticsPage from '../AnalyticsPage';

import * as plotsApiMod from '../../plots/plotsApi';
import * as membersApiMod from '../../members/membersApi';
import * as hoursApiMod from '../../hours/hoursApi';
import * as eventsApiMod from '../../calendar/eventsApi';
import * as forumApiMod from '../../forum/forumApi';
import * as pollsApiMod from '../../polls/pollsApi';
import * as settingsApiMod from '../../settings/settingsApi';

const mockedListenPlots = vi.mocked(plotsApiMod.listenPlots);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedListenAllHours = vi.mocked(hoursApiMod.listenAllHours);
const mockedListenEvents = vi.mocked(eventsApiMod.listenEvents);
const mockedFetchRsvps = vi.mocked(eventsApiMod.fetchRsvps);
const mockedListenThreads = vi.mocked(forumApiMod.listenThreads);
const mockedListenPolls = vi.mocked(pollsApiMod.listenPolls);
const mockedFetchVotes = vi.mocked(pollsApiMod.fetchVotes);
const mockedListenSettings = vi.mocked(settingsApiMod.listenSettings);

// --- fixture factory (mirrors the makePlot idiom in OverviewTab.test.tsx) ---

function makePlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plot-id',
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
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/analytics/*" element={<AnalyticsPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('FinanceTab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockedListenMembers.mockImplementation((cb) => { cb([]); return vi.fn(); });
    // 2 assigned plots: id '1' at $42 unpaid held by "Ada"; id '2' at $69 paid
    // (duesPaid true) with no paidDate — so nothing lands inside any window.
    mockedListenPlots.mockImplementation((cb) => {
      cb([
        makePlot({ id: '1', number: 1, duesAmount: 42, duesPaid: false, holderName: 'Ada' }) as any,
        makePlot({ id: '2', number: 2, duesAmount: 69, duesPaid: true, paidDate: null }) as any,
      ]);
      return vi.fn();
    });
    mockedListenAllHours.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenEvents.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenThreads.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenPolls.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenSettings.mockImplementation((cb) => { cb(null); return vi.fn(); });
    mockedFetchRsvps.mockResolvedValue([]);
    mockedFetchVotes.mockResolvedValue([]);
  });

  it('renders the four finance cards', () => {
    renderAt('/analytics/finance');
    for (const t of ['Dues by size tier', 'Collection over time', 'Deposits', 'Dues rates by season']) {
      expect(screen.getByText(new RegExp(t, 'i'))).toBeInTheDocument();
    }
  });

  it('table twin lists tier rollups', () => {
    renderAt('/analytics/finance');
    const section = screen.getByText('Dues by size tier').closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: /table/i }));
    // $42 legitimately appears more than once in this row (tier label, outstanding,
    // and total all equal $42 for a single fully-unpaid $42 plot) — assert presence
    // via getAllByText rather than getByText, which would throw on >1 match.
    expect(within(section).getAllByText('$42').length).toBeGreaterThan(0);
  });

  it('season table shows current rates with a one-season subtitle in live mode', () => {
    renderAt('/analytics/finance');
    expect(screen.getByText(/one season of recorded rates/i)).toBeInTheDocument();
  });

  it('collection-over-time shows its empty state when nothing was paid in window', () => {
    renderAt('/analytics/finance'); // fixture plot 2 is paid but has no paidDate
    expect(screen.getByText(/no payments recorded in this window/i)).toBeInTheDocument();
  });

  it('unpaid drilldown opens from the card header', () => {
    renderAt('/analytics/finance');
    fireEvent.click(screen.getByRole('button', { name: /view unpaid/i }));
    expect(screen.getByText(/unpaid dues/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1/ })).toHaveAttribute('href', '/plots/1');
  });
});
