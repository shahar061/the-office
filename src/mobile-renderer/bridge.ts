import { decode } from '../../shared/protocol/mobile';
import { useSessionStore } from '../../shared/stores/session.store';

export function handleRawMessage(raw: unknown): void {
  if (typeof raw !== 'string') {
    console.log('[webview-bridge] drop: non-string', typeof raw);
    return;
  }
  const msg = decode(raw);
  if (!msg) {
    console.log('[webview-bridge] drop: decode failed; raw head=', raw.slice(0, 60));
    return;
  }
  console.log('[webview-bridge] recv', msg.type);
  const store = useSessionStore.getState();
  switch (msg.type) {
    case 'snapshot':
      console.log('[webview-bridge] snapshot chatTail=', msg.snapshot.chatTail.length);
      store.setSnapshot(msg.snapshot);
      break;
    case 'charState': store.applyCharState(msg.ts, msg.characters); break;
    case 'event':     store.appendEvent(msg.event); break;
    case 'chat':
      console.log('[webview-bridge] chat got', msg.messages.length, 'msgs; snapshot?', !!store.snapshot);
      store.appendChat(msg.messages);
      break;
    case 'state':     store.applyStatePatch(msg.patch); break;
    case 'phaseHistory':
      store.setPhaseHistory(msg.phase, msg.history);
      break;
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
