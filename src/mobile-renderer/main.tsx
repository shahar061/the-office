import ReactDOM from 'react-dom/client';
import { MobileApp } from './MobileApp';
import { installBridge } from './bridge';

// NOTE: React.StrictMode is deliberately NOT used here.
// StrictMode mounts components twice in dev mode to surface side-effect bugs,
// but OfficeView owns a PixiJS Application which creates a WebGL context and
// compiles GPU shaders — those are inherently impure resources. Double-mounting
// causes the second Application to race with the first's cleanup, producing a
// broken shader/context pair and an infinite PixiJS error loop that pegs the tab.
// We trade StrictMode's debug benefit for a working renderer.

console.log('[webview] main.tsx entry');

window.addEventListener('error', (e) => {
  console.log('[webview] window error', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.log('[webview] unhandled rejection', String(e.reason));
});

installBridge();

try {
  const root = document.getElementById('root');
  console.log('[webview] root element?', !!root);
  if (root) ReactDOM.createRoot(root).render(<MobileApp />);
} catch (err) {
  console.log('[webview] render crashed', (err as Error).message);
}
