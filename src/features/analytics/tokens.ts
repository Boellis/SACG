// src/features/analytics/tokens.ts
// Reference dataviz palette (validated). Chart marks read these via props
// (SVG attributes can't resolve CSS vars); page chrome uses the same values
// as CSS custom properties in analytics.css — keep the two files in sync.
export type VizMode = 'light' | 'dark';

export interface VizTokens {
  surface: string; page: string;
  textPrimary: string; textSecondary: string; muted: string;
  grid: string; baseline: string; border: string;
  series1: string; series2: string; series3: string; series4: string;
  seqTrack: string;      // lighter step of the blue ramp (meter track)
  neutralFill: string;   // de-emphasis fill (outstanding remainder, "maybe")
  good: string; warning: string; serious: string;
  deltaUp: string; deltaDown: string;
  sparkLine: string; sparkDot: string;
}

export const VIZ: Record<VizMode, VizTokens> = {
  light: {
    surface: '#fcfcfb', page: '#f9f9f7',
    textPrimary: '#0b0b0b', textSecondary: '#52514e', muted: '#898781',
    grid: '#e1e0d9', baseline: '#c3c2b7', border: 'rgba(11,11,11,0.10)',
    series1: '#2a78d6', series2: '#eb6834', series3: '#1baf7a', series4: '#eda100',
    seqTrack: '#cde2fb', neutralFill: '#e1e0d9',
    good: '#0ca30c', warning: '#fab219', serious: '#ec835a',
    deltaUp: '#006300', deltaDown: '#d03b3b',
    sparkLine: '#c3c2b7', sparkDot: '#2a78d6',
  },
  dark: {
    surface: '#1a1a19', page: '#0d0d0d',
    textPrimary: '#ffffff', textSecondary: '#c3c2b7', muted: '#898781',
    grid: '#2c2c2a', baseline: '#383835', border: 'rgba(255,255,255,0.10)',
    series1: '#3987e5', series2: '#d95926', series3: '#199e70', series4: '#c98500',
    seqTrack: '#184f95', neutralFill: '#383835',
    good: '#0ca30c', warning: '#fab219', serious: '#ec835a',
    deltaUp: '#0ca30c', deltaDown: '#d03b3b',
    sparkLine: '#383835', sparkDot: '#3987e5',
  },
};

export const RED_POLE = { light: '#e34948', dark: '#e66767' }; // RSVP "no" (diverging pole, slot 8)
