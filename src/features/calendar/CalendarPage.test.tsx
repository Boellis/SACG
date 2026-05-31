import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';

// Mock eventsApi before importing the component
vi.mock('./eventsApi', () => ({
  listenEvents: vi.fn(),
  listenRsvps: vi.fn(),
  createEvent: vi.fn().mockResolvedValue(undefined),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  setRsvp: vi.fn().mockResolvedValue(undefined),
}));

// Mock membersApi
vi.mock('../members/membersApi', () => ({
  listenMembers: vi.fn(),
}));

// Mock useAuth
vi.mock('../../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock firebase/firestore (needed for module resolution)
vi.mock('firebase/firestore', () => ({
  Timestamp: {
    fromDate: vi.fn((d: Date) => ({
      toDate: () => d,
      seconds: Math.floor(d.getTime() / 1000),
    })),
  },
}));

// Mock firebase lib
vi.mock('../../lib/firebase', () => ({
  auth: {},
  db: {},
  app: {},
}));

import * as eventsApiMod from './eventsApi';
import * as membersApiMod from '../members/membersApi';
import * as useAuthMod from '../../auth/useAuth';
import CalendarPage from './CalendarPage';

const mockedListenEvents = vi.mocked(eventsApiMod.listenEvents);
const mockedListenRsvps = vi.mocked(eventsApiMod.listenRsvps);
const mockedSetRsvp = vi.mocked(eventsApiMod.setRsvp);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

/** Build a fake GardenEvent fixture */
function makeEvent(overrides: Partial<{
  id: string;
  title: string;
  type: 'workday' | 'meeting' | 'other';
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  location: string;
  description: string;
}> = {}) {
  const startDate = overrides.startDate ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
  const endDate = overrides.endDate ?? new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  return {
    id: overrides.id ?? 'event-1',
    title: overrides.title ?? 'Garden Workday',
    type: overrides.type ?? 'workday',
    start: { toDate: () => startDate } as unknown as Timestamp,
    end: { toDate: () => endDate } as unknown as Timestamp,
    allDay: overrides.allDay ?? false,
    location: overrides.location,
    description: overrides.description,
    createdBy: 'admin-uid',
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-uid',
    uid: 'member-uid',
    email: 'member@test.com',
    displayName: 'Test Member',
    role: 'member',
    status: 'active',
    currentYearHours: 0,
    createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    ...overrides,
  };
}

/** 2 active members + 1 pending — fixture for email tests */
const memberFixtures = [
  makeMember({ id: 'active-1', email: 'alice@test.com', displayName: 'Alice', status: 'active' }),
  makeMember({ id: 'active-2', email: 'bob@test.com', displayName: 'Bob', status: 'active' }),
  makeMember({ id: 'pending-1', email: 'pending@test.com', displayName: 'Pending User', status: 'pending' }),
];

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: member auth
    mockedUseAuth.mockReturnValue({
      user: { uid: 'member-uid' } as any,
      member: makeMember() as any,
      role: 'member',
      status: 'active',
      loading: false,
    });

    // Default: listenRsvps yields empty
    mockedListenRsvps.mockImplementation((_eventId, cb) => {
      cb([]);
      return vi.fn();
    });

    // Default: listenMembers yields fixture members
    mockedListenMembers.mockImplementation((cb) => {
      cb(memberFixtures as any);
      return vi.fn();
    });
  });

  it('renders event title in the upcoming list', () => {
    const fixture = makeEvent({ title: 'Spring Cleanup Workday' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Spring Cleanup Workday')).toBeInTheDocument();
  });

  it('shows the Upcoming Events section heading', () => {
    mockedListenEvents.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
  });

  it('shows "No upcoming events" when list is empty', () => {
    mockedListenEvents.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No upcoming events.')).toBeInTheDocument();
  });

  it('clicking an event opens detail modal with title', async () => {
    const fixture = makeEvent({ title: 'Board Meeting' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    // Click the event in upcoming list
    fireEvent.click(screen.getByText('Board Meeting'));

    // Modal should show title (the modal heading is the same text; look for the RSVP section)
    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });
  });

  it('clicking Yes in modal calls setRsvp with member id and "yes"', async () => {
    const fixture = makeEvent({ id: 'event-test-1', title: 'Harvest Fest' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    // Open modal
    fireEvent.click(screen.getByText('Harvest Fest'));

    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });

    // Click Yes
    const yesButton = screen.getByRole('button', { name: /^yes$/i });
    fireEvent.click(yesButton);

    await waitFor(() => {
      expect(mockedSetRsvp).toHaveBeenCalledWith(
        'event-test-1',
        'member-uid',
        'yes',
        'Test Member',
      );
    });
  });

  it('does not show "New event" button for regular members', () => {
    mockedListenEvents.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('+ New Event')).not.toBeInTheDocument();
  });

  it('shows "New event" button for admins', () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'admin-uid' } as any,
      member: makeMember({ id: 'admin-uid', role: 'admin' }) as any,
      role: 'admin',
      status: 'active',
      loading: false,
    });

    mockedListenEvents.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('+ New Event')).toBeInTheDocument();
  });

  it('shows RSVP counts in event modal', async () => {
    const fixture = makeEvent({ id: 'event-rsvp-1', title: 'Rsvp Test Event' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    mockedListenRsvps.mockImplementation((_eventId, cb) => {
      cb([
        { id: 'user-a', status: 'yes', displayName: 'Alice', respondedAt: {} as any },
        { id: 'user-b', status: 'yes', displayName: 'Bob', respondedAt: {} as any },
        { id: 'user-c', status: 'no', displayName: 'Carol', respondedAt: {} as any },
      ]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Rsvp Test Event'));

    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });

    // RSVP count row shows "2 yes", "0 maybe", "1 no" — check labels visible
    // The yes/maybe/no text appear as plain text spans in the count row
    const allYesElements = screen.getAllByText('yes');
    // At least one should be in the count row (not the button)
    expect(allYesElements.length).toBeGreaterThanOrEqual(1);
    // Find the count row span that contains "2" as a sibling to "yes"
    const countSpans = document.querySelectorAll('.flex.gap-4 span');
    const texts = Array.from(countSpans).map((el) => el.textContent);
    // Should contain something like "2 yes"
    expect(texts.some((t) => t?.includes('yes'))).toBe(true);
    expect(texts.some((t) => t?.includes('no'))).toBe(true);
  });

  // --- New tests for Details button and admin email ---

  it('renders a "Details" button for each upcoming event', () => {
    const fixture = makeEvent({ title: 'Upcoming Garden Event' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const detailsBtn = screen.getByRole('button', { name: /^details$/i });
    expect(detailsBtn).toBeInTheDocument();
  });

  it('"Details" button opens the event modal with the event title', async () => {
    const fixture = makeEvent({ title: 'Details Button Test Event', description: 'A great event' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const detailsBtn = screen.getByRole('button', { name: /^details$/i });
    fireEvent.click(detailsBtn);

    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });

    // Modal should show the event title as heading
    const headings = screen.getAllByText('Details Button Test Event');
    expect(headings.length).toBeGreaterThanOrEqual(1);

    // Description should also be visible
    expect(screen.getByText('A great event')).toBeInTheDocument();
  });

  it('admin sees "Email all members about this event" button in detail modal', async () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'admin-uid' } as any,
      member: makeMember({ id: 'admin-uid', role: 'admin' }) as any,
      role: 'admin',
      status: 'active',
      loading: false,
    });

    const fixture = makeEvent({ title: 'Admin Email Test Event' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    // Open modal via Details button
    fireEvent.click(screen.getByRole('button', { name: /^details$/i }));

    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /email all members about this event/i })).toBeInTheDocument();
  });

  it('admin email button opens Gmail URL with event title and active members BCC (not pending)', async () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'admin-uid' } as any,
      member: makeMember({ id: 'admin-uid', role: 'admin' }) as any,
      role: 'admin',
      status: 'active',
      loading: false,
    });

    const fixture = makeEvent({ title: 'Spring Harvest Fest' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /^details$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /email all members about this event/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /email all members about this event/i }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const calledUrl = openSpy.mock.calls[0][0] as string;

    // URL should contain the event title (encoded)
    expect(calledUrl).toContain(encodeURIComponent('Spring Harvest Fest'));

    // URL should contain alice and bob's emails (active members)
    expect(calledUrl).toContain(encodeURIComponent('alice@test.com'));
    expect(calledUrl).toContain(encodeURIComponent('bob@test.com'));

    // URL should NOT contain the pending member's email
    expect(calledUrl).not.toContain(encodeURIComponent('pending@test.com'));

    openSpy.mockRestore();
  });

  it('non-admin member does NOT see "Email all members" button in detail modal', async () => {
    // Already member by default
    const fixture = makeEvent({ title: 'Member Only Test Event' });

    mockedListenEvents.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^details$/i }));

    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /email all members about this event/i })).not.toBeInTheDocument();
  });
});
