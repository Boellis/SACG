import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';

// Mock forumApi before importing the component
vi.mock('./forumApi', () => ({
  listenThreads: vi.fn(),
  createThread: vi.fn().mockResolvedValue(undefined),
  deleteThread: vi.fn().mockResolvedValue(undefined),
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

import * as forumApiMod from './forumApi';
import * as useAuthMod from '../../auth/useAuth';
import ForumPage from './ForumPage';

const mockedListenThreads = vi.mocked(forumApiMod.listenThreads);
const mockedCreateThread = vi.mocked(forumApiMod.createThread);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-uid',
    uid: 'member-uid',
    email: 'member@test.com',
    displayName: 'Alice Member',
    role: 'member',
    status: 'active',
    currentYearHours: 0,
    createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    ...overrides,
  };
}

function makeThread(overrides: Partial<{
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
}> = {}) {
  return {
    id: overrides.id ?? 'thread-1',
    title: overrides.title ?? 'Test Thread',
    body: overrides.body ?? 'Thread body content.',
    authorId: overrides.authorId ?? 'member-uid',
    authorName: overrides.authorName ?? 'Alice Member',
    createdAt: { toDate: () => new Date('2026-01-15') } as unknown as Timestamp,
  };
}

describe('ForumPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      user: { uid: 'member-uid' } as any,
      member: makeMember() as any,
      role: 'member',
      status: 'active',
      loading: false,
    });

    mockedListenThreads.mockImplementation((cb) => {
      cb([]);
      return vi.fn();
    });
  });

  it('renders the Message Board heading', () => {
    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Message Board')).toBeInTheDocument();
  });

  it('renders a thread title from listenThreads fixture', () => {
    const fixture = makeThread({ title: 'Tomato Growing Tips' });
    mockedListenThreads.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Tomato Growing Tips')).toBeInTheDocument();
  });

  it('shows "No threads yet" when list is empty', () => {
    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No threads yet/i)).toBeInTheDocument();
  });

  it('submitting New Thread form calls createThread with author id and name', async () => {
    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    const titleInput = screen.getByLabelText('Title');
    const bodyTextarea = screen.getByLabelText('Body');
    const submitButton = screen.getByRole('button', { name: /post thread/i });

    fireEvent.change(titleInput, { target: { value: 'My New Thread' } });
    fireEvent.change(bodyTextarea, { target: { value: 'This is the body of my thread.' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockedCreateThread).toHaveBeenCalledTimes(1);
      expect(mockedCreateThread).toHaveBeenCalledWith({
        title: 'My New Thread',
        body: 'This is the body of my thread.',
        authorId: 'member-uid',
        authorName: 'Alice Member',
      });
    });
  });

  it('shows validation error when submitting empty title', async () => {
    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    const submitButton = screen.getByRole('button', { name: /post thread/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Title and body are required.')).toBeInTheDocument();
    });
    expect(mockedCreateThread).not.toHaveBeenCalled();
  });

  it('shows a delete button for the author\'s own thread', () => {
    const fixture = makeThread({ authorId: 'member-uid' });
    mockedListenThreads.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('does not show delete button for threads by another member', () => {
    const fixture = makeThread({ authorId: 'other-member', authorName: 'Other Person' });
    mockedListenThreads.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('admin sees delete button on any thread', () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'admin-uid' } as any,
      member: makeMember({ id: 'admin-uid', role: 'admin' }) as any,
      role: 'admin',
      status: 'active',
      loading: false,
    });

    const fixture = makeThread({ authorId: 'other-member', authorName: 'Some Person' });
    mockedListenThreads.mockImplementation((cb) => {
      cb([fixture] as any);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
});
