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

installBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(<MobileApp />);
