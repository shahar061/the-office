import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

// Copied from electron.vite.config.ts — keep in sync.
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
  plugins: [react(), tiledJsonPlugin()],
  root: path.resolve(__dirname, 'src/mobile-renderer'),
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@office': path.resolve(__dirname, 'src/renderer/src/office'),
      '@': path.resolve(__dirname, 'src/renderer/src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/mobile-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/mobile-renderer/index.html'),
        harness: path.resolve(__dirname, 'src/mobile-renderer/dev-harness.html'),
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
