import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/rules/**/*.test.ts'],
    globals: true,
    testTimeout: 15000,
  },
});
