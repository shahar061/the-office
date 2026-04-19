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
        // Initialize Pixi at the CONTAINER's dimensions, not the whole
        // viewport. The canvas lives inside `.tab-pane`, which is flex:1
        // above a 56px `.tab-bar`. If we size Pixi to `window.innerHeight`
        // the canvas is 56px taller than its container, overflows below it,
        // and covers the tab-bar (hiding Office/Chat switcher).
        //
        // `canvas.clientWidth/Height` is unreliable here (0 before first
        // layout), so use the parent element's clientWidth/Height — the
        // tab-pane has correct dimensions by the time this effect runs.
        const parent = canvas.parentElement;
        const initW = parent?.clientWidth || window.innerWidth || 400;
        const initH = parent?.clientHeight || window.innerHeight || 600;
        await app.init({
          canvas,
          width: initW,
          height: initH,
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

      // Adapt the Camera to the container viewport (same dims Pixi init'd with).
      const camParent = canvas.parentElement;
      scene.getCamera().setViewSize(
        camParent?.clientWidth || window.innerWidth || 400,
        camParent?.clientHeight || window.innerHeight || 600,
      );

      appRef.current = app;
      sceneRef.current = scene;
    })();

    // Keep PixiJS renderer + camera viewport in sync with the canvas's
    // PARENT element's dimensions — NOT the full viewport and NOT
    // `canvas.clientWidth/Height`.
    //   * Viewport (`window.innerWidth/Height`): too large — the canvas's
    //     container (`.tab-pane`) is shorter by the 56px `.tab-bar` so
    //     sizing to viewport makes the canvas overflow and cover the
    //     tab-bar.
    //   * `canvas.clientWidth/Height`: pinned by Pixi's `autoDensity`-
    //     driven inline style, so reading it returns the last-Pixi-set
    //     dimensions, not the container's true size.
    //   * `parent.clientWidth/Height`: tab-pane's actual size, which
    //     respects the flex layout and tab-bar's 56px. This is the right
    //     source of truth.
    const applyResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
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
