import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { Timestamp } from 'firebase/firestore';

vi.mock('./assistantApi', () => ({
  executeAssistantAction: vi.fn(),
  rejectAssistantAction: vi.fn(),
}));
vi.mock('../email/emailJobsApi', () => ({ listenEmailJob: vi.fn() }));
vi.mock('../calendar/eventsApi', () => ({ listenRsvps: vi.fn(), listenEvents: vi.fn() }));
vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/firebase', () => ({ auth: {}, db: {}, app: {}, functions: {} }));

import * as apiMod from './assistantApi';
import * as emailJobsApiMod from '../email/emailJobsApi';
import * as eventsApiMod from '../calendar/eventsApi';
import * as useAuthMod from '../../auth/useAuth';
import ActionCard, { type ActionCardProps } from './ActionCard';
import type { AssistantAction } from './types';
import type { EmailJob, GardenEvent, Member, Rsvp } from '../../lib/types';

const mockedExecute = vi.mocked(apiMod.executeAssistantAction);
const mockedReject = vi.mocked(apiMod.rejectAssistantAction);
const mockedListenJob = vi.mocked(emailJobsApiMod.listenEmailJob);
const mockedListenRsvps = vi.mocked(eventsApiMod.listenRsvps);
const mockedListenEvents = vi.mocked(eventsApiMod.listenEvents);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ts = (iso: string) => ({ toDate: () => new Date(iso) }) as unknown as Timestamp;

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
]; // 3 can be emailed: Brandon, Alice, Bob

const gardenEvent = { id: 'ev-existing', title: 'Garden Workday' } as GardenEvent;
const meetingEvent = {
  id: 'ev1',
  title: 'November Meeting',
  type: 'meeting',
  start: ts('2026-11-07T15:00:00Z'), // 9:00 AM garden time (CST)
  end: ts('2026-11-07T16:00:00Z'),
  allDay: false,
} as GardenEvent;

const eventAction = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a-event',
    type: 'create_event',
    summary: 'Create the Nov 7 meeting',
    status: 'proposed',
    toolUseId: 'toolu_1',
    input: {
      title: 'November Meeting',
      type: 'meeting',
      start: '2026-11-07T09:00',
      end: '2026-11-07T10:00',
      allDay: false,
      location: 'Garden pavilion',
      description: 'Monthly meeting, then the workday.',
    },
    ...over,
  }) as AssistantAction;

const emailAction = (over: Record<string, unknown> = {}, input: Record<string, unknown> = {}) =>
  ({
    id: 'a-email',
    type: 'send_email',
    summary: 'Email everyone the RSVP link',
    status: 'proposed',
    toolUseId: 'toolu_2',
    dependsOn: 'a-event',
    input: {
      audience: { kind: 'all_active' },
      subject: 'RSVP: Nov 7 meeting',
      body: 'Hi {firstName},\n\nCan you make it? {rsvpLink}',
      rsvp: { eventActionId: 'a-event' },
      ...input,
    },
    ...over,
  }) as AssistantAction;

const announcementAction = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a-ann',
    type: 'post_announcement',
    summary: 'Post the pavilion notice',
    status: 'proposed',
    toolUseId: 'toolu_3',
    input: { title: 'Pavilion closed', body: 'The pavilion is closed Saturday.', pinned: true, expiresOn: '2026-11-20' },
    ...over,
  }) as AssistantAction;

const pollAction = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a-poll',
    type: 'create_poll',
    summary: 'Ask which Saturday works',
    status: 'proposed',
    toolUseId: 'toolu_4',
    input: { question: 'Which Saturday works?', options: ['Nov 7', 'Nov 14'], closesOn: '2026-11-05' },
    ...over,
  }) as AssistantAction;

const job = (over: Partial<EmailJob>): EmailJob =>
  ({
    id: 'job',
    subject: 'S',
    body: 'B',
    recipients: [{ memberId: 'admin-uid', displayName: 'Brandon Ellis', email: 'brandon@example.com' }],
    total: 1,
    sent: 1,
    failed: 0,
    skippedNoEmail: 0,
    status: 'done',
    test: true,
    source: 'assistant',
    createdBy: 'admin-uid',
    createdByName: 'Brandon Ellis',
    ...over,
  }) as EmailJob;

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

function renderCard(action: AssistantAction, over: Partial<ActionCardProps> = {}) {
  const tree = (a: AssistantAction, extra: Partial<ActionCardProps>) => (
    <MemoryRouter future={ROUTER_FUTURE}>
      <ActionCard threadId="t1" action={a} members={members} me={me} {...extra} />
    </MemoryRouter>
  );
  const view = render(tree(action, over));
  return { ...view, update: (a: AssistantAction, extra: Partial<ActionCardProps> = over) => view.rerender(tree(a, extra)) };
}

const button = (name: string) => screen.getByRole('button', { name });
const buttons = () => screen.queryAllByRole('button');

describe('ActionCard', () => {
  let confirmSpy: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({ user: { uid: me.id } as never, member: me, role: 'admin', status: 'active', loading: false });
    mockedExecute.mockResolvedValue({ status: 'executed', result: {} });
    mockedReject.mockResolvedValue(undefined);
    mockedListenJob.mockImplementation(() => vi.fn());
    mockedListenRsvps.mockImplementation((_id, cb) => {
      cb([]);
      return vi.fn();
    });
    mockedListenEvents.mockImplementation((cb) => {
      cb([gardenEvent]);
      return vi.fn();
    });
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Event card
  // -------------------------------------------------------------------------

  describe('event card', () => {
    it('shows the proposal with its time in garden time', () => {
      renderCard(eventAction());

      expect(screen.getByText('Proposed')).toBeInTheDocument();
      expect(screen.getByText('Create the Nov 7 meeting')).toBeInTheDocument();
      expect(screen.getByText('November Meeting')).toBeInTheDocument();
      expect(screen.getByText('Meeting')).toBeInTheDocument();
      expect(screen.getByText('Sat, Nov 7 · 9:00–10:00 AM')).toBeInTheDocument();
      expect(screen.getByText('Garden pavilion')).toBeInTheDocument();
      expect(screen.getByText('Monthly meeting, then the workday.')).toBeInTheDocument();
    });

    it('Approve runs the action as proposed, with no overrides, then locks the card', async () => {
      renderCard(eventAction());

      fireEvent.click(button('Approve'));

      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({ threadId: 't1', actionId: 'a-event', mode: 'run' }),
      );
      expect(mockedExecute.mock.calls[0][0]).not.toHaveProperty('overrides');
      // The call has finished; the card waits for the live status to flip, and can't be approved twice.
      await waitFor(() => expect(button('Approve')).toBeDisabled());
      expect(button('Approve')).toBeDisabled();
      expect(button('Reject')).toBeDisabled();
      expect(button('Edit')).toBeDisabled();
    });

    it('sends only the edited fields as overrides', async () => {
      renderCard(eventAction());

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
      fireEvent.click(button('Approve'));

      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({
          threadId: 't1',
          actionId: 'a-event',
          mode: 'run',
          overrides: { title: 'X' },
        }),
      );
    });

    it('can edit every field, and sends them together', async () => {
      renderCard(eventAction());

      fireEvent.click(button('Edit'));
      expect(screen.getByLabelText('Title')).toHaveValue('November Meeting');
      expect(screen.getByLabelText('Type')).toHaveValue('meeting');
      expect(screen.getByLabelText('Starts')).toHaveValue('2026-11-07T09:00');
      expect(screen.getByLabelText('Ends')).toHaveValue('2026-11-07T10:00');
      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'workday' } });
      fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-07T10:00' } });
      fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-11-07T12:00' } });
      fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Back lot' } });
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bring gloves.' } });
      fireEvent.click(button('Approve'));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedExecute.mock.calls[0][0].overrides).toEqual({
        type: 'workday',
        start: '2026-11-07T10:00',
        end: '2026-11-07T12:00',
        location: 'Back lot',
        description: 'Bring gloves.',
      });
    });

    it('shows the edited values once editing is closed', () => {
      renderCard(eventAction());

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fall Meeting' } });
      fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-07T09:30' } });
      fireEvent.click(button('Done editing'));

      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.getByText('Fall Meeting')).toBeInTheDocument();
      expect(screen.getByText('Sat, Nov 7 · 9:30–10:00 AM')).toBeInTheDocument();
    });

    it('does not approve an event that ends before it starts', () => {
      renderCard(eventAction());

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-11-07T08:00' } });

      expect(screen.getByText("The end can't be before the start.")).toBeInTheDocument();
      expect(button('Approve')).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-11-07T09:00' } }); // same time is fine
      expect(screen.queryByText("The end can't be before the start.")).not.toBeInTheDocument();
      expect(button('Approve')).toBeEnabled();
    });

    it('does not approve an event without a title', () => {
      renderCard(eventAction());

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  ' } });

      expect(screen.getByText('Give the event a title.')).toBeInTheDocument();
      expect(button('Approve')).toBeDisabled();
    });

    it('Reject calls rejectAssistantAction with the thread and action ids', async () => {
      renderCard(eventAction());

      fireEvent.click(button('Reject'));

      await waitFor(() => expect(mockedReject).toHaveBeenCalledWith('t1', 'a-event'));
      expect(mockedExecute).not.toHaveBeenCalled();
      await waitFor(() => expect(button('Approve')).toBeDisabled());
    });

    it("shows the server's message when approving fails, and lets the admin try again", async () => {
      mockedExecute.mockRejectedValueOnce(
        Object.assign(new Error('Something is already on the calendar then.'), { code: 'functions/failed-precondition' }),
      );
      renderCard(eventAction());

      fireEvent.click(button('Approve'));

      expect(await screen.findByRole('alert')).toHaveTextContent('Something is already on the calendar then.');
      expect(button('Approve')).toBeEnabled();
    });

    it('sends one request even if Approve is clicked twice before the card re-renders', async () => {
      renderCard(eventAction());
      const approve = button('Approve');

      act(() => {
        approve.click();
        approve.click();
      });

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
    });

    it('shows the result and no buttons once executed', () => {
      renderCard(
        eventAction({
          status: 'executed',
          executedByName: 'Brandon Ellis',
          result: {
            eventId: 'ev1',
            title: 'November Meeting',
            when: 'Saturday, November 7, 2026, 9:00–10:00 AM',
            url: 'https://sacg-garden-app.web.app/calendar',
          },
        }),
      );

      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByText(/Saturday, November 7, 2026, 9:00–10:00 AM/)).toBeInTheDocument();
      expect(screen.getByText(/Approved by Brandon Ellis/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View calendar' })).toHaveAttribute('href', '/calendar');
      expect(buttons()).toHaveLength(0);
    });

    it('shows a rejected card without buttons', () => {
      renderCard(eventAction({ status: 'rejected' }));
      expect(screen.getByText('Rejected')).toBeInTheDocument();
      expect(buttons()).toHaveLength(0);
    });

    it('shows Sending… while the server runs it, without buttons', () => {
      renderCard(eventAction({ status: 'executing' }));
      expect(screen.getByText('Sending…')).toBeInTheDocument();
      expect(buttons()).toHaveLength(0);
    });

    it('shows the error on a failed card', () => {
      renderCard(eventAction({ status: 'failed', error: 'Calendar is full' }));
      expect(screen.getByText('Failed: Calendar is full')).toBeInTheDocument();
      expect(buttons()).toHaveLength(0);
    });

    it('keeps Approve available after an attempt the server rolled back, and says why', () => {
      renderCard(eventAction({ error: 'Calendar is full' }));
      expect(screen.getByText('Proposed')).toBeInTheDocument();
      expect(screen.getByText('Last attempt failed: Calendar is full')).toBeInTheDocument();
      expect(button('Approve')).toBeEnabled();
    });

    const updateAction = (input: Record<string, unknown>) =>
      eventAction({ type: 'update_event', summary: 'Move the meeting an hour later', input: { eventId: 'ev1', ...input } });

    it('shows which event an update changes, as it stands now', () => {
      mockedListenEvents.mockImplementation((cb) => {
        cb([gardenEvent, meetingEvent]);
        return vi.fn();
      });
      renderCard(updateAction({ start: '2026-11-07T10:00', end: '2026-11-07T11:00' }));

      expect(mockedListenEvents).toHaveBeenCalled();
      expect(screen.getByText(/^November Meeting\s+Saturday, November 7, 2026, 9:00–10:00 AM$/)).toBeInTheDocument();
      expect(screen.getByText('New time')).toBeInTheDocument();
      expect(screen.getByText('Sat, Nov 7 · 10:00–11:00 AM')).toBeInTheDocument();
    });

    it("warns when the event an update points at isn't on the calendar", () => {
      mockedListenEvents.mockImplementation((cb) => {
        cb([gardenEvent]); // no 'ev1'
        return vi.fn();
      });
      renderCard(updateAction({ title: 'Fall Meeting' }));

      expect(screen.getByText("That event wasn't found. It may have been deleted.")).toBeInTheDocument();
    });

    it('does not look up events for a new event', () => {
      renderCard(eventAction());
      expect(mockedListenEvents).not.toHaveBeenCalled();
    });

    it('shows an update that only changes all-day, instead of an empty card', () => {
      renderCard(updateAction({ allDay: true }));
      expect(screen.getByText('All day')).toBeInTheDocument();
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('shows only what an update changes, and edits only those fields', async () => {
      mockedListenEvents.mockImplementation((cb) => {
        cb([meetingEvent]);
        return vi.fn();
      });
      renderCard(updateAction({ start: '2026-11-07T10:00', end: '2026-11-07T11:00' }));

      expect(screen.getByText('Calendar event update')).toBeInTheDocument();
      expect(screen.getByText('Sat, Nov 7 · 10:00–11:00 AM')).toBeInTheDocument();
      expect(screen.queryByText('Title')).not.toBeInTheDocument();
      expect(screen.queryByText('New title')).not.toBeInTheDocument();

      fireEvent.click(button('Edit'));
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      // Still clear which event is being changed while editing.
      expect(screen.getByText(/^November Meeting\s+Saturday, November 7, 2026, 9:00–10:00 AM$/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-11-07T11:30' } });
      fireEvent.click(button('Approve'));

      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({
          threadId: 't1',
          actionId: 'a-event',
          mode: 'run',
          overrides: { end: '2026-11-07T11:30' },
        }),
      );
    });

    it('labels an all-day event as such', () => {
      renderCard(
        eventAction({
          input: {
            title: 'Garden Day',
            type: 'workday',
            start: '2026-11-07T00:00',
            end: '2026-11-07T23:59',
            allDay: true,
          },
        }),
      );
      expect(screen.getByText('Sat, Nov 7 · All day')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Email card
  // -------------------------------------------------------------------------

  describe('email card', () => {
    const eventProposed = eventAction();
    const eventExecuted = eventAction({ status: 'executed', result: { eventId: 'ev1', title: 'November Meeting' } });

    it('shows the audience, subject and body, with merge fields as pills', () => {
      renderCard(emailAction(), { actions: [eventExecuted] });

      expect(screen.getByText('All active members')).toBeInTheDocument();
      expect(screen.getByText('(3 recipients)')).toBeInTheDocument();
      expect(screen.getByText('RSVP: Nov 7 meeting')).toBeInTheDocument();
      const firstName = screen.getByText('{firstName}');
      expect(firstName.tagName).toBe('SPAN');
      expect(screen.getByText('{rsvpLink}').tagName).toBe('SPAN');
      expect(firstName.parentElement).toHaveTextContent('Hi {firstName}, Can you make it? {rsvpLink}');
      expect(firstName.parentElement).toHaveClass('font-mono', 'whitespace-pre-wrap');
    });

    it('says which event the RSVP links are for, by the title of the proposed event', () => {
      renderCard(emailAction(), { actions: [eventProposed] });
      expect(screen.getByText('Includes personal RSVP links for: November Meeting')).toBeInTheDocument();
    });

    it('uses the executed event\'s final title when the admin changed it before approving', () => {
      renderCard(emailAction(), {
        actions: [eventAction({ status: 'executed', result: { eventId: 'ev1', title: 'Fall Meeting' } })],
      });
      expect(screen.getByText('Includes personal RSVP links for: Fall Meeting')).toBeInTheDocument();
    });

    it('names an existing event by looking it up', () => {
      renderCard(emailAction({ dependsOn: undefined }, { rsvp: { eventId: 'ev-existing' } }));
      expect(screen.getByText('Includes personal RSVP links for: Garden Workday')).toBeInTheDocument();
    });

    it('shows no RSVP note for an email without RSVP links', () => {
      renderCard(emailAction({ dependsOn: undefined }, { rsvp: undefined }));
      expect(screen.queryByText(/personal RSVP links/)).not.toBeInTheDocument();
    });

    // --- test sends ---------------------------------------------------------

    it('offers a test send to me by default', () => {
      renderCard(emailAction(), { actions: [eventExecuted] });
      expect(screen.getByLabelText('Send test to')).toHaveValue('admin-uid');
      expect(screen.getByRole('option', { name: 'Brandon Ellis (me)' })).toBeInTheDocument();
    });

    it('"Send test" sends mode test to the picked member, without asking to confirm', async () => {
      mockedExecute.mockResolvedValue({ status: 'proposed', result: { jobId: 'job-test-1', total: 1, skipped: 0 } });
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.change(screen.getByLabelText('Send test to'), { target: { value: 'm-alice' } });
      fireEvent.click(button('Send test'));

      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({
          threadId: 't1',
          actionId: 'a-email',
          mode: 'test',
          testMemberId: 'm-alice',
        }),
      );
      expect(confirmSpy).not.toHaveBeenCalled();
      // The card stays proposed, so it can still be sent for real, and follows the test job.
      await waitFor(() => expect(mockedListenJob).toHaveBeenCalledWith('job-test-1', expect.any(Function)));
      expect(button('Approve & send to everyone')).toBeEnabled();
      expect(button('Send test')).toBeEnabled();
    });

    it('test-sends the edited subject and body, so the admin sees what they changed', async () => {
      mockedExecute.mockResolvedValue({ status: 'proposed', result: { jobId: 'job-test-2' } });
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'New subject' } });
      fireEvent.click(button('Send test'));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedExecute.mock.calls[0][0]).toEqual({
        threadId: 't1',
        actionId: 'a-email',
        mode: 'test',
        testMemberId: 'admin-uid',
        overrides: { subject: 'New subject' },
      });
    });

    it('lists the test sends already made, each with its live status', () => {
      mockedListenJob.mockImplementation((id, cb) => {
        cb(job({ id, status: 'done', recipients: [{ memberId: 'm-alice', displayName: 'Alice Example', email: 'alice@example.com' }] }));
        return vi.fn();
      });
      renderCard(
        emailAction({
          tests: [
            { toName: 'Alice Example', jobId: 'job-old-1' },
            { toName: 'Brandon Ellis', jobId: 'job-old-2' },
          ],
        }),
        { actions: [eventExecuted] },
      );

      expect(mockedListenJob).toHaveBeenCalledWith('job-old-1', expect.any(Function));
      expect(mockedListenJob).toHaveBeenCalledWith('job-old-2', expect.any(Function));
      expect(screen.getAllByText(/Test queued for Alice Example ✓/)).toHaveLength(2);
    });

    it('says a test is queued, not sent, when its job id is unknown', async () => {
      mockedExecute.mockResolvedValue({ status: 'proposed', result: {} });
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Send test'));

      expect(await screen.findByText('Test queued for Brandon Ellis ✓')).toBeInTheDocument();
      expect(screen.queryByText(/Test sent to/)).not.toBeInTheDocument();
    });

    it("doesn't list a test twice when its record arrives after the call returned", async () => {
      mockedExecute.mockResolvedValue({ status: 'proposed', result: { jobId: 'job-test-3' } });
      const view = renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Send test'));
      await waitFor(() => expect(mockedListenJob).toHaveBeenCalledWith('job-test-3', expect.any(Function)));
      mockedListenJob.mockClear();

      view.update(emailAction({ tests: [{ toName: 'Brandon Ellis', jobId: 'job-test-3' }] }), { actions: [eventExecuted] });

      expect(mockedListenJob.mock.calls.filter(([id]) => id === 'job-test-3')).toHaveLength(0); // still the same one
      expect(screen.getAllByText('Queued…')).toHaveLength(1);
    });

    // --- approve & send ---------------------------------------------------

    it('asks before sending to everyone, and does nothing if the admin says no', async () => {
      confirmSpy.mockReturnValue(false);
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Approve & send to everyone'));

      expect(confirmSpy).toHaveBeenCalledWith("Send this email to 3 members? This can't be undone.");
      expect(mockedExecute).not.toHaveBeenCalled();
      expect(button('Approve & send to everyone')).toBeEnabled();
    });

    it('sends for real, with no overrides, once the admin confirms; the card then follows the job', async () => {
      const result = { jobId: 'job-run-1', total: 3, skipped: 1 };
      mockedExecute.mockResolvedValue({ status: 'executed', result });
      const view = renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Approve & send to everyone'));

      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({ threadId: 't1', actionId: 'a-email', mode: 'run' }),
      );
      await waitFor(() => expect(button('Approve & send to everyone')).toBeDisabled());
      expect(button('Approve & send to everyone')).toBeDisabled(); // the call is over: still can't be sent twice
      expect(button('Send test')).toBeDisabled();

      // The server's live status arrives: executed, with the job it queued.
      view.update(emailAction({ status: 'executed', result }), { actions: [eventExecuted] });
      expect(mockedListenJob).toHaveBeenCalledWith('job-run-1', expect.any(Function));
      expect(buttons()).toHaveLength(0);
    });

    it('sends the edited subject and body as overrides', async () => {
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Edit'));
      expect(screen.getByLabelText('Subject')).toHaveValue('RSVP: Nov 7 meeting');
      fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Please RSVP: Nov 7' } });
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi {firstName}! {rsvpLink}' } });
      fireEvent.click(button('Approve & send to everyone'));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedExecute.mock.calls[0][0]).toEqual({
        threadId: 't1',
        actionId: 'a-email',
        mode: 'run',
        overrides: { subject: 'Please RSVP: Nov 7', body: 'Hi {firstName}! {rsvpLink}' },
      });
    });

    it('does not send an email with an empty subject or message', () => {
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '' } });

      expect(screen.getByText('Add a subject.')).toBeInTheDocument();
      expect(button('Approve & send to everyone')).toBeDisabled();
      expect(button('Send test')).toBeDisabled();
    });

    it('does not send a message over the 20,000-character limit', () => {
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'x'.repeat(20_001) } });

      expect(screen.getByText('The message is too long (20,001 of 20,000 characters).')).toBeInTheDocument();
      expect(button('Approve & send to everyone')).toBeDisabled();
      expect(button('Send test')).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'x'.repeat(20_000) } });
      expect(button('Approve & send to everyone')).toBeEnabled();
    });

    it('shows the server error and keeps the card sendable when sending fails', async () => {
      mockedExecute.mockRejectedValueOnce(
        Object.assign(new Error('Approve the event first'), { code: 'functions/failed-precondition' }),
      );
      renderCard(emailAction(), { actions: [eventExecuted] });

      fireEvent.click(button('Approve & send to everyone'));

      expect(await screen.findByRole('alert')).toHaveTextContent('Approve the event first');
      expect(button('Approve & send to everyone')).toBeEnabled();
    });

    // --- waiting for the event --------------------------------------------

    it('cannot be approved until the event it links to has been approved', () => {
      renderCard(emailAction(), { actions: [eventProposed] });

      expect(button('Approve & send to everyone')).toBeDisabled();
      expect(screen.getByText('Approve the event first')).toBeInTheDocument();

      fireEvent.click(button('Approve & send to everyone'));
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockedExecute).not.toHaveBeenCalled();
    });

    it('waits too while the event is still being created, or is unknown', () => {
      const view = renderCard(emailAction(), { actions: [eventAction({ status: 'executing' })] });
      expect(button('Approve & send to everyone')).toBeDisabled();

      view.update(emailAction(), { actions: [] });
      expect(button('Approve & send to everyone')).toBeDisabled();
      expect(screen.getByText('Approve the event first')).toBeInTheDocument();
    });

    it('becomes sendable as soon as the event is executed', () => {
      const view = renderCard(emailAction(), { actions: [eventProposed] });
      expect(button('Approve & send to everyone')).toBeDisabled();

      view.update(emailAction(), { actions: [eventExecuted] });

      expect(button('Approve & send to everyone')).toBeEnabled();
      expect(screen.queryByText('Approve the event first')).not.toBeInTheDocument();
    });

    it('explains when the event it links to was rejected', () => {
      renderCard(emailAction(), { actions: [eventAction({ status: 'rejected' })] });

      expect(button('Approve & send to everyone')).toBeDisabled();
      expect(screen.queryByText('Approve the event first')).not.toBeInTheDocument();
      expect(screen.getByText(/the event was rejected/i)).toBeInTheDocument();
    });

    it('still lets the admin send a test while it waits for the event', async () => {
      renderCard(emailAction(), { actions: [eventProposed] });
      expect(button('Send test')).toBeEnabled();
    });

    // --- who it goes to ---------------------------------------------------

    it('counts an event audience from its RSVPs', async () => {
      mockedListenRsvps.mockImplementation((_id, cb) => {
        cb([{ id: 'm-alice', status: 'yes' } as Rsvp]);
        return vi.fn();
      });
      renderCard(
        emailAction({ dependsOn: undefined }, { audience: { kind: 'event_rsvp', eventId: 'ev-existing', statuses: ['none'] }, rsvp: undefined }),
      );

      expect(mockedListenRsvps).toHaveBeenCalledWith('ev-existing', expect.any(Function));
      expect(screen.getByText("Event RSVPs: haven't responded")).toBeInTheDocument();
      expect(screen.getByText('(2 recipients)')).toBeInTheDocument(); // Brandon and Bob haven't answered

      fireEvent.click(button('Approve & send to 2 members'));
      expect(confirmSpy).toHaveBeenCalledWith("Send this email to 2 members? This can't be undone.");
      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
    });

    it('waits for the RSVPs before it can count an event audience', () => {
      mockedListenRsvps.mockImplementation(() => vi.fn()); // never answers
      renderCard(
        emailAction({ dependsOn: undefined }, { audience: { kind: 'event_rsvp', eventId: 'ev-existing', statuses: ['yes'] }, rsvp: undefined }),
      );

      expect(screen.getByText('Counting recipients…')).toBeInTheDocument();
      expect(button('Approve & send')).toBeDisabled();
    });

    it('does not offer to send to nobody', () => {
      renderCard(emailAction({ dependsOn: undefined }, { audience: { kind: 'members', memberIds: ['m-pat', 'm-carol'] }, rsvp: undefined }));

      expect(screen.getByText('2 selected members')).toBeInTheDocument();
      expect(screen.getByText('No active members with an email address match this audience.')).toBeInTheDocument();
      expect(button('Approve & send')).toBeDisabled();
    });

    it('says "1 member" when there is one', async () => {
      renderCard(emailAction({ dependsOn: undefined }, { audience: { kind: 'admins' }, rsvp: undefined }));
      fireEvent.click(button('Approve & send to 1 member'));
      expect(confirmSpy).toHaveBeenCalledWith("Send this email to 1 member? This can't be undone.");
      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
    });

    it('only says "everyone" when the audience is every active member', () => {
      const view = renderCard(emailAction({ dependsOn: undefined }, { rsvp: undefined }));
      expect(button('Approve & send to everyone')).toBeInTheDocument();

      view.update(emailAction({ dependsOn: undefined }, { audience: { kind: 'members', memberIds: ['m-alice', 'm-bob'] }, rsvp: undefined }));
      expect(screen.queryByRole('button', { name: /everyone/ })).not.toBeInTheDocument();
      expect(button('Approve & send to 2 members')).toBeInTheDocument();
    });

    // --- after it was sent ------------------------------------------------

    it('follows the sending job once executed, with no buttons', () => {
      mockedListenJob.mockImplementation((id, cb) => {
        cb(job({ id, test: false, status: 'done', sent: 3, total: 3 }));
        return vi.fn();
      });
      renderCard(
        emailAction({ status: 'executed', executedByName: 'Brandon Ellis', result: { jobId: 'job-run-9', total: 3, skipped: 1 } }),
        { actions: [eventExecuted] },
      );

      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByText('Queued for 3 members ✓')).toBeInTheDocument();
      expect(screen.getByText(/check Email → Recent emails for delivery status/)).toBeInTheDocument();
      expect(screen.getByText('1 skipped (no email address)')).toBeInTheDocument();
      expect(screen.getByText(/Approved by Brandon Ellis/)).toBeInTheDocument();
      expect(buttons()).toHaveLength(0);
      expect(screen.queryByLabelText('Send test to')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Announcement card
  // -------------------------------------------------------------------------

  describe('announcement card', () => {
    it('shows the notice, whether it is pinned, and when it expires', () => {
      renderCard(announcementAction());

      expect(screen.getByText('Announcement')).toBeInTheDocument();
      expect(screen.getByText('Pavilion closed')).toBeInTheDocument();
      expect(screen.getByText('The pavilion is closed Saturday.')).toBeInTheDocument();
      expect(screen.getByText('Pinned')).toBeInTheDocument();
      expect(screen.getByText('Expires Fri, Nov 20')).toBeInTheDocument();
    });

    it('Approve posts it as proposed', async () => {
      renderCard(announcementAction());
      fireEvent.click(button('Approve'));
      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({ threadId: 't1', actionId: 'a-ann', mode: 'run' }),
      );
    });

    it('sends edited text and pin as overrides', async () => {
      renderCard(announcementAction());

      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Pavilion closed Nov 7' } });
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Closed for the workday.' } });
      fireEvent.click(screen.getByLabelText('Pin to the top'));
      fireEvent.click(button('Approve'));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedExecute.mock.calls[0][0].overrides).toEqual({
        title: 'Pavilion closed Nov 7',
        body: 'Closed for the workday.',
        pinned: false,
      });
    });

    it('does not post a notice without a title or text', () => {
      renderCard(announcementAction());
      fireEvent.click(button('Edit'));
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: '' } });
      expect(button('Approve')).toBeDisabled();
    });

    it('rejects, and shows the posted state when done', async () => {
      const view = renderCard(announcementAction());
      fireEvent.click(button('Reject'));
      await waitFor(() => expect(mockedReject).toHaveBeenCalledWith('t1', 'a-ann'));

      view.update(announcementAction({ status: 'executed', result: {} }));
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View the Lounge' })).toHaveAttribute('href', '/lounge');
      expect(buttons()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Poll card
  // -------------------------------------------------------------------------

  describe('poll card', () => {
    it('shows the question, the options and when voting closes', () => {
      renderCard(pollAction());

      expect(screen.getByText('Poll')).toBeInTheDocument();
      expect(screen.getByText('Which Saturday works?')).toBeInTheDocument();
      expect(screen.getByText('Nov 7')).toBeInTheDocument();
      expect(screen.getByText('Nov 14')).toBeInTheDocument();
      expect(screen.getByText('Closes Thu, Nov 5')).toBeInTheDocument();
    });

    it('Approve creates it as proposed', async () => {
      renderCard(pollAction());
      fireEvent.click(button('Approve'));
      await waitFor(() =>
        expect(mockedExecute).toHaveBeenCalledWith({ threadId: 't1', actionId: 'a-poll', mode: 'run' }),
      );
    });

    it('sends an edited question and option list as overrides, one option per line', async () => {
      renderCard(pollAction());

      fireEvent.click(button('Edit'));
      expect(screen.getByLabelText('Options (one per line)')).toHaveValue('Nov 7\nNov 14');
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Which Saturday is best?' } });
      fireEvent.change(screen.getByLabelText('Options (one per line)'), {
        target: { value: 'Nov 7\n\n  Nov 14  \nNov 21\n' },
      });
      fireEvent.click(button('Approve'));

      await waitFor(() => expect(mockedExecute).toHaveBeenCalledTimes(1));
      expect(mockedExecute.mock.calls[0][0].overrides).toEqual({
        question: 'Which Saturday is best?',
        options: ['Nov 7', 'Nov 14', 'Nov 21'],
      });
    });

    it('needs between 2 and 10 options', () => {
      renderCard(pollAction());
      fireEvent.click(button('Edit'));

      fireEvent.change(screen.getByLabelText('Options (one per line)'), { target: { value: 'Only one' } });
      expect(screen.getByText('A poll needs 2 to 10 options.')).toBeInTheDocument();
      expect(button('Approve')).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Options (one per line)'), {
        target: { value: Array.from({ length: 11 }, (_, i) => `Option ${i}`).join('\n') },
      });
      expect(button('Approve')).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Options (one per line)'), { target: { value: 'A\nB' } });
      expect(screen.queryByText('A poll needs 2 to 10 options.')).not.toBeInTheDocument();
      expect(button('Approve')).toBeEnabled();
    });

    it('keeps each option to 120 characters', () => {
      renderCard(pollAction());
      fireEvent.click(button('Edit'));

      fireEvent.change(screen.getByLabelText('Options (one per line)'), { target: { value: `Short\n${'x'.repeat(121)}` } });
      expect(screen.getByText('Each option can be at most 120 characters.')).toBeInTheDocument();
      expect(button('Approve')).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Options (one per line)'), { target: { value: `Short\n${'x'.repeat(120)}` } });
      expect(button('Approve')).toBeEnabled();
    });

    it('shows a created poll without buttons', () => {
      renderCard(pollAction({ status: 'executed', result: {} }));
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View polls' })).toHaveAttribute('href', '/polls');
      expect(buttons()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Text safety and unknown proposals
  // -------------------------------------------------------------------------

  it('shows every proposed text literally: markup in a draft is never interpreted', () => {
    const view = renderCard(
      announcementAction({
        summary: 'Post <b>this</b>',
        input: {
          title: '<img src=x onerror="alert(1)">',
          body: 'Line one\n<script>alert(2)</script>',
          pinned: false,
        },
      }),
    );

    expect(view.container.querySelector('b, img, script')).toBeNull();
    expect(screen.getByText('Post <b>this</b>')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(screen.getByText(/<script>alert\(2\)<\/script>/)).toHaveClass('whitespace-pre-wrap');
  });

  it('shows markup in an email draft literally too', () => {
    const view = renderCard(
      emailAction({ dependsOn: undefined }, { subject: '<b>Hi</b>', body: 'Hi {firstName} <img src=x onerror=alert(1)>', rsvp: undefined }),
    );
    expect(view.container.querySelector('b, img')).toBeNull();
    expect(screen.getByText('<b>Hi</b>')).toBeInTheDocument();
  });

  it('shows a proposal type this version does not know as read-only', () => {
    renderCard({
      id: 'a-new',
      type: 'archive_forum_thread',
      summary: 'Archive the old thread',
      status: 'proposed',
      toolUseId: 'toolu_9',
      input: {},
    } as unknown as AssistantAction);

    expect(screen.getByText('Archive the old thread')).toBeInTheDocument();
    expect(screen.getByText(/newer version of the app/i)).toBeInTheDocument();
    expect(buttons()).toHaveLength(0);
  });
});
