import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock every listener/fetch API the hook consumes so no Firestore calls happen.
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

// Mock firebase/firestore (not used directly here, but needed for module resolution)
vi.mock('firebase/firestore', () => ({}));

import * as plotsApiMod from '../plots/plotsApi';
import * as membersApiMod from '../members/membersApi';
import * as hoursApiMod from '../hours/hoursApi';
import * as eventsApiMod from '../calendar/eventsApi';
import * as forumApiMod from '../forum/forumApi';
import * as pollsApiMod from '../polls/pollsApi';
import * as settingsApiMod from '../settings/settingsApi';
import { useAnalyticsData } from './useAnalyticsData';

const mockedListenPlots = vi.mocked(plotsApiMod.listenPlots);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedListenAllHours = vi.mocked(hoursApiMod.listenAllHours);
const mockedListenEvents = vi.mocked(eventsApiMod.listenEvents);
const mockedFetchRsvps = vi.mocked(eventsApiMod.fetchRsvps);
const mockedListenThreads = vi.mocked(forumApiMod.listenThreads);
const mockedListenPolls = vi.mocked(pollsApiMod.listenPolls);
const mockedFetchVotes = vi.mocked(pollsApiMod.fetchVotes);
const mockedListenSettings = vi.mocked(settingsApiMod.listenSettings);

// Probe renders the member count so we can distinguish "loading" (data===null)
// from an assembled dataset without reaching into hook internals.
function Probe() {
  const { data } = useAnalyticsData();
  return <div>{data === null ? 'loading' : String(data.members.length)}</div>;
}

// ProbeSettings renders just the settings.requiredHours field.
function ProbeSettings() {
  const { data } = useAnalyticsData();
  return <div>{data?.settings.requiredHours}</div>;
}

// --- fixture factories (mirrors the makePlot/makeMember idiom in Dashboard.test.tsx) ---

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

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-id',
    title: 'Community workday',
    type: 'workday',
    start: { toMillis: () => 0, toDate: () => new Date(0) },
    end: { toMillis: () => 0, toDate: () => new Date(0) },
    allDay: false,
    createdBy: 'mem-id',
    ...overrides,
  };
}

function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thread-id',
    title: 'Thread',
    body: 'body',
    authorId: 'mem-id',
    authorName: 'Test Member',
    createdAt: { toMillis: () => 0, toDate: () => new Date(0) },
    ...overrides,
  };
}

function makePoll(overrides: Record<string, unknown> = {}) {
  return {
    id: 'poll-id',
    question: 'Water schedule?',
    options: [{ id: '0', text: 'Yes' }, { id: '1', text: 'No' }],
    createdAt: { toMillis: () => 0, toDate: () => new Date(0) },
    createdBy: 'mem-id',
    authorName: 'Test Member',
    ...overrides,
  };
}

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    requiredHours: 12,
    firstHalfHours: 6,
    firstHalfMonths: 6,
    defaultDeposit: 25,
    currentSeason: '2026',
    contactEmail: '',
    ...overrides,
  };
}

describe('useAnalyticsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sane defaults for every listener so effect cleanup always has a real
    // unsub function to call, even in tests that don't care about a given
    // listener's fixture. Individual tests override what they need.
    mockedListenMembers.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenPlots.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenAllHours.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenEvents.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenThreads.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenPolls.mockImplementation((cb) => { cb([]); return vi.fn(); });
    mockedListenSettings.mockImplementation((cb) => { cb(null); return vi.fn(); });
    mockedFetchRsvps.mockResolvedValue([]);
    mockedFetchVotes.mockResolvedValue([]);
  });

  it('assembles the dataset from listeners', async () => {
    mockedListenMembers.mockImplementation((cb) => {
      cb([makeMember({ id: 'm1' }) as any, makeMember({ id: 'm2' }) as any]);
      return vi.fn();
    });
    mockedListenPlots.mockImplementation((cb) => {
      cb([makePlot({ id: 'p1' }) as any]);
      return vi.fn();
    });
    mockedListenAllHours.mockImplementation((cb) => {
      cb([makeHour() as any]);
      return vi.fn();
    });
    mockedListenEvents.mockImplementation((cb) => {
      cb([makeEvent({ id: 'e1' }) as any]);
      return vi.fn();
    });
    mockedListenThreads.mockImplementation((cb) => {
      cb([makeThread() as any]);
      return vi.fn();
    });
    mockedListenPolls.mockImplementation((cb) => {
      cb([makePoll({ id: 'poll1' }) as any]);
      return vi.fn();
    });
    mockedListenSettings.mockImplementation((cb) => {
      cb(makeSettings() as any);
      return vi.fn();
    });

    render(<Probe />);
    expect(await screen.findByText('2')).toBeInTheDocument(); // fixture member count

    // one-shot fetches fired for the single event/poll that arrived
    expect(mockedFetchRsvps).toHaveBeenCalledWith('e1');
    expect(mockedFetchVotes).toHaveBeenCalledWith('poll1');
  });

  it('falls back to DEFAULT_ORG_SETTINGS when settings doc is absent', async () => {
    // beforeEach already wires members/plots/hours to cb([]) and settings to cb(null)
    render(<ProbeSettings />);
    expect(await screen.findByText('12')).toBeInTheDocument();
  });

  it('unsubscribes everything on unmount', () => {
    const unsub = vi.fn();
    mockedListenMembers.mockImplementation((cb) => { cb([]); return unsub; });
    mockedListenPlots.mockImplementation((cb) => { cb([]); return unsub; });
    mockedListenAllHours.mockImplementation((cb) => { cb([]); return unsub; });
    mockedListenEvents.mockImplementation((cb) => { cb([]); return unsub; });
    mockedListenThreads.mockImplementation((cb) => { cb([]); return unsub; });
    mockedListenPolls.mockImplementation((cb) => { cb([]); return unsub; });
    mockedListenSettings.mockImplementation((cb) => { cb(null); return unsub; });

    const { unmount } = render(<Probe />);
    unmount();
    expect(unsub).toHaveBeenCalledTimes(7);
  });
});
