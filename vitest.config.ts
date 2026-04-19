import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', '**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', 'mobile/**', 'relay/**', 'landing/**'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
      '@electron': resolve(process.cwd(), 'electron'),
      '@shared': resolve(process.cwd(), 'shared'),
    },
  },
});
