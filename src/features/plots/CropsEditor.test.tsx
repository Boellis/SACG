import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock plotsApi setCrops
vi.mock('./plotsApi', () => ({
  setCrops: vi.fn().mockResolvedValue(undefined),
  listenPlot: vi.fn(() => vi.fn()),
  listenPlots: vi.fn(() => vi.fn()),
  assignPlot: vi.fn().mockResolvedValue(undefined),
  unassignPlot: vi.fn().mockResolvedValue(undefined),
  splitPlot: vi.fn().mockResolvedValue(undefined),
  createPlot: vi.fn().mockResolvedValue(undefined),
  updatePlot: vi.fn().mockResolvedValue(undefined),
  toggleDuesPaid: vi.fn().mockResolvedValue(undefined),
  toggleDepositPaid: vi.fn().mockResolvedValue(undefined),
}));

// Mock firebase (transitive imports)
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(() => vi.fn()),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

import * as plotsApiMod from './plotsApi';
import CropsEditor from './CropsEditor';
import type { Plot } from '../../lib/types';

const mockedSetCrops = vi.mocked(plotsApiMod.setCrops);

// We need to configure useAuth differently per test, so we use a mutable variable
let mockAuthValue = {
  member: null as null | { id: string },
  role: undefined as undefined | string,
  user: null,
  status: undefined as undefined | string,
  loading: false,
};

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => mockAuthValue,
}));

const basePlot: Plot = {
  id: '7',
  number: 7,
  half: 'whole',
  size: '10x20',
  status: 'assigned',
  holderMemberId: 'holder-uid',
  holderName: 'Alice Holder',
  duesAmount: 100,
  depositAmount: 25,
  duesPaid: false,
  depositPaid: false,
  season: '2026',
  crops: [{ name: 'Tomato', notes: 'cherry variety' }],
  notes: '',
};

describe('CropsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when current user is the plot holder', () => {
    beforeEach(() => {
      mockAuthValue = {
        member: { id: 'holder-uid' },
        role: 'member',
        user: null,
        status: 'active',
        loading: false,
      };
    });

    it('renders edit inputs for existing crops', () => {
      render(<CropsEditor plot={basePlot} />);
      const nameInputs = screen.getAllByRole('textbox');
      // Should have inputs for existing crops (name + notes) plus any new ones
      expect(nameInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('shows the Save button', () => {
      render(<CropsEditor plot={basePlot} />);
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('allows adding a new crop and clicking Save calls setCrops with the new crop', async () => {
      render(<CropsEditor plot={basePlot} />);

      // Click "Add crop" to add a row
      const addButton = screen.getByRole('button', { name: /add crop/i });
      fireEvent.click(addButton);

      // Find all "Crop name" inputs — last one is the new row
      const nameInputs = screen.getAllByLabelText('Crop name');
      const newNameInput = nameInputs[nameInputs.length - 1];
      fireEvent.change(newNameInput, { target: { value: 'Basil' } });

      // Click Save
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockedSetCrops).toHaveBeenCalledTimes(1);
      });

      const [plotId, crops] = mockedSetCrops.mock.calls[0] as [string, Array<{ name: string }>];
      expect(plotId).toBe('7');
      const cropNames = crops.map((c) => c.name);
      expect(cropNames).toContain('Basil');
      expect(cropNames).toContain('Tomato');
    });
  });

  describe('when current user is an admin (not the holder)', () => {
    beforeEach(() => {
      mockAuthValue = {
        member: { id: 'admin-uid' },
        role: 'admin',
        user: null,
        status: 'active',
        loading: false,
      };
    });

    it('renders edit inputs (admin can edit)', () => {
      render(<CropsEditor plot={basePlot} />);
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  describe('when current user is a different member (not holder, not admin)', () => {
    beforeEach(() => {
      mockAuthValue = {
        member: { id: 'other-uid' },
        role: 'member',
        user: null,
        status: 'active',
        loading: false,
      };
    });

    it('does not render edit inputs — read-only view', () => {
      render(<CropsEditor plot={basePlot} />);
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add crop/i })).not.toBeInTheDocument();
    });

    it('shows the existing crops in read-only list', () => {
      render(<CropsEditor plot={basePlot} />);
      expect(screen.getByText('Tomato')).toBeInTheDocument();
    });
  });
});
