import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('firebase/firestore', () => ({}));

// Mock every listener/fetch API the shell's useAnalyticsData hook consumes so no
// Firestore calls happen (same idiom as OverviewTab.test.tsx / FinanceTab.test.tsx).
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

// --- fixture factories (mirrors the makePlot/makeMember idiom in OverviewTab.test.tsx) ---

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-id',
    uid: null,
    email: 'test@test.com',
    displayName: 'Test Member',
    role: 'member',
    status: 'active',
    createdAt: { toMillis: () => 0, toDate: () => new Date(0) },
    currentYearHours: 0,
    ...overrides,
  };
}

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

// The tab computes upkeep tiers against `new Date()` (via the shell's `now`), so
// fixture timestamps must be built from Date.now() offsets rather than fixed dates.
const daysAgo = (n: number) => ({
  toDate: () => new Date(Date.now() - n * 86400000),
  toMillis: () => Date.now() - n * 86400000,
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/analytics/*" element={<AnalyticsPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('OperationsTab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockedListenMembers.mockImplementation((cb) => {
      cb([
        makeMember({ id: 'm1', status: 'active' }) as any,
        makeMember({ id: 'm2', status: 'pending' }) as any,
      ]);
      return vi.fn();
    });
    // plot 1: assigned, no crops, watered 45 days ago (stale -> attention), held by Ada
    // plot 2: assigned, fresh-planted kale (10 days ago -> thriving)
    // plot 3: available (excluded from upkeep distribution; counts toward "open")
    mockedListenPlots.mockImplementation((cb) => {
      cb([
        makePlot({
          id: '1', number: 1, status: 'assigned', holderName: 'Ada', crops: [], lastWateredAt: daysAgo(45),
        }) as any,
        makePlot({
          id: '2', number: 2, status: 'assigned', crops: [{ name: 'kale', plantedOn: daysAgo(10) }],
        }) as any,
        makePlot({ id: '3', number: 3, status: 'available' }) as any,
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

  it('renders the operations cards', () => {
    renderAt('/analytics/operations');
    for (const t of ['Plot upkeep', 'Needs attention', 'Crop popularity', 'Split-plot utilization', 'Open plots vs waitlist']) {
      expect(screen.getByText(new RegExp(t, 'i'))).toBeInTheDocument();
    }
  });

  it('upkeep legend pairs icon + label + count (never color alone)', () => {
    renderAt('/analytics/operations');
    expect(screen.getByText(/thriving/i)).toBeInTheDocument();
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
  });

  it('attention list links to the plot', () => {
    renderAt('/analytics/operations');
    expect(screen.getByRole('link', { name: /plot 1/i })).toHaveAttribute('href', '/plots/1');
  });

  it('crop table twin lists kale', () => {
    renderAt('/analytics/operations');
    fireEvent.click(within(screen.getByText('Crop popularity').closest('section')!)
      .getByRole('button', { name: /table/i }));
    expect(screen.getByText('kale')).toBeInTheDocument();
  });

  it('states the waitlist-vs-open-plots line', () => {
    renderAt('/analytics/operations');
    expect(screen.getByText(/1 (person|people) waiting for 1 open plot/i)).toBeInTheDocument();
  });
});
