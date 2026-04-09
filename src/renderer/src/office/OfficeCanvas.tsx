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
  // Mount ID prevents stale async inits from proceeding (React StrictMode fix).
  // Each mount increments on entry; cleanup increments to invalidate.
  const mountIdRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any leftover canvases from previous mounts
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const mountId = ++mountIdRef.current;
    const app = new Application();
    appRef.current = app;

    const init = async () => {
      await app.init({
        background: '#1a1a2e',
        antialias: false,
        roundPixels: true,
        resolution: 1,
        width: container.clientWidth,
        height: container.clientHeight,
      });

      // Bail if this mount was invalidated while awaiting
      if (mountIdRef.current !== mountId) {
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

      if (mountIdRef.current !== mountId) {
        try { app.destroy(true, { children: true }); } catch { /* ignore */ }
        return;
      }

      sceneRef.current = scene;
      onSceneReady?.(scene);
    };

    init().catch((err) => {
      if (mountIdRef.current === mountId) {
        console.error('[OfficeCanvas] Init failed:', err);
      }
    });

    // Single ResizeObserver handles both PixiJS canvas and camera resizing
    // so they stay perfectly in sync (no split-frame mismatches).
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        if (appRef.current?.renderer) {
          appRef.current.renderer.resize(width, height);
        }
        if (sceneRef.current) {
          sceneRef.current.onResize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      mountIdRef.current++; // Invalidate this mount's async init
      resizeObserver.disconnect();
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
      style={{ width: '100%', height: '100%', overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  );
}
