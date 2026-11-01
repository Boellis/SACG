import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { Timestamp } from 'firebase/firestore';

vi.mock('../email/emailJobsApi', () => ({
  queueMemberEmail: vi.fn(),
  listenEmailJob: vi.fn(() => vi.fn()),
}));
vi.mock('./eventsApi', () => ({
  listenRsvps: vi.fn(),
}));
vi.mock('../../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({ auth: {}, db: {}, app: {}, functions: {} }));

import * as emailJobsApiMod from '../email/emailJobsApi';
import * as eventsApiMod from './eventsApi';
import * as useAuthMod from '../../auth/useAuth';
import InviteComposer from './InviteComposer';
import type { GardenEvent, Member, Rsvp } from '../../lib/types';

const mockedQueue = vi.mocked(emailJobsApiMod.queueMemberEmail);
const mockedListenJob = vi.mocked(emailJobsApiMod.listenEmailJob);
const mockedListenRsvps = vi.mocked(eventsApiMod.listenRsvps);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

const ts = (iso: string) => ({ toDate: () => new Date(iso) }) as unknown as Timestamp;

const event: GardenEvent = {
  id: 'event-nov7',
  title: 'November Meeting',
  type: 'meeting',
  start: ts('2026-11-07T15:00:00.000Z'), // 9:00 AM garden time
  end: ts('2026-11-07T16:00:00.000Z'),
  allDay: false,
  location: 'Garden pavilion',
  createdBy: 'admin-uid',
};

const member = (id: string, displayName: string, over: Partial<Member> = {}): Member =>
  ({
    id,
    uid: id,
    email: `${id}@example.com`,
    displayName,
    role: 'member',
    status: 'active',
    currentYearHours: 0,
    createdAt: ts('2026-01-01T00:00:00Z'),
    ...over,
  }) as Member;

const me = member('admin-uid', 'Brandon Ellis', { role: 'admin', email: 'brandon@example.com' });
const members = [
  me,
  member('m-alice', 'Alice Example'),
  member('m-bob', 'Bob Example'),
  member('m-carol', 'Carol NoEmail', { email: '' }),
  member('m-pat', 'Pat Pending', { status: 'pending' }),
];
const rsvps = [{ id: 'm-alice', status: 'yes', displayName: 'Alice Example', respondedAt: {} }] as unknown as Rsvp[];

function renderComposer() {
  return render(<InviteComposer event={event} members={members} me={me} onClose={vi.fn()} />);
}

describe('InviteComposer', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({ user: { uid: me.id } as any, member: me, role: 'admin', status: 'active', loading: false });
    mockedListenRsvps.mockImplementation((_id, cb) => {
      cb(rsvps);
      return vi.fn();
    });
    mockedQueue.mockResolvedValue({ jobId: 'job-1', total: 3, skipped: 1 });
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('defaults the subject and body from the event, in garden time', () => {
    renderComposer();
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('RSVP: November Meeting — Sat, Nov 7');
    const body = (screen.getByLabelText(/^message$/i) as HTMLTextAreaElement).value;
    expect(body).toContain('Meeting — Saturday, November 7, 2026, 9:00–10:00 AM');
    expect(body).toContain('Location: Garden pavilion');
    expect(body.endsWith("\n\nPlease let us know if you're coming: {rsvpLink}")).toBe(true);
  });

  it('shows recipient counts for each audience', () => {
    renderComposer();
    // Active with an email: Brandon, Alice, Bob. Not yet answered: Brandon, Bob.
    expect(screen.getByLabelText(/all active members \(3\)/i)).toBeChecked();
    expect(screen.getByLabelText(/haven't responded \(2\)/i)).not.toBeChecked();
  });

  it('"Send test" with the default recipient sends only to me, with the RSVP event', async () => {
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: /^send test$/i }));

    await waitFor(() => expect(mockedQueue).toHaveBeenCalledTimes(1));
    expect(mockedQueue).toHaveBeenCalledWith(
      expect.objectContaining({ testMemberId: 'admin-uid', rsvpEventId: 'event-nov7', source: 'calendar' }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('"Send to N members" asks first, then sends to all active members (no test recipient)', async () => {
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: /send to 3 members/i }));

    await waitFor(() => expect(mockedQueue).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('3 members'));
    const input = mockedQueue.mock.calls[0][0];
    expect(input).toMatchObject({
      audience: { kind: 'all_active' },
      subject: 'RSVP: November Meeting — Sat, Nov 7',
      rsvpEventId: 'event-nov7',
      source: 'calendar',
    });
    expect(input).not.toHaveProperty('testMemberId');
  });

  it('does nothing when the confirm is cancelled', async () => {
    confirmSpy.mockReturnValue(false);
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: /send to 3 members/i }));
    expect(mockedQueue).not.toHaveBeenCalled();
  });

  it("\"haven't responded\" sends to the event's non-responders", async () => {
    renderComposer();
    fireEvent.click(screen.getByLabelText(/haven't responded/i));
    fireEvent.click(screen.getByRole('button', { name: /send to 2 members/i }));

    await waitFor(() => expect(mockedQueue).toHaveBeenCalledTimes(1));
    expect(mockedQueue.mock.calls[0][0]).toMatchObject({
      audience: { kind: 'event_rsvp', eventId: 'event-nov7', statuses: ['none'] },
    });
  });

  it('"one person" sends to the picked member only', async () => {
    renderComposer();
    fireEvent.click(screen.getByLabelText(/one person/i));
    fireEvent.change(screen.getByLabelText(/^recipient$/i), { target: { value: 'm-bob' } });
    fireEvent.click(screen.getByRole('button', { name: /send to 1 member$/i }));

    await waitFor(() => expect(mockedQueue).toHaveBeenCalledTimes(1));
    expect(mockedQueue.mock.calls[0][0]).toMatchObject({ audience: { kind: 'members', memberIds: ['m-bob'] } });
  });

  it('sends the edited subject and body, then shows live job progress', async () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Food headcount: Nov 7' } });
    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'Hi {firstName}! {rsvpLink}' } });
    fireEvent.click(screen.getByRole('button', { name: /send to 3 members/i }));

    await waitFor(() => expect(mockedListenJob).toHaveBeenCalledWith('job-1', expect.any(Function)));
    expect(mockedQueue.mock.calls[0][0]).toMatchObject({
      subject: 'Food headcount: Nov 7',
      body: 'Hi {firstName}! {rsvpLink}',
    });
  });

  it('shows the server error when a send is rejected', async () => {
    mockedQueue.mockRejectedValueOnce(new Error('No one to email: no active members match that audience.'));
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: /^send test$/i }));
    expect(await screen.findByText(/no active members match that audience/i)).toBeInTheDocument();
  });
});
