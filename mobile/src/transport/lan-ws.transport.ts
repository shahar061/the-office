import type { MobileMessageV2, SessionSnapshot } from '@shared/types';
import { decodeV2, encodeV2 } from '@shared/protocol/mobile';
import { deriveSessionKeys } from '@shared/crypto/noise';
import { SendStream, RecvStream } from '@shared/crypto/secretstream';
import type { Transport, TransportStatus, TransportEventMap } from './transport.interface';

interface Device {
  deviceId: string;
  deviceToken: string;
  identityPriv: string;         // base64
  desktopIdentityPub: string;   // base64
}

interface Options {
  host: string;
  port: number;
  device: Device;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const NO_RECONNECT_REASONS = new Set(['unknownDevice', 'revoked']);

function b64decode(s: string): Uint8Array {
  // Works under both React Native and Node (jest). atob fallback via Buffer.
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export class LanWsTransport implements Transport {
  private ws: WebSocket | null = null;
  private listeners: { [K in keyof TransportEventMap]: Set<TransportEventMap[K]> } = {
    status: new Set(),
    message: new Set(),
  };
  private backoffIdx = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerHeartbeat = 0;
  private shouldReconnect = true;
  private fatalReason: string | null = null;
  private send: SendStream | null = null;
  private recv: RecvStream | null = null;
  private authenticated = false;

  constructor(private readonly opts: Options) {}

  connect(): void {
    if (this.fatalReason) return;
    this.clearReconnect();
    this.authenticated = false;
    this.send = null;
    this.recv = null;
    this.emitStatus({ state: 'connecting' });

    // Derive fresh session keys on every reconnect.
    const priv = b64decode(this.opts.device.identityPriv);
    const desktopPub = b64decode(this.opts.device.desktopIdentityPub);
    const keys = deriveSessionKeys(priv, desktopPub, 'initiator');
    this.send = new SendStream(keys.sendKey);
    this.recv = new RecvStream(keys.recvKey);

    try {
      this.ws = new WebSocket(`ws://${this.opts.host}:${this.opts.port}/office`);
    } catch (err) {
      this.emitStatus({ state: 'error', error: err as Error });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Plain-text auth is the expected pre-auth frame on the server side.
      this.ws?.send(encodeV2({
        type: 'auth', v: 2,
        deviceId: this.opts.device.deviceId,
        deviceToken: this.opts.device.deviceToken,
      }));
    };

    this.ws.onmessage = (ev: { data: unknown }) => this.handleRaw(ev.data);

    this.ws.onclose = () => {
      this.clearHeartbeat();
      if (this.fatalReason) {
        this.emitStatus({ state: 'disconnected', reason: this.fatalReason });
        return;
      }
      this.emitStatus({ state: 'disconnected', reason: 'socket-close' });
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.emitStatus({ state: 'error', error: new Error('socket error') });
      try { this.ws?.close(); } catch { /* ignore */ }
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    this.clearHeartbeat();
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  on<K extends keyof TransportEventMap>(event: K, handler: TransportEventMap[K]): () => void {
    this.listeners[event].add(handler as any);
    return () => { this.listeners[event].delete(handler as any); };
  }

  private emitStatus(s: TransportStatus) {
    for (const h of this.listeners.status) (h as (s: TransportStatus) => void)(s);
  }

  private emitMessage(m: MobileMessageV2) {
    for (const h of this.listeners.message) (h as (m: MobileMessageV2) => void)(m);
  }

  private sendEncrypted(msg: MobileMessageV2) {
    if (!this.ws || this.ws.readyState !== 1 || !this.send) return;
    try {
      const plain = new TextEncoder().encode(encodeV2(msg));
      this.ws.send(this.send.encrypt(plain));
    } catch { /* ignore */ }
  }

  private async handleRaw(data: unknown): Promise<void> {
    let plainJson: string | null = null;
    try {
      if (typeof data === 'string') {
        // Plain text: pre-auth frames (authFailed) or test-env plain frames
        plainJson = data;
      } else {
        // Binary: encrypted frame. Decrypt with recv stream.
        if (!this.recv) return;
        let bytes: Uint8Array;
        if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (data instanceof Uint8Array) bytes = data;
        else if (typeof (data as Blob).arrayBuffer === 'function') {
          bytes = new Uint8Array(await (data as Blob).arrayBuffer());
        } else {
          return;
        }
        const plain = this.recv.decrypt(bytes);
        plainJson = new TextDecoder().decode(plain);
      }
    } catch {
      // Decrypt failure — drop the connection.
      try { this.ws?.close(); } catch { /* ignore */ }
      return;
    }

    const msg = decodeV2(plainJson);
    if (!msg) return;

    switch (msg.type) {
      case 'authed':
        this.onAuthed(msg.snapshot);
        break;
      case 'authFailed':
        this.onAuthFailed(msg.reason);
        break;
      case 'heartbeat':
        this.lastServerHeartbeat = Date.now();
        this.sendEncrypted({ type: 'heartbeat', v: 2 });
        break;
      case 'snapshot':
      case 'event':
      case 'chatFeed':
      case 'chatAck':
      case 'state':
        this.emitMessage(msg);
        break;
      default:
        // ignore other types
    }
  }

  private onAuthed(snapshot: SessionSnapshot) {
    this.backoffIdx = 0;
    this.authenticated = true;
    this.lastServerHeartbeat = Date.now();
    this.emitStatus({ state: 'connected', desktopName: snapshot.desktopName });
    this.emitMessage({ type: 'snapshot', v: 2, snapshot });
    this.startHeartbeatLoop();
  }

  private onAuthFailed(reason: string) {
    this.emitStatus({ state: 'disconnected', reason });
    if (NO_RECONNECT_REASONS.has(reason)) {
      this.shouldReconnect = false;
      this.fatalReason = reason;
    }
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  private startHeartbeatLoop() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastServerHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        try { this.ws?.close(); } catch { /* ignore */ }
        return;
      }
      this.sendEncrypted({ type: 'heartbeat', v: 2 });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scheduleReconnect() {
    const delay = BACKOFF_SCHEDULE_MS[Math.min(this.backoffIdx, BACKOFF_SCHEDULE_MS.length - 1)];
    this.backoffIdx += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
