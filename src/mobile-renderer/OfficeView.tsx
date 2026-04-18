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

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;

    (async () => {
      const app = new Application();
      try {
        await app.init({
          canvas,
          width: canvas.clientWidth || 400,
          height: canvas.clientHeight || 600,
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

      // Adapt the existing Camera to the portrait viewport.
      scene.getCamera().setViewSize(canvas.clientWidth || 400, canvas.clientHeight || 600);

      appRef.current = app;
    })();

    return () => {
      cancelled = true;
      const app = appRef.current;
      if (app) {
        app.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="office-canvas" />;
}
