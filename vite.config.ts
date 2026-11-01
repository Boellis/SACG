/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // functions/ has its own vitest config + emulator harness (`cd functions && npm test`).
    // .claude/ holds agent worktrees nested in the checkout: other copies of this repo, not tests of this one.
    exclude: ['**/node_modules/**', '**/dist/**', 'test/rules/**', 'functions/**', '.claude/**'],
  },
});
