import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { x25519 } from '@noble/curves/ed25519';
import { WsServer } from '../ws-server';
import { DeviceStore } from '../device-store';
import { SnapshotBuilder } from '../snapshot-builder';
import type { AppSettings } from '../../../shared/types';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { RecvStream, SendStream } from '../../../shared/crypto/secretstream';
import { decodeV2 } from '../../../shared/protocol/mobile';
import { getOrCreateIdentity } from '../identity';

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

describe('WsServer v2 integration', () => {
  let settings: ReturnType<typeof makeFakeSettingsStore>;
  let server: WsServer;
  let deviceStore: DeviceStore;
  let port: number;

  beforeEach(async () => {
    settings = makeFakeSettingsStore();
    deviceStore = new DeviceStore(settings as any);
    const snapshots = new SnapshotBuilder('test-desktop');
    const identity = getOrCreateIdentity(settings as any);
    server = new WsServer({ port: 0, desktopName: 'test-desktop', deviceStore, snapshots, identity, settings });
    await server.start();
    port = server.getPort()!;
  });

  afterEach(async () => { await server.stop(); });

  it('completes a full v2 pair → confirm → consent → encrypted `paired`', async () => {
    const { qrPayload } = server.generatePairingQR();
    const qr = JSON.parse(qrPayload);
    expect(qr.v).toBe(3);
    expect(qr.mode).toBe('relay');
    expect(typeof qr.roomId).toBe('string');
    expect(qr.host).toBeUndefined();
    expect(qr.port).toBeUndefined();
    const desktopPub = new Uint8Array(Buffer.from(qr.desktopIdentityPub, 'base64'));

    // Phone keypair
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const sessionKeys = deriveSessionKeys(phonePriv, desktopPub, 'initiator');
    const recv = new RecvStream(sessionKeys.recvKey);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));

    // Collect *binary* messages
    const encryptedFramesQueue: Buffer[] = [];
    ws.on('message', (data) => { if (data instanceof Buffer) encryptedFramesQueue.push(data); });

    ws.send(JSON.stringify({
      type: 'pair', v: 2,
      pairingToken: qr.pairingToken,
      devicePub: Buffer.from(phonePub).toString('base64'),
      deviceName: 'Test iPhone',
    }));

    // Server transitions to awaiting-sas silently. Simulate user confirming SAS.
    await new Promise((r) => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'pairConfirm', v: 2 }));

    // Server does async hashDeviceToken — wait a bit, then send consent.
    await new Promise((r) => setTimeout(r, 200));
    ws.send(JSON.stringify({ type: 'pairRemoteConsent', v: 2, remoteAllowed: true }));

    // Expect an encrypted `paired` frame.
    await new Promise<void>((r) => setTimeout(r, 200));
    expect(encryptedFramesQueue.length).toBeGreaterThan(0);
    const frame = encryptedFramesQueue[0];
    const plain = new TextDecoder().decode(recv.decrypt(new Uint8Array(frame)));
    const parsed = decodeV2(plain);
    expect(parsed?.type).toBe('paired');
    const paired = parsed as any;
    expect(paired.sid).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(paired.desktopName).toBe('test-desktop');

    // Device persisted with v2 fields
    const devices = deviceStore.list();
    expect(devices).toHaveLength(1);
    expect(devices[0].remoteAllowed).toBe(true);
    expect(devices[0].phoneIdentityPub).toBe(Buffer.from(phonePub).toString('base64'));
    expect(devices[0].pairSignPriv).toMatch(/./);
    expect(devices[0].sid).toBe(paired.sid);

    ws.close();
  });

  it('rejects a bogus pairing token', async () => {
    server.generatePairingQR();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    const textFrames: string[] = [];
    ws.on('message', (data) => { if (typeof data === 'string' || data instanceof Buffer) textFrames.push(data.toString()); });

    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    ws.send(JSON.stringify({
      type: 'pair', v: 2,
      pairingToken: 'nope',
      devicePub: Buffer.from(phonePub).toString('base64'),
      deviceName: 'X',
    }));
    await new Promise((r) => setTimeout(r, 100));
    const parsed = decodeV2(textFrames[0]!) as any;
    expect(parsed?.type).toBe('authFailed');
    expect(parsed.reason).toBe('expired');
    ws.close();
  });

  it('auth reconnect flow: paired device can authenticate with deviceId+deviceToken, receives encrypted `authed` with snapshot', async () => {
    // Pair first, capture deviceId + deviceToken + session keys
    const { qrPayload } = server.generatePairingQR();
    const qr = JSON.parse(qrPayload);
    const desktopPub = new Uint8Array(Buffer.from(qr.desktopIdentityPub, 'base64'));
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const sessionKeys = deriveSessionKeys(phonePriv, desktopPub, 'initiator');
    const recv = new RecvStream(sessionKeys.recvKey);

    let ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    const frames: Buffer[] = [];
    ws.on('message', (d) => { if (d instanceof Buffer) frames.push(d); });
    ws.send(JSON.stringify({
      type: 'pair', v: 2, pairingToken: qr.pairingToken,
      devicePub: Buffer.from(phonePub).toString('base64'), deviceName: 'Phone',
    }));
    await new Promise((r) => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'pairConfirm', v: 2 }));
    await new Promise((r) => setTimeout(r, 200));
    ws.send(JSON.stringify({ type: 'pairRemoteConsent', v: 2, remoteAllowed: false }));
    await new Promise((r) => setTimeout(r, 200));
    const paired = decodeV2(new TextDecoder().decode(recv.decrypt(new Uint8Array(frames[0])))) as any;
    ws.close();

    // Now open a fresh connection and send `auth`
    ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    const authFrames: Buffer[] = [];
    ws.on('message', (d) => { if (d instanceof Buffer) authFrames.push(d); });
    ws.send(JSON.stringify({ type: 'auth', v: 2, deviceId: paired.deviceId, deviceToken: paired.deviceToken }));

    await new Promise((r) => setTimeout(r, 250));
    // Fresh session keys derived from same identity pubs → same material
    const recv2 = new RecvStream(sessionKeys.recvKey);
    expect(authFrames.length).toBeGreaterThan(0);
    const parsed = decodeV2(new TextDecoder().decode(recv2.decrypt(new Uint8Array(authFrames[0])))) as any;
    expect(parsed?.type).toBe('authed');
    expect(parsed.snapshot).toBeDefined();
    ws.close();
  });

  it('rejects auth for unknown deviceId', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    const frames: string[] = [];
    ws.on('message', (d) => frames.push(d.toString()));
    ws.send(JSON.stringify({ type: 'auth', v: 2, deviceId: 'nope', deviceToken: 'nope' }));
    await new Promise((r) => setTimeout(r, 100));
    const parsed = decodeV2(frames[0]!) as any;
    expect(parsed?.reason).toBe('unknownDevice');
    ws.close();
  });

  it('accepts upstream chat and echoes an encrypted chatAck', async () => {
    const { qrPayload } = server.generatePairingQR();
    const qr = JSON.parse(qrPayload);
    const desktopPub = new Uint8Array(Buffer.from(qr.desktopIdentityPub, 'base64'));
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const keys = deriveSessionKeys(phonePriv, desktopPub, 'initiator');
    const recv = new RecvStream(keys.recvKey);
    const send = new SendStream(keys.sendKey);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/office`);
    await new Promise<void>((r) => ws.once('open', () => r()));
    const frames: Buffer[] = [];
    ws.on('message', (d) => { if (d instanceof Buffer) frames.push(d); });

    ws.send(JSON.stringify({ type: 'pair', v: 2, pairingToken: qr.pairingToken, devicePub: Buffer.from(phonePub).toString('base64'), deviceName: 'P' }));
    await new Promise((r) => setTimeout(r, 50));
    ws.send(JSON.stringify({ type: 'pairConfirm', v: 2 }));
    await new Promise((r) => setTimeout(r, 200));
    ws.send(JSON.stringify({ type: 'pairRemoteConsent', v: 2, remoteAllowed: false }));
    await new Promise((r) => setTimeout(r, 250));
    const pairedPlain = decodeV2(new TextDecoder().decode(recv.decrypt(new Uint8Array(frames[0]))));
    expect(pairedPlain?.type).toBe('paired');

    const chatPlain = new TextEncoder().encode(JSON.stringify({ type: 'chat', v: 2, body: 'hi agent', clientMsgId: 'm1' }));
    ws.send(send.encrypt(chatPlain));

    await new Promise((r) => setTimeout(r, 100));
    expect(frames.length).toBeGreaterThan(1);
    const ackPlain = decodeV2(new TextDecoder().decode(recv.decrypt(new Uint8Array(frames[1])))) as any;
    expect(ackPlain?.type).toBe('chatAck');
    expect(ackPlain.ok).toBe(true);
    expect(ackPlain.clientMsgId).toBe('m1');
    ws.close();
  });
});
