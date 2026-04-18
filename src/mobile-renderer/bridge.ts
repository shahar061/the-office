import { decode } from '../../shared/protocol/mobile';
import { useSessionStore } from '../../shared/stores/session.store';

export function handleRawMessage(raw: unknown): void {
  if (typeof raw !== 'string') return;
  const msg = decode(raw);
  if (!msg) return;
  const store = useSessionStore.getState();
  switch (msg.type) {
    case 'snapshot': store.setSnapshot(msg.snapshot); break;
    case 'event':    store.appendEvent(msg.event); break;
    case 'chat':     store.appendChat(msg.messages); break;
    case 'state':    store.applyStatePatch(msg.patch); break;
    default: break;
  }
}

let installed = false;
export function installBridge(): void {
  if (installed) return;
  installed = true;
  console.log('[webview] installing bridge');
  window.addEventListener('message', (e: MessageEvent) => {
    console.log('[webview] msg event', typeof e.data === 'string' ? e.data.slice(0, 120) : typeof e.data);
    handleRawMessage(e.data);
  });
  // Notify the React Native host that the bridge is ready so it can replay
  // the current snapshot. Without this, a snapshot that arrived before the
  // WebView finished loading is lost and the canvas never renders.
  const host = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView;
  console.log('[webview] ReactNativeWebView present?', !!host);
  if (host) {
    try {
      host.postMessage(JSON.stringify({ type: 'ready' }));
      console.log('[webview] posted ready');
    } catch (err) {
      console.log('[webview] post ready failed', (err as Error).message);
    }
  }
}
