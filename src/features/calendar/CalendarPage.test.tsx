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

// Mock the email-job API behind the RSVP invitation composer
vi.mock('../email/emailJobsApi', () => ({
  queueMemberEmail: vi.fn().mockResolvedValue({ jobId: 'job-1', total: 2, skipped: 0 }),
  listenEmailJob: vi.fn(() => vi.fn()),
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
import type { Rsvp } from '../../lib/types';

const mockedListenEvents = vi.mocked(eventsApiMod.listenEvents);
const mockedListenRsvps = vi.mocked(eventsApiMod.listenRsvps);
const mockedSetRsvp = vi.mocked(eventsApiMod.setRsvp);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

const DAY_MS = 24 * 60 * 60 * 1000;

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
  // 40 days out: always upcoming, and never inside the month grid on screen
  // (which would render the title a second time and make text queries ambiguous).
  const startDate = overrides.startDate ?? new Date(Date.now() + 40 * DAY_MS);
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

/** RSVPs for headcount tests: 3 + 1 people coming, a maybe of 2, a no. */
const headcountRsvps = [
  { id: 'active-1', status: 'yes', displayName: 'Alice', partySize: 3, note: 'veggie', source: 'email', respondedAt: {} },
  { id: 'active-2', status: 'yes', displayName: 'Bob', source: 'app', respondedAt: {} },
  { id: 'user-c', status: 'maybe', displayName: 'Carol', partySize: 2, respondedAt: {} },
  { id: 'user-d', status: 'no', displayName: 'Dan', respondedAt: {} },
] as unknown as Rsvp[];

function asAdmin() {
  mockedUseAuth.mockReturnValue({
    user: { uid: 'admin-uid' } as any,
    member: makeMember({ id: 'admin-uid', role: 'admin', displayName: 'Ada Admin' }) as any,
    role: 'admin',
    status: 'active',
    loading: false,
  });
}

function withEvents(...events: ReturnType<typeof makeEvent>[]) {
  mockedListenEvents.mockImplementation((cb) => {
    cb(events as any);
    return vi.fn();
  });
}

function withRsvps(rsvps: Rsvp[]) {
  mockedListenRsvps.mockImplementation((_eventId, cb) => {
    cb(rsvps);
    return vi.fn();
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  );
}

async function openDetails() {
  fireEvent.click(screen.getByRole('button', { name: /^details$/i }));
  await waitFor(() => {
    expect(screen.getByText('RSVP')).toBeInTheDocument();
  });
}

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
    withRsvps([]);

    // Default: listenMembers yields fixture members
    mockedListenMembers.mockImplementation((cb) => {
      cb(memberFixtures as any);
      return vi.fn();
    });
  });

  it('renders event title in the upcoming list', () => {
    withEvents(makeEvent({ title: 'Spring Cleanup Workday' }));
    renderPage();
    expect(screen.getByText('Spring Cleanup Workday')).toBeInTheDocument();
  });

  it('shows the Upcoming Events section heading', () => {
    withEvents();
    renderPage();
    expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
  });

  it('shows "No upcoming events" when list is empty', () => {
    withEvents();
    renderPage();
    expect(screen.getByText('No upcoming events.')).toBeInTheDocument();
  });

  it('clicking an event opens detail modal with title', async () => {
    withEvents(makeEvent({ title: 'Board Meeting' }));
    renderPage();

    // Click the event in upcoming list
    fireEvent.click(screen.getByText('Board Meeting'));

    // Modal should show title (the modal heading is the same text; look for the RSVP section)
    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });
  });

  it('clicking Yes in modal calls setRsvp with member id and "yes"', async () => {
    withEvents(makeEvent({ id: 'event-test-1', title: 'Harvest Fest' }));
    renderPage();

    // Open modal
    fireEvent.click(screen.getByText('Harvest Fest'));
    await waitFor(() => {
      expect(screen.getByText('RSVP')).toBeInTheDocument();
    });

    // Click Yes
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }));

    await waitFor(() => {
      expect(mockedSetRsvp).toHaveBeenCalledWith('event-test-1', 'member-uid', 'yes', 'Test Member', {
        partySize: 1,
        note: '',
      });
    });
  });

  it('member RSVP yes with a party size of 3 saves partySize 3', async () => {
    withEvents(makeEvent({ id: 'event-party', title: 'Potluck Workday' }));
    renderPage();
    await openDetails();

    // The party-size question only appears once yes/maybe is chosen.
    expect(screen.queryByLabelText(/how many people, including you/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }));
    fireEvent.change(await screen.findByLabelText(/how many people, including you/i), { target: { value: '3' } });
    expect(screen.getByLabelText(/note for organizers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save rsvp/i }));

    await waitFor(() => {
      expect(mockedSetRsvp).toHaveBeenLastCalledWith('event-party', 'member-uid', 'yes', 'Test Member', {
        partySize: 3,
        note: '',
      });
    });
  });

  it('a No answer hides the party-size question and sends no party size', async () => {
    withEvents(makeEvent({ id: 'event-no' }));
    renderPage();
    await openDetails();

    fireEvent.click(screen.getByRole('button', { name: /^no$/i }));

    await waitFor(() => {
      expect(mockedSetRsvp).toHaveBeenCalledWith('event-no', 'member-uid', 'no', 'Test Member', { note: '' });
    });
    expect(screen.queryByLabelText(/how many people, including you/i)).not.toBeInTheDocument();
  });

  it('does not show "New event" button for regular members', () => {
    withEvents();
    renderPage();
    expect(screen.queryByText('+ New Event')).not.toBeInTheDocument();
  });

  it('shows "New event" button for admins', () => {
    asAdmin();
    withEvents();
    renderPage();
    expect(screen.getByText('+ New Event')).toBeInTheDocument();
  });

  it('shows RSVP counts in event modal', async () => {
    withEvents(makeEvent({ id: 'event-rsvp-1', title: 'Rsvp Test Event' }));
    withRsvps([
      { id: 'user-a', status: 'yes', displayName: 'Alice', respondedAt: {} as any },
      { id: 'user-b', status: 'yes', displayName: 'Bob', respondedAt: {} as any },
      { id: 'user-c', status: 'no', displayName: 'Carol', respondedAt: {} as any },
    ]);
    renderPage();

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

  it('admin sees the expected headcount, counts and per-person lines', async () => {
    asAdmin();
    withEvents(makeEvent({ title: 'Headcount Event' }));
    withRsvps(headcountRsvps);
    renderPage();
    await openDetails();

    expect(screen.getByText('Expected headcount: 4 people')).toBeInTheDocument();
    expect(screen.getByText(/2 yes · 1 maybe · 1 no/)).toBeInTheDocument();
    expect(screen.getByText('Alice (×3) — "veggie"')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol (×2)')).toBeInTheDocument();
    // Only Alice answered from an email link.
    expect(screen.getAllByText('email')).toHaveLength(1);
  });

  it('member does not see the headcount line or who responded', async () => {
    withEvents(makeEvent({ title: 'Private Headcount Event' }));
    withRsvps(headcountRsvps);
    renderPage();
    await openDetails();

    expect(screen.queryByText(/expected headcount/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Alice/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Carol/)).not.toBeInTheDocument();
  });

  // --- Details button and admin email ---

  it('renders a "Details" button for each upcoming event', () => {
    withEvents(makeEvent({ title: 'Upcoming Garden Event' }));
    renderPage();
    expect(screen.getByRole('button', { name: /^details$/i })).toBeInTheDocument();
  });

  it('"Details" button opens the event modal with the event title', async () => {
    withEvents(makeEvent({ title: 'Details Button Test Event', description: 'A great event' }));
    renderPage();
    await openDetails();

    // Modal should show the event title as heading
    const headings = screen.getAllByText('Details Button Test Event');
    expect(headings.length).toBeGreaterThanOrEqual(1);

    // Description should also be visible
    expect(screen.getByText('A great event')).toBeInTheDocument();
  });

  it('admin sees "Send RSVP invitations…" in the detail modal', async () => {
    asAdmin();
    withEvents(makeEvent({ title: 'Admin Email Test Event' }));
    renderPage();
    await openDetails();

    expect(screen.getByRole('button', { name: /send rsvp invitations/i })).toBeInTheDocument();
  });

  it('"Send RSVP invitations…" opens the invitation composer', async () => {
    asAdmin();
    withEvents(makeEvent({ title: 'Composer Event' }));
    renderPage();
    await openDetails();

    fireEvent.click(screen.getByRole('button', { name: /send rsvp invitations/i }));

    const subject = (await screen.findByLabelText(/^subject$/i)) as HTMLInputElement;
    expect(subject.value.startsWith('RSVP: Composer Event — ')).toBe(true);
    expect(screen.getByRole('button', { name: /^send test$/i })).toBeInTheDocument();
  });

  it('the "Use mail app instead" fallback BCCs active members (not pending) about the event', async () => {
    asAdmin();
    withEvents(makeEvent({ title: 'Spring Harvest Fest' }));
    renderPage();
    await openDetails();

    const href = screen.getByRole('link', { name: /use mail app instead/i }).getAttribute('href') ?? '';
    expect(href.startsWith('mailto:')).toBe(true);

    // The event title is the subject
    expect(href).toContain(encodeURIComponent('Spring Harvest Fest'));

    // Active members (alice, bob) are BCC'd
    expect(href).toContain(encodeURIComponent('alice@test.com'));
    expect(href).toContain(encodeURIComponent('bob@test.com'));

    // The pending member is not
    expect(href).not.toContain(encodeURIComponent('pending@test.com'));
  });

  it('non-admin member does NOT see the invitation button or the mail-app fallback', async () => {
    withEvents(makeEvent({ title: 'Member Only Test Event' }));
    renderPage();
    await openDetails();

    expect(screen.queryByRole('button', { name: /send rsvp invitations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /use mail app instead/i })).not.toBeInTheDocument();
  });
});
