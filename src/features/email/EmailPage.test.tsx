import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock membersApi so no Firestore calls happen
vi.mock('../members/membersApi', () => ({
  listenMembers: vi.fn(),
}));

// Mock mailApi so no Firestore collection refs are constructed at import time
vi.mock('./mailApi', () => ({
  enqueueIndividualEmails: vi.fn().mockResolvedValue(2),
  listenRecentMail: vi.fn(() => vi.fn()),
}));

// Mock useAuth to return an admin user
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ uid: 'admin-uid', role: 'admin', status: 'active', displayName: 'Admin' }),
}));

// Mock firebase/firestore (needed for module resolution)
vi.mock('firebase/firestore', () => ({}));

import * as membersApiMod from '../members/membersApi';
import * as mailApiMod from './mailApi';
import EmailPage from './EmailPage';

const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedEnqueue = vi.mocked(mailApiMod.enqueueIndividualEmails);

// Fixture members: 2 active + 1 pending
const fixtureMembers = [
  {
    id: 'member-1',
    uid: 'uid-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    role: 'member' as const,
    status: 'active' as const,
    currentYearHours: 0,
    createdAt: null,
  },
  {
    id: 'member-2',
    uid: 'uid-2',
    email: 'bob@example.com',
    displayName: 'Bob',
    role: 'member' as const,
    status: 'active' as const,
    currentYearHours: 0,
    createdAt: null,
  },
  {
    id: 'member-3',
    uid: 'uid-3',
    email: 'charlie@example.com',
    displayName: 'Charlie',
    role: 'member' as const,
    status: 'pending' as const,
    currentYearHours: 0,
    createdAt: null,
  },
];

describe('EmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListenMembers.mockImplementation((cb) => {
      cb(fixtureMembers as any);
      return vi.fn(); // unsubscribe
    });
  });

  it('shows "Compose in Gmail" button', () => {
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /compose in gmail/i })).toBeInTheDocument();
  });

  it('defaults to "All active members" mode and shows 2 recipients', () => {
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    // The pending member (Charlie) should not be counted
    expect(screen.getByText(/will bcc 2 members/i)).toBeInTheDocument();
  });

  it('Compose in Gmail button is enabled when there are recipients', () => {
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /compose in gmail/i });
    expect(btn).not.toBeDisabled();
  });

  it('mailto link contains both active member emails', () => {
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    const mailtoLink = screen.getByRole('link', { name: /use my mail app/i });
    const href = mailtoLink.getAttribute('href') ?? '';
    expect(href).toContain('alice%40example.com');
    expect(href).toContain('bob%40example.com');
    // Pending member should NOT be in the mailto
    expect(href).not.toContain('charlie%40example.com');
  });

  it('does not include pending member emails', () => {
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    // Charlie is pending, should not count
    expect(screen.queryByText(/charlie/i)).not.toBeInTheDocument();
  });

  it('Compose in Gmail is disabled when there are no recipients', () => {
    mockedListenMembers.mockImplementation((cb) => {
      cb([]); // no members
      return vi.fn();
    });
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: /compose in gmail/i });
    expect(btn).toBeDisabled();
  });

  it('shows helper text about BCC', () => {
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/recipients are bcc/i)).toBeInTheDocument();
  });

  it('queues one individual email per active recipient on "Send individually"', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Hi {firstName}' } });
    fireEvent.click(screen.getByRole('button', { name: /send individually/i }));

    await waitFor(() => expect(mockedEnqueue).toHaveBeenCalledTimes(1));
    const [recipients, subject] = mockedEnqueue.mock.calls[0];
    // Only the 2 active members (Alice, Bob) — pending Charlie excluded
    expect(recipients.map((r) => r.email)).toEqual(['alice@example.com', 'bob@example.com']);
    expect(subject).toBe('Hi {firstName}');
    confirmSpy.mockRestore();
  });

  it('does not queue emails if the send is not confirmed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <MemoryRouter>
        <EmailPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /send individually/i }));
    expect(mockedEnqueue).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
