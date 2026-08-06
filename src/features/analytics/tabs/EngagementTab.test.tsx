import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('firebase/firestore', () => ({}));

// Mock every listener/fetch API the shell's useAnalyticsData hook consumes so no
// Firestore calls happen (same idiom as OverviewTab.test.tsx / OperationsTab.test.tsx).
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

// --- fixture factories (mirrors the makeMember/makeHour idiom in OverviewTab.test.tsx) ---

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

// hoursCohorts/participationSeries key off `now`, so fixture dates are built from
// Date.now() offsets rather than fixed dates (same idiom as OperationsTab.test.tsx).
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

describe('EngagementTab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockedListenMembers.mockImplementation((cb) => {
      cb([
        makeMember({ id: 'm1', displayName: 'Ada', status: 'active' }) as any,
        makeMember({ id: 'm2', displayName: 'Rosa', status: 'active' }) as any,
      ]);
      return vi.fn();
    });
    mockedListenPlots.mockImplementation((cb) => { cb([]); return vi.fn(); });
    // Ada logged 3h ~30 days ago -> lands inside the default "This season" window.
    mockedListenAllHours.mockImplementation((cb) => {
      cb([makeHour({ id: 'h1', memberId: 'm1', hours: 3, date: daysAgo(30) }) as any]);
      return vi.fn();
    });
    mockedListenEvents.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenThreads.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenPolls.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenSettings.mockImplementation((cb) => { cb(null); return vi.fn(); });
    mockedFetchRsvps.mockResolvedValue([]);
    mockedFetchVotes.mockResolvedValue([]);
  });

  it('renders the engagement cards', () => {
    renderAt('/analytics/engagement');
    for (const t of ['Hours requirement', 'Participation trend', 'Top volunteers', 'Event RSVPs', 'Forum threads', 'Poll votes']) {
      expect(screen.getByText(new RegExp(t, 'i'))).toBeInTheDocument();
    }
  });

  it('cohort table twin lists On track and Behind (status colors are never the only signal)', () => {
    renderAt('/analytics/engagement');
    fireEvent.click(within(screen.getByText('Hours requirement').closest('section')!)
      .getByRole('button', { name: /table/i }));
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
  });

  it('top volunteers links the member admin page', () => {
    renderAt('/analytics/engagement');
    expect(screen.getByRole('link', { name: /ada/i })).toHaveAttribute('href', '/members/m1');
  });

  it('RSVP card shows its empty state with no events in window', () => {
    renderAt('/analytics/engagement');
    expect(screen.getByText(/no events in this window/i)).toBeInTheDocument();
  });
});
