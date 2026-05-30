import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect } from 'vitest';
import Layout from './Layout';

// Mock useAuth so we don't need Firebase
vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock auth from firebase to avoid real firebase init in Layout
vi.mock('../lib/firebase', () => ({
  auth: {},
}));

// Mock signOut from AuthProvider
vi.mock('../auth/AuthProvider', () => ({
  signOut: vi.fn(),
}));

import { useAuth } from '../auth/useAuth';
const mockedUseAuth = vi.mocked(useAuth);

describe('Layout nav links', () => {
  it('shows member-visible links but NOT admin-only links when role is member', () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'u1', email: 'member@test.com' } as any,
      member: { displayName: 'Test Member' } as any,
      role: 'member',
      status: 'active',
      loading: false,
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    // Member links should be present
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /plots/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my hours/i })).toBeInTheDocument();

    // Admin-only links should NOT be present
    expect(screen.queryByRole('link', { name: /^members$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /waitlist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dues/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('shows all links including admin-only links when role is admin', () => {
    mockedUseAuth.mockReturnValue({
      user: { uid: 'a1', email: 'admin@test.com' } as any,
      member: { displayName: 'Admin User' } as any,
      role: 'admin',
      status: 'active',
      loading: false,
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    // Member links
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /plots/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my hours/i })).toBeInTheDocument();

    // Admin-only links
    expect(screen.getByRole('link', { name: /^members$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /waitlist/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dues/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });
});
