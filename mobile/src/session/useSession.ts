import { useEffect, useRef, useState } from 'react';
import { createTransportForDevice } from '../transport/create';
import type { Transport } from '../transport/transport.interface';
import { useConnectionStore } from '../state/connection.store';
import { useSessionStore } from '../types/shared';
import { loadLastKnown, saveLastKnown } from '../state/cache';
import type { MobileMessageV2 } from '../types/shared';
import { saveDevice, type PairedDeviceCredentials } from '../pairing/secure-store';

interface PendingAck {
  resolve: (result: { ok: boolean; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface UseSessionOpts {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export interface UseSessionReturn {
  status: ReturnType<typeof useConnectionStore.getState>['status'];
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  canSend: boolean;
  submit: () => Promise<{ ok: boolean; error?: string }>;
}

export function useSession({ device, onPairingLost }: UseSessionOpts): UseSessionReturn {
  const status = useConnectionStore((s) => s.status);
  const transportRef = useRef<Transport | null>(null);
  const pendingAcksRef = useRef<Map<string, PendingAck>>(new Map());
  // Use a ref for the callback so the effect doesn't need to re-run when the
  // caller passes a new function identity on every render (e.g. inline arrow).
  const onPairingLostRef = useRef(onPairingLost);
  onPairingLostRef.current = onPairingLost;
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Hydrate from cache asynchronously — best effort, doesn't block mount.
    loadLastKnown().then((last) => {
      if (last) useSessionStore.getState().hydrateFromCache(last.snapshot);
    });

    const transport = createTransportForDevice(deviceRef.current);
    transportRef.current = transport;

    const offStatus = transport.on('status', (s) => {
      useConnectionStore.getState().setStatus(s);
      if (
        s.state === 'disconnected' &&
        (s.reason === 'unknownDevice' || s.reason === 'revoked')
      ) {
        onPairingLostRef.current();
      }
    });

    const offMessage = transport.on('message', (m: MobileMessageV2) => {
      const store = useSessionStore.getState();
      switch (m.type) {
        case 'snapshot':
          store.setSnapshot(m.snapshot);
          void saveLastKnown(m.snapshot);
          break;
        case 'event':
          store.appendEvent(m.event);
          break;
        case 'chatFeed': {
          const pre = useSessionStore.getState().snapshot;
          console.log('[useSession] chatFeed got', m.messages.length, 'msgs; snapshot?', !!pre, 'tailBefore=', pre?.chatTail.length ?? 'n/a');
          store.appendChat(m.messages);
          const snap = useSessionStore.getState().snapshot;
          console.log('[useSession] chatFeed after appendChat tailAfter=', snap?.chatTail.length ?? 'n/a');
          if (snap) void saveLastKnown(snap);
          break;
        }
        case 'state':
          store.applyStatePatch(m.patch);
          {
            const snap = useSessionStore.getState().snapshot;
            if (snap) void saveLastKnown(snap);
          }
          break;
        case 'chatAck': {
          const pending = pendingAcksRef.current.get(m.clientMsgId);
          if (pending) {
            clearTimeout(pending.timer);
            const result: { ok: boolean; error?: string } = m.ok
              ? { ok: true }
              : { ok: false, error: m.error };
            pending.resolve(result);
            pendingAcksRef.current.delete(m.clientMsgId);
          }
          break;
        }
        case 'charState':
          store.applyCharState(m.ts, m.characters);
          break;
        case 'tokenRefresh': {
          void saveDevice({ ...deviceRef.current, relayToken: m.token });
          break;
        }
      }
    });

    transport.connect();

    return () => {
      offStatus();
      offMessage();
      transport.disconnect();
      transportRef.current = null;
      for (const { timer } of pendingAcksRef.current.values()) clearTimeout(timer);
      pendingAcksRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (): Promise<{ ok: boolean; error?: string }> => {
    const body = draft.trim();
    if (!body || sending) return Promise.resolve({ ok: false, error: 'empty' });
    const transport = transportRef.current;
    if (!transport) return Promise.resolve({ ok: false, error: 'no transport' });
    setSending(true);
    const clientMsgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(() => {
        pendingAcksRef.current.delete(clientMsgId);
        setSending(false);
        resolve({ ok: false, error: 'Timed out waiting for acknowledgment' });
      }, 5000);
      pendingAcksRef.current.set(clientMsgId, {
        resolve: (result) => {
          if (result.ok) setDraft('');
          setSending(false);
          resolve(result);
        },
        timer,
      });
      transport.send({ type: 'chat', v: 2, body, clientMsgId });
    });
  };

  const canSend = status.state === 'connected' && draft.trim().length > 0 && !sending;

  return { status, draft, setDraft, sending, canSend, submit };
}
