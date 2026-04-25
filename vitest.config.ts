import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', '**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', 'mobile/**', 'relay/**', 'landing/**'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src/renderer/src'),
      '@electron': resolve(process.cwd(), 'electron'),
      '@shared': resolve(process.cwd(), 'shared'),
    },
  },
});
