import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock membersApi so no Firestore calls happen
vi.mock('./membersApi', () => ({
  listenMembers: vi.fn(),
  approveMember: vi.fn().mockResolvedValue(undefined),
}));

// Mock useAuth to return an admin user
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ uid: 'admin-uid', role: 'admin', status: 'active', displayName: 'Admin' }),
}));

// Mock firebase/firestore (not used directly in WaitlistPage, but needed for module resolution)
vi.mock('firebase/firestore', () => ({}));

import * as membersApiMod from './membersApi';
import WaitlistPage from './WaitlistPage';

const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
const mockedApproveMember = vi.mocked(membersApiMod.approveMember);

// Helper to build a fake Member with the minimal required fields
function makeMember(overrides: Record<string, unknown>) {
  return {
    id: 'test-id',
    uid: null,
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'member',
    status: 'pending',
    createdAt: { toMillis: () => 1000, toDate: () => new Date(1000) },
    currentYearHours: 0,
    ...overrides,
  };
}

describe('WaitlistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: listenMembers immediately calls cb with fixture data
    mockedListenMembers.mockImplementation((cb) => {
      cb([
        makeMember({
          id: 'older',
          displayName: 'Older Pending',
          email: 'older@example.com',
          status: 'pending',
          createdAt: { toMillis: () => 1000, toDate: () => new Date(1000) },
        }) as any,
        makeMember({
          id: 'newer',
          displayName: 'Newer Pending',
          email: 'newer@example.com',
          status: 'pending',
          createdAt: { toMillis: () => 2000, toDate: () => new Date(2000) },
        }) as any,
        makeMember({
          id: 'active-member',
          displayName: 'Active Member',
          email: 'active@example.com',
          status: 'active',
          createdAt: { toMillis: () => 500, toDate: () => new Date(500) },
        }) as any,
      ]);
      return vi.fn(); // unsubscribe
    });
  });

  it('renders only the 2 pending members, not the active one', () => {
    render(
      <MemoryRouter>
        <WaitlistPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Older Pending')).toBeInTheDocument();
    expect(screen.getByText('Newer Pending')).toBeInTheDocument();
    expect(screen.queryByText('Active Member')).not.toBeInTheDocument();
  });

  it('renders pending members in oldest-first order', () => {
    render(
      <MemoryRouter>
        <WaitlistPage />
      </MemoryRouter>,
    );

    const rows = screen.getAllByRole('row');
    // rows[0] is the header; rows[1] is Older Pending; rows[2] is Newer Pending
    expect(rows[1]).toHaveTextContent('Older Pending');
    expect(rows[2]).toHaveTextContent('Newer Pending');
  });

  it('clicking Approve calls approveMember with the correct id', () => {
    render(
      <MemoryRouter>
        <WaitlistPage />
      </MemoryRouter>,
    );

    const approveButtons = screen.getAllByRole('button', { name: /approve/i });
    fireEvent.click(approveButtons[0]); // first row = Older Pending

    expect(mockedApproveMember).toHaveBeenCalledWith('older');
  });

  it('shows friendly empty state when no one is on the waitlist', () => {
    mockedListenMembers.mockImplementation((cb) => {
      cb([
        makeMember({
          id: 'active-member',
          displayName: 'Active Member',
          status: 'active',
          createdAt: { toMillis: () => 500, toDate: () => new Date(500) },
        }) as any,
      ]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <WaitlistPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/no one on the waitlist/i)).toBeInTheDocument();
  });
});
