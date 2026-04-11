import { randomUUID } from 'crypto';
import { networkInterfaces } from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import type { MobileMessage, PairedDevice } from '../../shared/types';
import { encode, decode } from './protocol';
import { DeviceStore } from './device-store';
import { SnapshotBuilder } from './snapshot-builder';
import {
  createPairingToken,
  isPairingTokenExpired,
  generateDeviceToken,
  hashDeviceToken,
  verifyDeviceToken,
  type PairingToken,
} from './pairing';

const IDLE_PRE_AUTH_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

type ConnectionState = 'awaiting-first' | 'authenticated' | 'closed';

interface Connection {
  id: string;
  ws: WebSocket;
  state: ConnectionState;
  deviceId: string | null;
  lastHeartbeat: number;
  idleTimer: NodeJS.Timeout | null;
  heartbeatTimer: NodeJS.Timeout | null;
}

export interface WsServerOptions {
  port?: number | null;      // null = dynamic
  desktopName: string;
  deviceStore: DeviceStore;
  snapshots: SnapshotBuilder;
}

export class WsServer {
  private server: WebSocketServer | null = null;
  private connections = new Map<string, Connection>();
  private activePairing: PairingToken | null = null;
  private port: number | null = null;

  constructor(private opts: WsServerOptions) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const initialPort = this.opts.port ?? 0;
      this.server = new WebSocketServer({ host: '0.0.0.0', port: initialPort, path: '/office' });
      this.server.on('listening', () => {
        const address = this.server!.address();
        this.port = typeof address === 'object' && address ? address.port : null;
        resolve();
      });
      this.server.on('error', (err) => reject(err));
      this.server.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  async stop(): Promise<void> {
    for (const c of this.connections.values()) {
      this.teardown(c, 1001);
    }
    this.connections.clear();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }

  getPort(): number | null { return this.port; }

  getConnectedCount(): number {
    let n = 0;
    for (const c of this.connections.values()) if (c.state === 'authenticated') n++;
    return n;
  }

  generatePairingQR(): { qrPayload: string; expiresAt: number } {
    this.activePairing = createPairingToken();
    const host = pickLanIP();
    const payload = {
      v: 1 as const,
      host,
      port: this.port ?? 0,
      pairingToken: this.activePairing.token,
      expiresAt: this.activePairing.expiresAt,
    };
    return { qrPayload: JSON.stringify(payload), expiresAt: this.activePairing.expiresAt };
  }

  revokeDevice(deviceId: string): void {
    this.opts.deviceStore.remove(deviceId);
    for (const c of this.connections.values()) {
      if (c.deviceId === deviceId) this.teardown(c, 4401);
    }
  }

  broadcastToAuthenticated(msg: MobileMessage): void {
    const wire = encode(msg);
    for (const c of this.connections.values()) {
      if (c.state === 'authenticated' && c.ws.readyState === WebSocket.OPEN) {
        try { c.ws.send(wire); } catch (err) { console.warn('[mobile-bridge] send failed', err); }
      }
    }
  }

  private handleConnection(ws: WebSocket): void {
    const conn: Connection = {
      id: randomUUID(),
      ws,
      state: 'awaiting-first',
      deviceId: null,
      lastHeartbeat: Date.now(),
      idleTimer: setTimeout(() => this.teardown(conn, 4408), IDLE_PRE_AUTH_MS),
      heartbeatTimer: null,
    };
    this.connections.set(conn.id, conn);

    ws.on('message', (data) => this.handleMessage(conn, data.toString()));
    ws.on('close', () => this.teardown(conn, 1000));
    ws.on('error', (err) => {
      console.warn('[mobile-bridge] socket error', err);
      this.teardown(conn, 4500);
    });
  }

  private async handleMessage(conn: Connection, raw: string): Promise<void> {
    const msg = decode(raw);
    if (!msg) {
      this.send(conn, { type: 'authFailed', v: 1, reason: 'malformed' });
      this.teardown(conn, 4400);
      return;
    }

    if (msg.type === 'heartbeat') {
      conn.lastHeartbeat = Date.now();
      return;
    }

    if (conn.state === 'awaiting-first') {
      if (msg.type === 'pair') {
        await this.handlePair(conn, msg);
      } else if (msg.type === 'auth') {
        await this.handleAuth(conn, msg);
      } else {
        this.teardown(conn, 4400);
      }
      return;
    }
    // Authenticated connections do not send anything else in v1
  }

  private async handlePair(
    conn: Connection,
    msg: Extract<MobileMessage, { type: 'pair' }>,
  ): Promise<void> {
    if (!this.activePairing ||
        this.activePairing.token !== msg.pairingToken ||
        isPairingTokenExpired(this.activePairing.expiresAt)) {
      this.send(conn, { type: 'authFailed', v: 1, reason: 'expired' });
      this.teardown(conn, 4400);
      return;
    }
    // Consume pairing token
    this.activePairing = null;

    const deviceId = randomUUID();
    const deviceToken = generateDeviceToken();
    const deviceTokenHash = await hashDeviceToken(deviceToken);
    const now = Date.now();

    const device: PairedDevice = {
      deviceId,
      deviceName: msg.deviceName || 'Unknown device',
      deviceTokenHash,
      pairedAt: now,
      lastSeenAt: now,
    };
    this.opts.deviceStore.add(device);

    this.send(conn, { type: 'paired', v: 1, deviceId, deviceToken, desktopName: this.opts.desktopName });
    // pairing connection is one-shot — close after success
    setTimeout(() => this.teardown(conn, 1000), 100);
  }

  private async handleAuth(
    conn: Connection,
    msg: Extract<MobileMessage, { type: 'auth' }>,
  ): Promise<void> {
    const device = this.opts.deviceStore.findById(msg.deviceId);
    if (!device) {
      this.send(conn, { type: 'authFailed', v: 1, reason: 'unknownDevice' });
      this.teardown(conn, 4401);
      return;
    }
    const ok = await verifyDeviceToken(msg.deviceToken, device.deviceTokenHash);
    if (!ok) {
      this.send(conn, { type: 'authFailed', v: 1, reason: 'revoked' });
      this.teardown(conn, 4401);
      return;
    }

    conn.state = 'authenticated';
    conn.deviceId = msg.deviceId;
    if (conn.idleTimer) { clearTimeout(conn.idleTimer); conn.idleTimer = null; }
    this.opts.deviceStore.touch(msg.deviceId, Date.now());

    this.send(conn, { type: 'authed', v: 1, snapshot: this.opts.snapshots.getSnapshot() });

    // Start heartbeat loop
    conn.heartbeatTimer = setInterval(() => {
      if (Date.now() - conn.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        this.teardown(conn, 4409);
        return;
      }
      this.send(conn, { type: 'heartbeat', v: 1 });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private send(conn: Connection, msg: MobileMessage): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    try { conn.ws.send(encode(msg)); } catch (err) { console.warn('[mobile-bridge] send failed', err); }
  }

  private teardown(conn: Connection, code: number): void {
    if (conn.state === 'closed') return;
    conn.state = 'closed';
    if (conn.idleTimer) clearTimeout(conn.idleTimer);
    if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer);
    try { conn.ws.close(code); } catch { /* ignore */ }
    this.connections.delete(conn.id);
  }
}

function pickLanIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}
