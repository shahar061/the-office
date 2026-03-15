import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
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

export default defineConfig({
  main: {
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
    build: {
      outDir: 'dist/renderer',
    },
  },
});