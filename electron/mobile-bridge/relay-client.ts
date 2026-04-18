// electron/mobile-bridge/relay-client.ts
// Maintains an outbound WebSocket from desktop to the relay for one paired device.
// Reconnects with exponential backoff. Mints a fresh token per connect attempt.

import { EventEmitter } from 'events';
import WebSocket from 'ws';

type Headers = Record<string, string>;
type WsFactory = (url: string, headers: Headers) => Promise<WebSocket>;

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export interface RelayClientOpts {
  url: string;                    // e.g. wss://relay.office.workers.dev
  sid: string;
  mintToken: () => string;
  pairSignPub: Uint8Array;
  wsFactory?: WsFactory;          // optional injection for tests
}

const defaultFactory: WsFactory = (url, headers) => {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const onOpen = () => { ws.off('error', onError); resolve(ws); };
    const onError = (err: Error) => { ws.off('open', onOpen); reject(err); };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });
};

function b64url(u: Uint8Array): string {
  return Buffer.from(u).toString('base64url');
}

export class RelayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private backoffIdx = 0;
  private running = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private factory: WsFactory;

  constructor(private opts: RelayClientOpts) {
    super();
    this.factory = opts.wsFactory ?? defaultFactory;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } this.ws = null; }
  }

  send(frame: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(frame); } catch { /* ignore */ }
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    const token = this.opts.mintToken();
    const url = `${this.opts.url}/s/${this.opts.sid}`;
    const headers: Headers = {
      Authorization: `Bearer ${token}`,
      'X-PairSign-Pub': b64url(this.opts.pairSignPub),
    };

    try {
      const ws = await this.factory(url, headers);
      this.ws = ws;
      this.backoffIdx = 0;

      ws.on('message', (data: WebSocket.RawData) => {
        this.emit('message', typeof data === 'string' ? data : data.toString());
      });
      ws.on('close', () => {
        this.ws = null;
        this.emit('disconnect');
        this.scheduleReconnect();
      });
      ws.on('error', (err: Error) => {
        this.emit('error', err);
        try { ws.close(); } catch { /* ignore */ }
      });

      this.emit('connect');
    } catch (err) {
      this.emit('error', err as Error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    const delay = BACKOFF_MS[Math.min(this.backoffIdx, BACKOFF_MS.length - 1)];
    this.backoffIdx++;
    this.reconnectTimer = setTimeout(() => { void this.connect(); }, delay);
  }
}
