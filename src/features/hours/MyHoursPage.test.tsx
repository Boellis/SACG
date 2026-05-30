import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock hoursApi
vi.mock('./hoursApi', () => ({
  listenMemberHours: vi.fn(),
  addHours: vi.fn().mockResolvedValue(undefined),
  deleteHours: vi.fn().mockResolvedValue(undefined),
}));

// Mock useAuth
vi.mock('../../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock firebase/firestore (getDoc for settings)
vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
}));

// Mock data/collections
vi.mock('../../data/collections', () => ({
  settingsDoc: vi.fn(() => ({ _path: 'settings/org' })),
}));

import * as hoursApiMod from './hoursApi';
import * as useAuthMod from '../../auth/useAuth';
import * as firestoreMod from 'firebase/firestore';
import MyHoursPage from './MyHoursPage';

const mockedListenMemberHours = vi.mocked(hoursApiMod.listenMemberHours);
const mockedAddHours = vi.mocked(hoursApiMod.addHours);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);
const mockedGetDoc = vi.mocked(firestoreMod.getDoc);

function makeTimestamp(dateStr: string) {
  return {
    toDate: () => new Date(dateStr),
    seconds: Math.floor(new Date(dateStr).getTime() / 1000),
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-uid',
    uid: 'member-uid',
    email: 'member@test.com',
    displayName: 'Test Member',
    role: 'member' as const,
    status: 'active' as const,
    createdAt: makeTimestamp('2024-01-01'),
    joinedAt: makeTimestamp('2024-01-01'),
    currentYearHours: 0,
    ...overrides,
  };
}

// Fixture: 2 entries in 2026, total 6 hours
const FIXTURE_ENTRIES = [
  {
    id: 'entry-1',
    memberId: 'member-uid',
    date: makeTimestamp('2026-03-10T00:00:00Z'),
    hours: 4,
    description: 'Spring cleanup',
    recordedBy: 'member-uid',
    createdAt: makeTimestamp('2026-03-10T00:00:00Z'),
  },
  {
    id: 'entry-2',
    memberId: 'member-uid',
    date: makeTimestamp('2026-04-05T00:00:00Z'),
    hours: 2,
    description: 'Weeding',
    recordedBy: 'member-uid',
    createdAt: makeTimestamp('2026-04-05T00:00:00Z'),
  },
];

describe('MyHoursPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      user: null,
      role: 'member',
      status: 'active',
      loading: false,
      member: makeMember() as any,
    });

    mockedListenMemberHours.mockImplementation((_memberId, cb) => {
      cb(FIXTURE_ENTRIES as any);
      return vi.fn();
    });

    // Settings doc: returns default-like settings
    mockedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        requiredHours: 12,
        firstHalfHours: 6,
        firstHalfMonths: 6,
        defaultDeposit: 25,
        currentSeason: '2026',
        contactEmail: 'test@test.com',
      }),
    } as any);
  });

  it('listens to hours for the logged-in member id', () => {
    render(
      <MemoryRouter>
        <MyHoursPage />
      </MemoryRouter>,
    );
    expect(mockedListenMemberHours).toHaveBeenCalledWith('member-uid', expect.any(Function));
  });

  it('renders YTD total from fixture entries (6 hrs shown in progress)', async () => {
    render(
      <MemoryRouter>
        <MyHoursPage />
      </MemoryRouter>,
    );
    // 6 hours total (4 + 2), requirement 12 → "6 / 12 hrs"
    await waitFor(() => {
      expect(screen.getByText(/6\s*\/\s*12\s*hrs/)).toBeInTheDocument();
    });
  });

  it('renders entry descriptions in the list', () => {
    render(
      <MemoryRouter>
        <MyHoursPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Spring cleanup')).toBeInTheDocument();
    expect(screen.getByText('Weeding')).toBeInTheDocument();
  });

  it('calls addHours with member id when form is submitted', async () => {
    render(
      <MemoryRouter>
        <MyHoursPage />
      </MemoryRouter>,
    );

    // Fill in hours
    const hoursInput = screen.getByLabelText(/hours/i);
    fireEvent.change(hoursInput, { target: { value: '3' } });

    const submitBtn = screen.getByRole('button', { name: /log hours/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockedAddHours).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: 'member-uid',
          recordedBy: 'member-uid',
          hours: 3,
        }),
      );
    });
  });

  it('shows "In progress" badge when hours requirement not met', async () => {
    render(
      <MemoryRouter>
        <MyHoursPage />
      </MemoryRouter>,
    );
    // 6 < 12 required → "In progress"
    await waitFor(() => {
      expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no entries', () => {
    mockedListenMemberHours.mockImplementation((_id, cb) => {
      cb([]);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <MyHoursPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no hours logged yet/i)).toBeInTheDocument();
  });
});
