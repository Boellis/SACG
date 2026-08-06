import '@testing-library/jest-dom';

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer (used across the
// analytics dashboard) needs one to mount without throwing.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
