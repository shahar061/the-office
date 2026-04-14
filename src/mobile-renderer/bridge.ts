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
  window.addEventListener('message', (e: MessageEvent) => handleRawMessage(e.data));
}
