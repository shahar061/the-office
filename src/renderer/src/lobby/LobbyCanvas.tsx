import 'pixi.js/unsafe-eval';
import React, { useRef, useEffect } from 'react';
import { Application } from 'pixi.js';
import { LobbyScene } from './LobbyScene';

export function LobbyCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let scene: LobbyScene | null = null;

    const init = async () => {
      await app.init({
        background: '#1a1a2e',
        resizeTo: container,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });
      container.appendChild(app.canvas);

      scene = new LobbyScene(app);
      await scene.init();
    };

    init();

    const onResize = () => scene?.onResize(container.clientWidth, container.clientHeight);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  );
}
