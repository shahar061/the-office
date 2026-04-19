import { useEffect, useRef } from 'react';
import type React from 'react';
import { Application } from 'pixi.js';
import { MobileScene } from './MobileScene';

interface Props {
  active: boolean;
}

export function OfficeView({ active: _active }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<MobileScene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;

    (async () => {
      const app = new Application();
      try {
        // Initialize at the current viewport dimensions, not the canvas's
        // own clientWidth/Height — those can be 0 before the first layout
        // and will later be pinned by Pixi's `autoDensity`-driven inline
        // style, which shadows CSS `width: 100%`.
        await app.init({
          canvas,
          width: window.innerWidth || 400,
          height: window.innerHeight || 600,
          background: '#0a0a0a',
          antialias: false,
          preference: 'webgl',
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
      } catch (err) {
        console.error('[OfficeView] PixiJS init failed', err);
        return;
      }

      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }

      const scene = new MobileScene(app);
      try {
        await scene.init();
      } catch (err) {
        console.error('[OfficeView] OfficeScene init failed', err);
        app.destroy(true, { children: true });
        return;
      }

      if (cancelled) {
        app.destroy(true, { children: true });
        return;
      }

      // Adapt the Camera to the current viewport.
      scene.getCamera().setViewSize(window.innerWidth || 400, window.innerHeight || 600);

      appRef.current = app;
      sceneRef.current = scene;
    })();

    // Keep PixiJS renderer + camera viewport in sync with the actual
    // viewport dimensions. IMPORTANT: sample `window.innerWidth`/`innerHeight`
    // rather than `canvas.clientWidth/Height` — Pixi's `autoDensity` sets
    // explicit inline `style.width`/`style.height` on the canvas element,
    // which "pins" its clientWidth/Height to the last Pixi-set value and
    // shadows the CSS rule `.office-canvas { width: 100%; height: 100% }`.
    // On rotation this traps the canvas at its portrait size in a landscape
    // viewport until we explicitly resize.
    const applyResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === 0 || h === 0) return;
      if (appRef.current?.renderer) {
        appRef.current.renderer.resize(w, h);
      }
      if (sceneRef.current) {
        sceneRef.current.onResize(w, h);
      }
    };

    // Observe the CANVAS'S PARENT (the `.tab-pane` container) rather than the
    // canvas itself. The parent's size tracks the viewport correctly; the
    // canvas's tracked size is whatever Pixi last set it to.
    const resizeObserver = new ResizeObserver(() => applyResize());
    const parent = canvas.parentElement;
    if (parent) resizeObserver.observe(parent);

    // Window-level fallbacks — `resize` and `orientationchange` both fire on
    // Android WebView rotation and give us the authoritative post-rotation
    // dimensions. The rAF×2 delay on orientationchange lets the native
    // rotation animation settle before we sample innerWidth/innerHeight.
    const handleResize = () => applyResize();
    const handleOrientation = () => {
      requestAnimationFrame(() => requestAnimationFrame(applyResize));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientation);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientation);
      const app = appRef.current;
      if (app) {
        app.destroy(true, { children: true });
        appRef.current = null;
      }
      sceneRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="office-canvas" />;
}
