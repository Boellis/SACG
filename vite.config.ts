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
    exclude: ['**/node_modules/**', '**/dist/**', 'test/rules/**', 'functions/**'],
  },
});
