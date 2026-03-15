import React, { useRef, useEffect } from 'react';
import { Application } from 'pixi.js';
// Required for Electron — PixiJS uses new Function() internally which
// is blocked by CSP in Electron. This module patches it.
import 'pixi.js/unsafe-eval';
import { OfficeScene } from './OfficeScene';

interface OfficeCanvasProps {
  onSceneReady?: (scene: OfficeScene) => void;
}

export function OfficeCanvas({ onSceneReady }: OfficeCanvasProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any leftover canvases from previous mounts (React StrictMode)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    destroyedRef.current = false;
    const app = new Application();
    appRef.current = app;

    const init = async () => {
      await app.init({
        background: '#1a1a2e',
        resizeTo: container,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });

      // Guard against cleanup running before init completes (React StrictMode)
      if (destroyedRef.current) {
        try { app.destroy(true, { children: true }); } catch { /* ignore */ }
        return;
      }

      // Ensure no duplicate canvases
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(app.canvas);

      const scene = new OfficeScene(app);
      await scene.init();

      if (destroyedRef.current) {
        try { app.destroy(true, { children: true }); } catch { /* ignore */ }
        return;
      }

      sceneRef.current = scene;
      onSceneReady?.(scene);
    };

    init().catch((err) => {
      if (!destroyedRef.current) {
        console.error('[OfficeCanvas] Init failed:', err);
      }
    });

    const onResize = () => {
      if (sceneRef.current && container) {
        sceneRef.current.onResize(container.clientWidth, container.clientHeight);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      destroyedRef.current = true;
      window.removeEventListener('resize', onResize);
      // Remove canvas from DOM
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      // Destroy PixiJS app if init completed
      if (appRef.current?.stage) {
        try { appRef.current.destroy(true, { children: true }); } catch { /* ignore */ }
      }
      appRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  );
}
