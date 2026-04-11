import type { MobileMessage, SessionSnapshot } from '../types/shared';
import type { Transport, TransportStatus, TransportEventMap } from './transport.interface';

interface Device {
  deviceId: string;
  deviceToken: string;
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

  constructor(private readonly opts: Options) {}

  connect(): void {
    if (this.fatalReason) return;
    this.clearReconnect();
    this.emitStatus({ state: 'connecting' });
    try {
      this.ws = new WebSocket(`ws://${this.opts.host}:${this.opts.port}/office`);
    } catch (err) {
      this.emitStatus({ state: 'error', error: err as Error });
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.send({ type: 'auth', v: 1, deviceId: this.opts.device.deviceId, deviceToken: this.opts.device.deviceToken });
    };
    this.ws.onmessage = (ev: { data: string }) => this.handleRaw(ev.data);
    this.ws.onclose = () => {
      this.clearHeartbeat();
      if (this.fatalReason) {
        this.emitStatus({ state: 'disconnected', reason: this.fatalReason });
        return;
      }
      this.emitStatus({ state: 'disconnected', reason: 'socket-close' });
      if (this.shouldReconnect) this.scheduleReconnect();
    };
    this.ws.onerror = (_e: any) => {
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
    for (const h of this.listeners.status) h(s);
  }

  private emitMessage(m: MobileMessage) {
    for (const h of this.listeners.message) h(m);
  }

  private send(msg: MobileMessage) {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }

  private handleRaw(raw: string) {
    let msg: MobileMessage;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || (msg as any).v !== 1) return;

    switch (msg.type) {
      case 'authed':
        this.onAuthed(msg.snapshot);
        break;
      case 'authFailed':
        this.onAuthFailed(msg.reason);
        break;
      case 'heartbeat':
        this.lastServerHeartbeat = Date.now();
        this.send({ type: 'heartbeat', v: 1 });
        break;
      case 'snapshot':
      case 'event':
      case 'chat':
      case 'state':
        this.emitMessage(msg);
        break;
    }
  }

  private onAuthed(snapshot: SessionSnapshot) {
    this.backoffIdx = 0;
    this.lastServerHeartbeat = Date.now();
    this.emitStatus({ state: 'connected', desktopName: snapshot.desktopName });
    // Forward the initial snapshot as a 'snapshot' message so consumers have a single message path
    this.emitMessage({ type: 'snapshot', v: 1, snapshot });
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
      this.send({ type: 'heartbeat', v: 1 });
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
