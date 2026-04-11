import type { MobileMessage } from '../../shared/types';
import { useMobileSessionStore } from './session.store';

export function handleRawMessage(raw: unknown): void {
  if (typeof raw !== 'string') return;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return; }
  if (!isMobileMessage(parsed)) return;
  const store = useMobileSessionStore.getState();
  switch (parsed.type) {
    case 'snapshot': store.setSnapshot(parsed.snapshot); break;
    case 'event':    store.appendEvent(parsed.event); break;
    case 'chat':     store.appendChat(parsed.messages); break;
    case 'state':    store.applyStatePatch(parsed.patch); break;
    // 'paired', 'authed', 'authFailed', 'heartbeat' never reach the WebView — shell strips them
    default: break;
  }
}

function isMobileMessage(x: unknown): x is MobileMessage {
  if (x === null || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  if (m.v !== 1) return false;
  if (typeof m.type !== 'string') return false;
  return true;
}

let installed = false;
export function installBridge(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('message', (e: MessageEvent) => handleRawMessage(e.data));
}
