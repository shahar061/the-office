import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

// Treat .tmj (Tiled JSON) files as JSON imports
function tiledJsonPlugin(): Plugin {
  return {
    name: 'tiled-json',
    transform(code, id) {
      if (id.endsWith('.tmj')) {
        return {
          code: `export default ${code}`,
          map: null,
        };
      }
    },
  };
}

// SeedEngine.FIXTURES_DIR resolves to dist/fixtures at runtime
// (path.resolve(__dirname, '..', 'fixtures') from dist/main/), so the
// fixture tree must be copied there after each main build.
function copyDevJumpFixturesPlugin(): Plugin {
  return {
    name: 'copy-dev-jump-fixtures',
    closeBundle() {
      const src = path.resolve(__dirname, 'dev-jump/fixtures');
      const dst = path.resolve(__dirname, 'dist/fixtures');
      if (!fs.existsSync(src)) return;
      fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(src, dst, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [copyDevJumpFixturesPlugin()],
    build: {
      outDir: 'dist/main',
      lib: {
        entry: 'electron/main.ts',
        formats: ['cjs'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: 'electron/preload.ts',
        formats: ['cjs'],
      },
    },
  },
  renderer: {
    plugins: [react(), tiledJsonPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    define: { __APP_VERSION__: JSON.stringify(require('./package.json').version) },
    build: {
      outDir: 'dist/renderer',
    },
  },
});