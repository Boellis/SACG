// src/features/analytics/tokens.ts
// Reference dataviz palette (validated), light mode. Chart marks read these
// via props (SVG attributes can't resolve CSS vars); page chrome uses the same
// values as CSS custom properties in analytics.css — keep the two files in sync.
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

export const VIZ: VizTokens = {
  surface: '#fcfcfb', page: '#f9f9f7',
  textPrimary: '#0b0b0b', textSecondary: '#52514e', muted: '#898781',
  grid: '#e1e0d9', baseline: '#c3c2b7', border: 'rgba(11,11,11,0.10)',
  series1: '#2a78d6', series2: '#eb6834', series3: '#1baf7a', series4: '#eda100',
  seqTrack: '#cde2fb', neutralFill: '#e1e0d9',
  good: '#0ca30c', warning: '#fab219', serious: '#ec835a',
  deltaUp: '#006300', deltaDown: '#d03b3b',
  sparkLine: '#c3c2b7', sparkDot: '#2a78d6',
};

export const RED_POLE = '#e34948'; // RSVP "no" (diverging pole, slot 8)
