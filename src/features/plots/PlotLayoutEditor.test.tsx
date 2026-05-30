import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock plotsApi setPlotLayout
vi.mock('./plotsApi', () => ({
  setPlotLayout: vi.fn().mockResolvedValue(undefined),
}));

import * as plotsApiMod from './plotsApi';
import PlotLayoutEditor from './PlotLayoutEditor';
import type { Plot } from '../../lib/types';

const mockedSetPlotLayout = vi.mocked(plotsApiMod.setPlotLayout);

// Mutable auth value configured per test (mirrors CropsEditor.test pattern).
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
  crops: [],
  notes: '',
};

describe('PlotLayoutEditor', () => {
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

    it('renders the toolbar and Save button', () => {
      render(<PlotLayoutEditor plot={basePlot} />);
      expect(screen.getByRole('button', { name: /\+ rectangle/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save layout/i })).toBeInTheDocument();
    });

    it('clicking "+ Rectangle" renders an SVG rect shape', () => {
      const { container } = render(<PlotLayoutEditor plot={basePlot} />);
      // Before: only the background bed rect.
      const before = container.querySelectorAll('g[data-shape-id]').length;
      expect(before).toBe(0);

      fireEvent.click(screen.getByRole('button', { name: /\+ rectangle/i }));

      const groups = container.querySelectorAll('g[data-shape-id][data-shape-type="rect"]');
      expect(groups.length).toBe(1);
      // The shape group contains an actual <rect> element.
      expect(groups[0].querySelector('rect')).not.toBeNull();
    });

    it('clicking Save calls setPlotLayout with the plot id and one shape', async () => {
      render(<PlotLayoutEditor plot={basePlot} />);

      fireEvent.click(screen.getByRole('button', { name: /\+ rectangle/i }));
      fireEvent.click(screen.getByRole('button', { name: /save layout/i }));

      await waitFor(() => {
        expect(mockedSetPlotLayout).toHaveBeenCalledTimes(1);
      });

      const [plotId, layout] = mockedSetPlotLayout.mock.calls[0] as [
        string,
        { shapes: Array<{ type: string }> },
      ];
      expect(plotId).toBe('7');
      expect(layout.shapes).toHaveLength(1);
      expect(layout.shapes[0].type).toBe('rect');
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

    it('renders the toolbar (admin can edit)', () => {
      render(<PlotLayoutEditor plot={basePlot} />);
      expect(screen.getByRole('button', { name: /save layout/i })).toBeInTheDocument();
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

    it('does not render the toolbar or Save — read-only', () => {
      render(<PlotLayoutEditor plot={basePlot} />);
      expect(screen.queryByRole('button', { name: /save layout/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /\+ rectangle/i })).not.toBeInTheDocument();
    });

    it('shows "No layout yet." when there are no shapes', () => {
      render(<PlotLayoutEditor plot={basePlot} />);
      expect(screen.getByText(/no layout yet/i)).toBeInTheDocument();
    });

    it('renders the saved shapes read-only when a layout exists', () => {
      const plotWithLayout: Plot = {
        ...basePlot,
        layout: {
          shapes: [
            { id: 'a', type: 'circle', x: 10, y: 10, w: 40, h: 40, color: '#65a30d', label: 'Herbs' },
          ],
        },
      };
      const { container } = render(<PlotLayoutEditor plot={plotWithLayout} />);
      expect(screen.queryByRole('button', { name: /save layout/i })).not.toBeInTheDocument();
      expect(container.querySelector('g[data-shape-id="a"]')).not.toBeNull();
      expect(screen.getByText('Herbs')).toBeInTheDocument();
    });
  });
});
