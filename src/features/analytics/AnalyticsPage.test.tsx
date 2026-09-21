import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('firebase/firestore', () => ({}));

// Mock every listener/fetch API the shell's useAnalyticsData hook consumes so no
// Firestore calls happen (same idiom as useAnalyticsData.test.tsx).
vi.mock('../plots/plotsApi', () => ({
  listenPlots: vi.fn(),
}));
vi.mock('../members/membersApi', () => ({
  listenMembers: vi.fn(),
}));
vi.mock('../hours/hoursApi', () => ({
  listenAllHours: vi.fn(),
}));
vi.mock('../calendar/eventsApi', () => ({
  listenEvents: vi.fn(),
  fetchRsvps: vi.fn(),
}));
vi.mock('../forum/forumApi', () => ({
  listenThreads: vi.fn(),
}));
vi.mock('../polls/pollsApi', () => ({
  listenPolls: vi.fn(),
  fetchVotes: vi.fn(),
}));
vi.mock('../settings/settingsApi', () => ({
  listenSettings: vi.fn(),
}));

import AnalyticsPage from './AnalyticsPage';
import * as plotsApiMod from '../plots/plotsApi';
import * as membersApiMod from '../members/membersApi';
import * as hoursApiMod from '../hours/hoursApi';
import * as eventsApiMod from '../calendar/eventsApi';
import * as forumApiMod from '../forum/forumApi';
import * as pollsApiMod from '../polls/pollsApi';
import * as settingsApiMod from '../settings/settingsApi';

const mockedListenPlots = vi.mocked(plotsApiMod.listenPlots);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedListenAllHours = vi.mocked(hoursApiMod.listenAllHours);
const mockedListenEvents = vi.mocked(eventsApiMod.listenEvents);
const mockedFetchRsvps = vi.mocked(eventsApiMod.fetchRsvps);
const mockedListenThreads = vi.mocked(forumApiMod.listenThreads);
const mockedListenPolls = vi.mocked(pollsApiMod.listenPolls);
const mockedFetchVotes = vi.mocked(pollsApiMod.fetchVotes);
const mockedListenSettings = vi.mocked(settingsApiMod.listenSettings);

// --- fixture factories (mirrors the makePlot/makeMember idiom in useAnalyticsData.test.tsx) ---

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

function makeHour(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hour-id',
    memberId: 'mem-id',
    date: { toMillis: () => 0, toDate: () => new Date(0) },
    hours: 1,
    recordedBy: 'mem-id',
    createdAt: { toMillis: () => 0, toDate: () => new Date(0) },
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

describe('AnalyticsPage', () => {
  beforeEach(() => {
    // Reset mocks to fixtures: 2 members (1 active, 1 pending), 2 plots, 1 hours
    // entry, empty events/threads/polls, settings null, fetchRsvps/fetchVotes -> [].
    vi.clearAllMocks();
    mockedListenMembers.mockImplementation((cb) => {
      cb([
        makeMember({ id: 'm1', status: 'active' }) as any,
        makeMember({ id: 'm2', status: 'pending' }) as any,
      ]);
      return vi.fn();
    });
    mockedListenPlots.mockImplementation((cb) => {
      cb([
        makePlot({ id: 'p1', number: 1 }) as any,
        makePlot({ id: 'p2', number: 2 }) as any,
      ]);
      return vi.fn();
    });
    mockedListenAllHours.mockImplementation((cb) => {
      cb([makeHour() as any]);
      return vi.fn();
    });
    mockedListenEvents.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenThreads.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenPolls.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenSettings.mockImplementation((cb) => { cb(null); return vi.fn(); });
    mockedFetchRsvps.mockResolvedValue([]);
    mockedFetchVotes.mockResolvedValue([]);
  });

  it('renders the Overview tab by default with header controls', () => {
    renderAt('/analytics');
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print committee report/i })).toBeInTheDocument();
  });
  it('routes tabs by URL', () => {
    renderAt('/analytics/finance');
    expect(screen.getByTestId('tab-finance')).toBeInTheDocument();
  });
  it('date-range change reaches tabs through context', () => {
    renderAt('/analytics');
    fireEvent.click(screen.getByRole('button', { name: /last 90 days/i }));
    expect(screen.getByTestId('tab-overview')).toHaveTextContent('Last 90 days');
  });
});
