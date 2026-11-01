import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./rsvpApi', () => ({
  getInvite: vi.fn(),
  submitRsvp: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({ auth: {}, db: {}, app: {}, functions: {} }));

import * as rsvpApiMod from './rsvpApi';
import RsvpPage from './RsvpPage';
import type { InviteView } from './rsvpApi';

const mockedGetInvite = vi.mocked(rsvpApiMod.getInvite);
const mockedSubmit = vi.mocked(rsvpApiMod.submitRsvp);

const view = (over: Partial<InviteView> = {}): InviteView => ({
  event: {
    id: 'NOV7',
    title: 'November Meeting',
    type: 'meeting',
    start: '2026-11-07T15:00:00.000Z', // 9:00 AM garden time (CST)
    end: '2026-11-07T16:00:00.000Z',
    allDay: false,
    location: 'Garden pavilion',
    description: 'Monthly meeting, then the workday.',
  },
  firstName: 'Denny',
  response: null,
  open: true,
  ...over,
});

const callableError = (code: string, message: string) => Object.assign(new Error(message), { code });

function renderAt(path = '/rsvp/tok123?answer=yes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rsvp/:token" element={<RsvpPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RsvpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetInvite.mockResolvedValue(view());
  });

  it('shows the event in garden time', async () => {
    renderAt();
    expect(await screen.findByText('November Meeting')).toBeInTheDocument();
    expect(mockedGetInvite).toHaveBeenCalledWith('tok123');
    expect(screen.getByText(/Saturday, November 7/)).toBeInTheDocument();
    expect(screen.getByText(/9:00 AM/)).toBeInTheDocument();
    expect(screen.getByText('Garden pavilion')).toBeInTheDocument();
    expect(screen.getByText(/Hi Denny/)).toBeInTheDocument();
  });

  it('preselects the answer from ?answer=', async () => {
    renderAt('/rsvp/tok123?answer=yes');
    expect(await screen.findByRole('radio', { name: /^yes/i })).toBeChecked();
  });

  it('submits a yes for 2 people and confirms', async () => {
    mockedSubmit.mockResolvedValue({ response: { status: 'yes', partySize: 2 } });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /one more person/i }));
    expect(screen.getByLabelText(/how many people, including you/i)).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: /send my rsvp/i }));

    await waitFor(() =>
      expect(mockedSubmit).toHaveBeenCalledWith({ token: 'tok123', status: 'yes', partySize: 2, note: '' }),
    );
    expect(await screen.findByText(/Thanks, Denny!/)).toBeInTheDocument();
    expect(screen.getByText(/change your answer anytime with this same link/i)).toBeInTheDocument();
    const cal = screen.getByRole('link', { name: /add to google calendar/i }).getAttribute('href') ?? '';
    expect(cal.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    const params = new URL(cal).searchParams;
    expect(params.get('action')).toBe('TEMPLATE');
    expect(params.get('text')).toBe('November Meeting');
    expect(params.get('dates')).toBe('20261107T150000Z/20261107T160000Z');
    expect(params.get('location')).toBe('Garden pavilion');
  });

  it('a No hides the party size and sends none', async () => {
    mockedSubmit.mockResolvedValue({ response: { status: 'no' } });
    renderAt('/rsvp/tok123?answer=no');
    expect(await screen.findByRole('radio', { name: /can't make it/i })).toBeChecked();
    expect(screen.queryByLabelText(/how many people/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/note for organizers/i), { target: { value: 'Next time!' } });
    fireEvent.click(screen.getByRole('button', { name: /send my rsvp/i }));

    await waitFor(() =>
      expect(mockedSubmit).toHaveBeenCalledWith({ token: 'tok123', status: 'no', note: 'Next time!' }),
    );
    expect(await screen.findByText(/Thanks, Denny!/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /add to google calendar/i })).not.toBeInTheDocument();
  });

  it('prefills an earlier answer when the link has no ?answer=', async () => {
    mockedGetInvite.mockResolvedValue(view({ response: { status: 'maybe', partySize: 3, note: 'veggie' } }));
    renderAt('/rsvp/tok123');
    expect(await screen.findByRole('radio', { name: /^maybe/i })).toBeChecked();
    expect(screen.getByLabelText(/how many people, including you/i)).toHaveValue(3);
    expect(screen.getByLabelText(/note for organizers/i)).toHaveValue('veggie');
    expect(screen.getByRole('button', { name: /update my rsvp/i })).toBeInTheDocument();
  });

  it('shows the invalid-link copy for a not-found link', async () => {
    mockedGetInvite.mockRejectedValue(callableError('functions/not-found', "This RSVP link isn't valid."));
    renderAt();
    expect(await screen.findByText(/This RSVP link isn't valid/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'southatxgarden@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:southatxgarden@gmail.com',
    );
    expect(screen.queryByRole('button', { name: /send my rsvp/i })).not.toBeInTheDocument();
  });

  it('shows the closed copy and no submit button once the event is over', async () => {
    mockedGetInvite.mockResolvedValue(view({ open: false }));
    renderAt();
    expect(await screen.findByText(/This event has already happened/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send my rsvp/i })).not.toBeInTheDocument();
  });

  it('switches to the closed copy if the event ends before submitting', async () => {
    mockedSubmit.mockRejectedValue(callableError('functions/failed-precondition', 'RSVPs are closed.'));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /send my rsvp/i }));
    expect(await screen.findByText(/This event has already happened/)).toBeInTheDocument();
  });

  it("shows the server's message when the link has been used too often", async () => {
    mockedSubmit.mockRejectedValue(
      callableError('functions/resource-exhausted', 'This RSVP link has been used too many times.'),
    );
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /send my rsvp/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This RSVP link has been used too many times.');
  });

  it('offers a retry when loading fails for another reason', async () => {
    mockedGetInvite.mockRejectedValueOnce(callableError('functions/unavailable', 'offline'));
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
    expect(await screen.findByText('November Meeting')).toBeInTheDocument();
    expect(mockedGetInvite).toHaveBeenCalledTimes(2);
  });
});
