import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import SignUp from './SignUp';

// Mock firebase/auth so no real backend is hit
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  updateProfile: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

// Mock ../lib/firebase exports
vi.mock('../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

// Mock ensureMemberDoc from AuthProvider
vi.mock('./AuthProvider', () => ({
  ensureMemberDoc: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import * as firebaseAuth from 'firebase/auth';

const mockedCreateUser = vi.mocked(firebaseAuth.createUserWithEmailAndPassword);
const mockedSignInWithPopup = vi.mocked(firebaseAuth.signInWithPopup);

describe('SignUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders display name, email, and password fields', () => {
    render(
      <MemoryRouter>
        <SignUp />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows validation error and does NOT call createUserWithEmailAndPassword when email is empty', async () => {
    const { container } = render(
      <MemoryRouter>
        <SignUp />
      </MemoryRouter>,
    );

    // Fill in display name and password but leave email empty
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

    // Submit the form directly to bypass HTML5 native validation in jsdom
    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });

    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it('shows validation error and does NOT call createUserWithEmailAndPassword when email is invalid', async () => {
    const { container } = render(
      <MemoryRouter>
        <SignUp />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'notanemail' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

    // Use fireEvent.submit on the form directly to bypass HTML5 native validation
    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });

    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it('calls signInWithPopup when "Continue with Google" is clicked', async () => {
    mockedSignInWithPopup.mockResolvedValueOnce({
      user: { uid: 'test-uid', email: 'test@example.com', displayName: 'Test User' },
    } as any);

    render(
      <MemoryRouter>
        <SignUp />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => {
      expect(mockedSignInWithPopup).toHaveBeenCalledTimes(1);
    });
  });
});
