import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock settingsApi
vi.mock('./settingsApi', () => ({
  listenSettings: vi.fn(),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

// Mock useAuth (admin)
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ uid: 'admin-uid', role: 'admin', status: 'active', displayName: 'Admin' }),
}));

import * as settingsApiMod from './settingsApi';
import SettingsPage from './SettingsPage';

const mockedListenSettings = vi.mocked(settingsApiMod.listenSettings);
const mockedSaveSettings = vi.mocked(settingsApiMod.saveSettings);

const FIXTURE_SETTINGS = {
  requiredHours: 14,
  firstHalfHours: 7,
  firstHalfMonths: 5,
  defaultDeposit: 30,
  currentSeason: '2025',
  contactEmail: 'garden@example.com',
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedListenSettings.mockImplementation((cb) => {
      cb(FIXTURE_SETTINGS);
      return vi.fn();
    });
  });

  it('shows loading state before settings arrive', () => {
    // Don't call cb immediately
    mockedListenSettings.mockImplementation(() => vi.fn());

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
  });

  it('renders fixture values in the form fields', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/required hours/i)).toHaveValue(14);
    expect(screen.getByLabelText(/first-half hours/i)).toHaveValue(7);
    expect(screen.getByLabelText(/first-half months/i)).toHaveValue(5);
    expect(screen.getByLabelText(/default deposit/i)).toHaveValue(30);
    expect(screen.getByLabelText(/current season/i)).toHaveValue('2025');
    expect(screen.getByLabelText(/contact email/i)).toHaveValue('garden@example.com');
  });

  it('calls saveSettings with updated requiredHours as a number when Save is clicked', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const requiredHoursInput = screen.getByLabelText(/required hours/i);
    fireEvent.change(requiredHoursInput, { target: { value: '20' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedSaveSettings).toHaveBeenCalledTimes(1);
    });

    const [patch] = mockedSaveSettings.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(patch.requiredHours).toBe(20);
    expect(typeof patch.requiredHours).toBe('number');
  });

  it('shows "Saved ✓" confirmation after successful save', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
  });

  it('shows save error when saveSettings throws', async () => {
    mockedSaveSettings.mockRejectedValueOnce(new Error('Permission denied'));

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    });
  });

  it('uses defaults when listenSettings yields null', () => {
    mockedListenSettings.mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/required hours/i)).toHaveValue(12);
    expect(screen.getByLabelText(/contact email/i)).toHaveValue('southatxgarden@gmail.com');
  });
});
