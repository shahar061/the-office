import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { WsServer } from '../ws-server';
import { DeviceStore } from '../device-store';
import { SnapshotBuilder } from '../snapshot-builder';
import type { AppSettings, MobileMessage } from '../../../shared/types';

function makeFakeSettings(): AppSettings {
  return {
    defaultModelPreset: 'default',
    defaultPermissionMode: 'auto-safe',
    maxParallelTLs: 4,
    gitIdentities: [],
    defaultGitIdentityId: null,
    gitPreferences: { includeOfficeStateInRepo: false },
    mobile: { enabled: true, port: null, devices: [] },
  };
}

function makeFakeSettingsStore() {
  let state = makeFakeSettings();
  return {
    get: () => ({ ...state, mobile: state.mobile ? { ...state.mobile, devices: [...state.mobile.devices] } : undefined }),
    update: (patch: Partial<AppSettings>) => { state = { ...state, ...patch }; return state; },
  };
}

function waitForMessage(ws: WebSocket, predicate: (m: MobileMessage) => boolean, timeoutMs = 2000): Promise<MobileMessage> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const handler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as MobileMessage;
        if (predicate(msg)) {
          clearTimeout(t);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch { /* ignore */ }
    };
    ws.on('message', handler);
  });
}

describe('WsServer integration', () => {
  let server: WsServer;
  let deviceStore: DeviceStore;
  let snapshots: SnapshotBuilder;
  let port: number;

  beforeEach(async () => {
    const settings = makeFakeSettingsStore();
    deviceStore = new DeviceStore(settings as any);
    snapshots = new SnapshotBuilder('test-desktop');
    server = new WsServer({ port: 0, desktopName: 'test-desktop', deviceStore, snapshots });
    await server.start();
    port = server.getPort()!;
  });

  afterEach(async () => {
    await server.stop();
  });

  async function pairOnce(): Promise<{ deviceId: string; deviceToken: string }> {
    const { qrPayload } = server.generatePairingQR();
    const { pairingToken } = JSON.parse(qrPayload);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'pair', v: 1, pairingToken, deviceName: 'Test Phone' }));
    const m = await waitForMessage(ws, (x) => x.type === 'paired') as Extract<MobileMessage, { type: 'paired' }>;
    ws.close();
    return { deviceId: m.deviceId, deviceToken: m.deviceToken };
  }

  it('rejects a bogus pairing token', async () => {
    server.generatePairingQR();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'pair', v: 1, pairingToken: 'nope', deviceName: 'X' }));
    const m = await waitForMessage(ws, (x) => x.type === 'authFailed') as any;
    expect(m.reason).toBe('expired');
    ws.close();
  });

  it('completes a pairing handshake and stores the device', async () => {
    const pair = await pairOnce();
    expect(pair.deviceId).toBeTruthy();
    expect(pair.deviceToken).toBeTruthy();
    expect(deviceStore.list()).toHaveLength(1);
  });

  it('authenticates a paired device and returns a snapshot', async () => {
    const { deviceId, deviceToken } = await pairOnce();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'auth', v: 1, deviceId, deviceToken }));
    const m = await waitForMessage(ws, (x) => x.type === 'authed') as any;
    expect(m.snapshot).toBeDefined();
    expect(m.snapshot.desktopName).toBe('test-desktop');
    ws.close();
  });

  it('rejects an unknown device', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'auth', v: 1, deviceId: 'nope', deviceToken: 'nope' }));
    const m = await waitForMessage(ws, (x) => x.type === 'authFailed') as any;
    expect(m.reason).toBe('unknownDevice');
    ws.close();
  });

  it('broadcasts events to authenticated connections', async () => {
    const { deviceId, deviceToken } = await pairOnce();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'auth', v: 1, deviceId, deviceToken }));
    await waitForMessage(ws, (x) => x.type === 'authed');

    const eventPromise = waitForMessage(ws, (x) => x.type === 'event');
    server.broadcastToAuthenticated({
      type: 'event', v: 1,
      event: { agentId: 'a1', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: Date.now() },
    });
    const m = await eventPromise as any;
    expect(m.event.agentId).toBe('a1');
    ws.close();
  });

  it('revoking a device closes that connection', async () => {
    const { deviceId, deviceToken } = await pairOnce();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    ws.send(JSON.stringify({ type: 'auth', v: 1, deviceId, deviceToken }));
    await waitForMessage(ws, (x) => x.type === 'authed');
    const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
    server.revokeDevice(deviceId);
    const code = await closed;
    expect(code).toBe(4401);
  });
});
