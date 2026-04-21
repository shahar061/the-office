// mobile/src/transport/relay-ws.transport.ts
// Remote-access transport — connects via the Cloudflare Worker relay.
// Frames on the wire are RelayEnvelope JSON; inner ct is crypto_secretstream-encrypted.

import type { MobileMessageV2, SessionSnapshot, RelayEnvelope } from '@shared/types';
import { RELAY_URL } from '@shared/types';
import { decodeV2, encodeV2 } from '@shared/protocol/mobile';
import { deriveSessionKeys } from '@shared/crypto/noise';
import { SendStream, RecvStream } from '@shared/crypto/secretstream';
import type { Transport, TransportStatus, TransportEventMap } from './transport.interface';

interface Device {
  deviceId: string;
  deviceToken: string;
  identityPriv: string;         // base64
  desktopIdentityPub: string;   // base64
  sid: string;                  // relay session id
}

interface Options {
  device: Device;
  token: string;                // Ed25519-signed relay token (minted by desktop)
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const NO_RECONNECT_REASONS = new Set(['unknownDevice', 'revoked']);

function b64decode(s: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

function b64encode(u: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return globalThis.btoa(s);
  }
  return Buffer.from(u).toString('base64');
}

export class RelayWsTransport implements Transport {
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
  private sendStream: SendStream | null = null;
  private recvStream: RecvStream | null = null;
  private seq = 0;
  private lastRecvSeq = -1;

  constructor(private readonly opts: Options) {}

  connect(): void {
    if (this.fatalReason) return;
    this.clearReconnect();
    this.resetCryptoStreams();
    this.emitStatus({ state: 'connecting' });

    try {
      // Phone uses the subprotocol to carry the auth token (RN WebSocket won't
      // send arbitrary Authorization headers).
      const protocol = `token.${this.opts.token}`;
      const wsUrl = `${RELAY_URL}/s/${this.opts.device.sid}`;
      console.log('[relay-ws] opening', wsUrl);
      this.ws = new WebSocket(wsUrl, protocol);
    } catch (err) {
      console.log('[relay-ws] open threw', (err as Error).message);
      this.emitStatus({ state: 'error', error: err as Error });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[relay-ws] open → sending auth');
      this.sendEnvelopedEncrypted({
        type: 'auth', v: 2,
        deviceId: this.opts.device.deviceId,
        deviceToken: this.opts.device.deviceToken,
      });
    };

    this.ws.onmessage = (ev: { data: unknown }) => this.handleRaw(ev.data);

    this.ws.onclose = (ev: { code?: number; reason?: string } = {}) => {
      this.clearHeartbeat();
      console.log('[relay-ws] close', ev.code, ev.reason ?? '');
      if (this.fatalReason) {
        this.emitStatus({ state: 'disconnected', reason: this.fatalReason });
        return;
      }
      this.emitStatus({ state: 'disconnected', reason: 'socket-close' });
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = (ev: unknown) => {
      console.log('[relay-ws] error', (ev as { message?: string })?.message ?? ev);
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

  send(msg: MobileMessageV2): void {
    this.sendEnvelopedEncrypted(msg);
  }

  on<K extends keyof TransportEventMap>(event: K, handler: TransportEventMap[K]): () => void {
    this.listeners[event].add(handler as any);
    return () => { this.listeners[event].delete(handler as any); };
  }

  private resetCryptoStreams(): void {
    const priv = b64decode(this.opts.device.identityPriv);
    const desktopPub = b64decode(this.opts.device.desktopIdentityPub);
    const keys = deriveSessionKeys(priv, desktopPub, 'initiator');
    this.sendStream = new SendStream(keys.sendKey);
    this.recvStream = new RecvStream(keys.recvKey);
    this.seq = 0;
    this.lastRecvSeq = -1;
  }

  private emitStatus(s: TransportStatus) {
    for (const h of this.listeners.status) (h as (s: TransportStatus) => void)(s);
  }

  private emitMessage(m: MobileMessageV2) {
    for (const h of this.listeners.message) (h as (m: MobileMessageV2) => void)(m);
  }

  private sendEnvelopedEncrypted(msg: MobileMessageV2, kind: 'data' | 'ctrl' = 'data'): void {
    if (!this.ws || this.ws.readyState !== 1 || !this.sendStream) return;
    try {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = this.sendStream.encrypt(plain);
      const env: RelayEnvelope = {
        v: 2,
        sid: this.opts.device.sid,
        seq: this.seq++,
        kind,
        ct: b64encode(ct),
      };
      this.ws.send(JSON.stringify(env));
    } catch { /* ignore */ }
  }

  private async handleRaw(data: unknown): Promise<void> {
    if (!this.recvStream) return;
    let text: string;
    try {
      if (typeof data === 'string') text = data;
      else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(data));
      else if (data instanceof Uint8Array) text = new TextDecoder().decode(data);
      else if (typeof (data as Blob).arrayBuffer === 'function') {
        text = new TextDecoder().decode(new Uint8Array(await (data as Blob).arrayBuffer()));
      } else return;
    } catch { return; }

    let env: any;
    try { env = JSON.parse(text); } catch { return; }
    if (env?.v !== 2 || env.sid !== this.opts.device.sid
        || typeof env.seq !== 'number' || typeof env.ct !== 'string') return;
    // Peer-reconnect signal: seq=0 after we've already received non-negative
    // seqs means the desktop's WS dropped and reconnected, so its send stream
    // is fresh. Reset our streams in lockstep before attempting to decrypt.
    if (env.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetCryptoStreams();
    }

    if (env.seq <= this.lastRecvSeq) return; // dedup
    this.lastRecvSeq = env.seq;

    let msg: MobileMessageV2 | null;
    try {
      const ct = b64decode(env.ct);
      const plain = this.recvStream.decrypt(ct);
      msg = decodeV2(new TextDecoder().decode(plain));
    } catch (err) {
      console.log('[relay-ws] decrypt failed', (err as Error).message);
      try { this.ws?.close(); } catch { /* ignore */ }
      return;
    }
    if (!msg) return;

    console.log('[relay-ws] recv', msg.type);
    switch (msg.type) {
      case 'authed': this.onAuthed(msg.snapshot); break;
      case 'authFailed': this.onAuthFailed(msg.reason); break;
      case 'heartbeat':
        this.lastServerHeartbeat = Date.now();
        this.sendEnvelopedEncrypted({ type: 'heartbeat', v: 2 });
        break;
      case 'snapshot':
      case 'event':
      case 'chatFeed':
      case 'chatAck':
      case 'state':
        this.emitMessage(msg);
        break;
    }
  }

  private onAuthed(snapshot: SessionSnapshot) {
    this.backoffIdx = 0;
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
      this.sendEnvelopedEncrypted({ type: 'heartbeat', v: 2 });
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
