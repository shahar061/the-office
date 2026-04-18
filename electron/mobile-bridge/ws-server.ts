import { randomUUID, randomBytes } from 'crypto';
import { networkInterfaces } from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import type { MobileMessageV2, PairedDevice, PairingQRPayloadV2 } from '../../shared/types';
import { encodeV2, decodeV2 } from '../../shared/protocol/mobile';
import { DeviceStore } from './device-store';
import { SnapshotBuilder } from './snapshot-builder';
import type { Identity } from './identity';
import { deriveSessionKeys } from '../../shared/crypto/noise';
import { deriveSas } from '../../shared/crypto/sas';
import { SendStream, RecvStream } from '../../shared/crypto/secretstream';
import {
  createPairingToken,
  isPairingTokenExpired,
  generateDeviceToken,
  hashDeviceToken,
  verifyDeviceToken,
  generatePairSignKeypair,
  type PairingToken,
} from './pairing';
import { mintToken } from './token-minter';

const IDLE_PRE_AUTH_MS = 30_000; // bumped slightly; v2 has more round trips
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

type ConnState =
  | { kind: 'awaiting-first' }
  | {
      kind: 'awaiting-sas';
      devicePub: Uint8Array;
      sessionKeys: { sendKey: Uint8Array; recvKey: Uint8Array };
      deviceName: string;
      pairingToken: string;
    }
  | {
      kind: 'awaiting-remote-consent';
      devicePub: Uint8Array;
      sessionKeys: { sendKey: Uint8Array; recvKey: Uint8Array };
      deviceName: string;
      deviceId: string;
      deviceToken: string;
      deviceTokenHash: string;
      pairSign: { priv: Uint8Array; pub: Uint8Array };
      sid: string;
    }
  | { kind: 'authenticated'; deviceId: string; send: SendStream; recv: RecvStream }
  | { kind: 'closed' };

interface Connection {
  id: string;
  ws: WebSocket;
  state: ConnState;
  lastHeartbeat: number;
  lastTokenRefresh: number | null;
  idleTimer: NodeJS.Timeout | null;
  heartbeatTimer: NodeJS.Timeout | null;
}

export interface WsServerOptions {
  port?: number | null;
  desktopName: string;
  deviceStore: DeviceStore;
  snapshots: SnapshotBuilder;
  identity: Identity;
  onChange?: () => void;
  /** Fired whenever the pending SAS becomes available so the Settings UI can display it. */
  onPendingSas?: (sas: string | null) => void;
  onPhoneChat?: (msg: { body: string; agentId?: string; fromDeviceId: string; clientMsgId: string }) => Promise<void>;
  /** Fan-out to relay connections alongside LAN connections. Invoked from broadcastToAuthenticated. */
  onBroadcastToRelay?: (msg: MobileMessageV2) => void;
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
        const addr = this.server!.address();
        this.port = typeof addr === 'object' && addr ? addr.port : null;
        resolve();
      });
      this.server.on('error', reject);
      this.server.on('connection', (ws) => this.handleConnection(ws));
    });
  }

  async stop(): Promise<void> {
    for (const c of this.connections.values()) this.teardown(c, 1001);
    this.connections.clear();
    await new Promise<void>((r) => this.server?.close(() => r()));
    this.server = null;
  }

  getPort(): number | null { return this.port; }

  getConnectedCount(): number {
    let n = 0;
    for (const c of this.connections.values()) if (c.state.kind === 'authenticated') n++;
    return n;
  }

  getAuthenticatedDeviceIds(): Set<string> {
    const ids = new Set<string>();
    for (const c of this.connections.values()) {
      if (c.state.kind === 'authenticated') ids.add(c.state.deviceId);
    }
    return ids;
  }

  generatePairingQR(): { qrPayload: string; expiresAt: number } {
    this.activePairing = createPairingToken();
    const host = pickLanIP();
    const payload: PairingQRPayloadV2 = {
      v: 2,
      host,
      port: this.port ?? 0,
      desktopIdentityPub: Buffer.from(this.opts.identity.pub).toString('base64'),
      pairingToken: this.activePairing.token,
      expiresAt: this.activePairing.expiresAt,
    };
    return { qrPayload: JSON.stringify(payload), expiresAt: this.activePairing.expiresAt };
  }

  revokeDevice(deviceId: string): void {
    this.opts.deviceStore.remove(deviceId);
    for (const c of this.connections.values()) {
      if (c.state.kind === 'authenticated' && c.state.deviceId === deviceId) {
        this.teardown(c, 4401);
      }
    }
    this.notifyChange();
  }

  /**
   * Send a v2 message to all authenticated connections. The message is encrypted
   * per-connection using that connection's SendStream.
   */
  broadcastToAuthenticated(msg: MobileMessageV2): void {
    for (const c of this.connections.values()) {
      if (c.state.kind === 'authenticated' && c.ws.readyState === WebSocket.OPEN) {
        this.sendEncrypted(c, msg);
      }
    }
    try {
      this.opts.onBroadcastToRelay?.(msg);
    } catch (err) {
      console.warn('[mobile-bridge] relay broadcast failed', err);
    }
  }

  private notifyChange(): void {
    try { this.opts.onChange?.(); } catch (err) {
      console.warn('[mobile-bridge] onChange listener failed', err);
    }
  }

  private emitPendingSas(sas: string | null): void {
    try { this.opts.onPendingSas?.(sas); } catch (err) {
      console.warn('[mobile-bridge] onPendingSas listener failed', err);
    }
  }

  private handleConnection(ws: WebSocket): void {
    const conn: Connection = {
      id: randomUUID(),
      ws,
      state: { kind: 'awaiting-first' },
      lastHeartbeat: Date.now(),
      lastTokenRefresh: null,
      idleTimer: setTimeout(() => this.teardown(conn, 4408), IDLE_PRE_AUTH_MS),
      heartbeatTimer: null,
    };
    this.connections.set(conn.id, conn);

    ws.on('message', (data) => this.handleMessage(conn, data).catch((err) => {
      console.warn('[mobile-bridge] message handler error', err);
      this.teardown(conn, 4500);
    }));
    ws.on('close', () => this.teardown(conn, 1000));
    ws.on('error', (err) => {
      console.warn('[mobile-bridge] socket error', err);
      this.teardown(conn, 4500);
    });
  }

  private async handleMessage(conn: Connection, data: WebSocket.RawData): Promise<void> {
    // Once authenticated, frames are binary ciphertext; pre-auth they are JSON text.
    let msg: MobileMessageV2 | null = null;
    if (conn.state.kind === 'authenticated') {
      try {
        const plain = conn.state.recv.decrypt(new Uint8Array(data as Buffer));
        msg = decodeV2(new TextDecoder().decode(plain));
      } catch {
        this.teardown(conn, 4400);
        return;
      }
    } else {
      msg = decodeV2(data.toString());
    }

    if (!msg) {
      if (conn.state.kind === 'awaiting-first') {
        this.sendPlain(conn, { type: 'authFailed', v: 2, reason: 'malformed' });
      }
      this.teardown(conn, 4400);
      return;
    }

    if (msg.type === 'heartbeat') {
      conn.lastHeartbeat = Date.now();
      return;
    }

    switch (conn.state.kind) {
      case 'awaiting-first':
        if (msg.type === 'pair') { await this.handlePair(conn, msg); return; }
        if (msg.type === 'auth') { await this.handleAuth(conn, msg); return; }
        break;
      case 'awaiting-sas':
        if (msg.type === 'pairConfirm') { this.handlePairConfirm(conn); return; }
        break;
      case 'awaiting-remote-consent':
        if (msg.type === 'pairRemoteConsent') { await this.handlePairRemoteConsent(conn, msg); return; }
        break;
      case 'authenticated':
        if (msg.type === 'chat') { await this.handleUpstreamChat(conn, msg); return; }
        // Other authenticated-state messages (heartbeat is handled above) fall through
        break;
    }
    this.teardown(conn, 4400);
  }

  private async handlePair(conn: Connection, msg: Extract<MobileMessageV2, { type: 'pair' }>): Promise<void> {
    if (!this.activePairing
        || this.activePairing.token !== msg.pairingToken
        || isPairingTokenExpired(this.activePairing.expiresAt)) {
      this.sendPlain(conn, { type: 'authFailed', v: 2, reason: 'expired' });
      this.teardown(conn, 4400);
      return;
    }

    let devicePub: Uint8Array;
    try {
      devicePub = new Uint8Array(Buffer.from(msg.devicePub, 'base64'));
      if (devicePub.length !== 32) throw new Error('bad length');
    } catch {
      this.sendPlain(conn, { type: 'authFailed', v: 2, reason: 'malformed' });
      this.teardown(conn, 4400);
      return;
    }

    const sessionKeys = deriveSessionKeys(this.opts.identity.priv, devicePub, 'responder');
    const sas = deriveSas(this.opts.identity.pub, devicePub, msg.pairingToken);

    conn.state = {
      kind: 'awaiting-sas',
      devicePub,
      sessionKeys,
      deviceName: msg.deviceName || 'Unknown device',
      pairingToken: msg.pairingToken,
    };
    this.emitPendingSas(sas);
  }

  private handlePairConfirm(conn: Connection): void {
    if (conn.state.kind !== 'awaiting-sas') return;
    const { devicePub, sessionKeys, deviceName } = conn.state;
    const deviceId = randomUUID();
    const deviceToken = generateDeviceToken();
    const pairSign = generatePairSignKeypair();
    const sid = randomBytes(16).toString('base64url');

    // hashDeviceToken is async — defer the state transition until the hash completes.
    // In practice the user takes >100ms to tap the next button so this is never a race.
    void hashDeviceToken(deviceToken).then((deviceTokenHash) => {
      if (conn.state.kind === 'closed') return;
      conn.state = {
        kind: 'awaiting-remote-consent',
        devicePub,
        sessionKeys,
        deviceName,
        deviceId,
        deviceToken,
        deviceTokenHash,
        pairSign,
        sid,
      };
    });
  }

  private async handlePairRemoteConsent(
    conn: Connection,
    msg: Extract<MobileMessageV2, { type: 'pairRemoteConsent' }>,
  ): Promise<void> {
    if (conn.state.kind !== 'awaiting-remote-consent') return;
    const { devicePub, sessionKeys, deviceName, deviceId, deviceToken, deviceTokenHash, pairSign, sid } = conn.state;

    const device: PairedDevice = {
      deviceId,
      deviceName,
      deviceTokenHash,
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
      phoneIdentityPub: Buffer.from(devicePub).toString('base64'),
      pairSignPriv: Buffer.from(pairSign.priv).toString('base64'),
      pairSignPub: Buffer.from(pairSign.pub).toString('base64'),
      sid,
      remoteAllowed: !!msg.remoteAllowed,
      epoch: 1,
    };
    this.opts.deviceStore.add(device);
    this.activePairing = null;
    this.emitPendingSas(null);
    this.notifyChange();

    conn.state = {
      kind: 'authenticated',
      deviceId,
      send: new SendStream(sessionKeys.sendKey),
      recv: new RecvStream(sessionKeys.recvKey),
    };
    if (conn.idleTimer) { clearTimeout(conn.idleTimer); conn.idleTimer = null; }

    this.sendEncrypted(conn, {
      type: 'paired', v: 2,
      deviceId, deviceToken,
      desktopName: this.opts.desktopName,
      sid,
    });
    this.sendFreshTokenIfRemote(conn);
    conn.lastTokenRefresh = Date.now();

    this.startHeartbeat(conn);
  }

  private async handleAuth(conn: Connection, msg: Extract<MobileMessageV2, { type: 'auth' }>): Promise<void> {
    const device = this.opts.deviceStore.findById(msg.deviceId);
    if (!device) {
      this.sendPlain(conn, { type: 'authFailed', v: 2, reason: 'unknownDevice' });
      this.teardown(conn, 4401);
      return;
    }
    const ok = await verifyDeviceToken(msg.deviceToken, device.deviceTokenHash);
    if (!ok) {
      this.sendPlain(conn, { type: 'authFailed', v: 2, reason: 'revoked' });
      this.teardown(conn, 4401);
      return;
    }
    if (!device.phoneIdentityPub) {
      // v1 device — force re-pair
      this.sendPlain(conn, { type: 'authFailed', v: 2, reason: 'unknownDevice' });
      this.teardown(conn, 4401);
      return;
    }

    const devicePub = new Uint8Array(Buffer.from(device.phoneIdentityPub, 'base64'));
    const sessionKeys = deriveSessionKeys(this.opts.identity.priv, devicePub, 'responder');

    conn.state = {
      kind: 'authenticated',
      deviceId: msg.deviceId,
      send: new SendStream(sessionKeys.sendKey),
      recv: new RecvStream(sessionKeys.recvKey),
    };
    if (conn.idleTimer) { clearTimeout(conn.idleTimer); conn.idleTimer = null; }
    this.opts.deviceStore.touch(msg.deviceId, Date.now());
    this.notifyChange();

    this.sendEncrypted(conn, { type: 'authed', v: 2, snapshot: this.opts.snapshots.getSnapshot() });
    this.sendFreshTokenIfRemote(conn);
    conn.lastTokenRefresh = Date.now();
    this.startHeartbeat(conn);
  }

  private async handleUpstreamChat(
    conn: Connection,
    msg: Extract<MobileMessageV2, { type: 'chat' }>,
  ): Promise<void> {
    if (conn.state.kind !== 'authenticated') return;
    try {
      await this.opts.onPhoneChat?.({
        body: msg.body,
        agentId: msg.agentId,
        fromDeviceId: conn.state.deviceId,
        clientMsgId: msg.clientMsgId,
      });
      this.sendEncrypted(conn, { type: 'chatAck', v: 2, clientMsgId: msg.clientMsgId, ok: true });
    } catch (err) {
      this.sendEncrypted(conn, {
        type: 'chatAck', v: 2, clientMsgId: msg.clientMsgId, ok: false,
        error: (err as Error).message,
      });
    }
  }

  private startHeartbeat(conn: Connection): void {
    conn.heartbeatTimer = setInterval(() => {
      if (Date.now() - conn.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        this.teardown(conn, 4409);
        return;
      }
      if (!conn.lastTokenRefresh || Date.now() - conn.lastTokenRefresh > 10 * 60_000) {
        this.sendFreshTokenIfRemote(conn);
        conn.lastTokenRefresh = Date.now();
      }
      this.sendEncrypted(conn, { type: 'heartbeat', v: 2 });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private sendFreshTokenIfRemote(conn: Connection): void {
    if (conn.state.kind !== 'authenticated') return;
    const device = this.opts.deviceStore.findById(conn.state.deviceId);
    if (!device?.remoteAllowed) return;
    if (!device.pairSignPriv || !device.sid) return;
    const token = mintToken(
      Buffer.from(device.pairSignPriv, 'base64'),
      { sid: device.sid, role: 'phone', epoch: device.epoch ?? 1, ttlMs: 24 * 60 * 60_000 },
    );
    this.sendEncrypted(conn, {
      type: 'tokenRefresh', v: 2,
      token,
      expiresAt: Date.now() + 24 * 60 * 60_000,
    });
  }

  private sendPlain(conn: Connection, msg: MobileMessageV2): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    try { conn.ws.send(encodeV2(msg)); } catch (err) {
      console.warn('[mobile-bridge] send failed', err);
    }
  }

  private sendEncrypted(conn: Connection, msg: MobileMessageV2): void {
    if (conn.state.kind !== 'authenticated') return;
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    try {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = conn.state.send.encrypt(plain);
      conn.ws.send(ct);
    } catch (err) {
      console.warn('[mobile-bridge] encrypt/send failed', err);
    }
  }

  private teardown(conn: Connection, code: number): void {
    if (conn.state.kind === 'closed') return;
    const wasAuthenticated = conn.state.kind === 'authenticated';
    conn.state = { kind: 'closed' };
    if (conn.idleTimer) clearTimeout(conn.idleTimer);
    if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer);
    try { conn.ws.close(code); } catch { /* ignore */ }
    this.connections.delete(conn.id);
    if (wasAuthenticated) this.notifyChange();
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
