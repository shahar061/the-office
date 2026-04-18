import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
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
  // Inline JS/CSS/images into a single self-contained HTML file. The mobile
  // app extracts the HTML with `expo-asset`, which only ships the one file
  // into the on-device cache — any `./assets/*.js` siblings would 404. With
  // singleFile, the HTML carries everything it needs inline (images as
  // base64). assetsInlineLimit:0 would force URL-mode for all assets, so we
  // leave it at Vite's large default to allow images to be inlined.
  plugins: [react(), tiledJsonPlugin(), viteSingleFile({ removeViteModuleLoader: true })],
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
    // Raise the inline threshold so sprite/tileset PNGs (up to ~200 KB) are
    // base64-embedded into the HTML instead of emitted as separate files.
    assetsInlineLimit: 512 * 1024,
    // viteSingleFile requires a single entrypoint. The dev-harness.html
    // (used only when running `npm run dev:mobile-renderer` against a browser
    // iframe for manual testing) is intentionally dropped from the mobile
    // build; it's still accessible during vite dev from its own source path.
    rollupOptions: {
      input: path.resolve(__dirname, 'src/mobile-renderer/index.html'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
