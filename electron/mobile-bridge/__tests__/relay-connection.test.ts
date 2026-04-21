import { describe, it, expect } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import type { PairedDevice } from '../../../shared/types';
import { RelayConnection } from '../relay-connection';

function makeDevice(overrides: Partial<PairedDevice> = {}): PairedDevice {
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  const pairSignPriv = ed25519.utils.randomPrivateKey();
  const pairSignPub = ed25519.getPublicKey(pairSignPriv);
  return {
    deviceId: 'd1',
    deviceName: 'iPhone',
    deviceTokenHash: 'h',
    pairedAt: 1,
    lastSeenAt: 1,
    phoneIdentityPub: Buffer.from(phonePub).toString('base64'),
    pairSignPriv: Buffer.from(pairSignPriv).toString('base64'),
    pairSignPub: Buffer.from(pairSignPub).toString('base64'),
    sid: 'SID',
    remoteAllowed: true,
    epoch: 1,
    ...overrides,
  };
}

function makeDesktop() {
  const priv = x25519.utils.randomPrivateKey();
  return { priv, pub: x25519.getPublicKey(priv) };
}

describe('RelayConnection', () => {
  it('constructs with valid v2 device', () => {
    const desktop = makeDesktop();
    const device = makeDevice();
    expect(() => new RelayConnection({ desktop, device })).not.toThrow();
  });

  it('throws when required v2 fields are missing', () => {
    const desktop = makeDesktop();
    const device = makeDevice({ phoneIdentityPub: '' });
    expect(() => new RelayConnection({ desktop, device })).toThrow(/v2-paired/);
  });

  it('isConnected() is false before start()', () => {
    const desktop = makeDesktop();
    const device = makeDevice();
    const conn = new RelayConnection({ desktop, device });
    expect(conn.isConnected()).toBe(false);
  });

  it('stop() is safe before start()', () => {
    const desktop = makeDesktop();
    const device = makeDevice();
    const conn = new RelayConnection({ desktop, device });
    expect(() => conn.stop()).not.toThrow();
  });

  it('sendMessage() is a no-op when not connected', () => {
    const desktop = makeDesktop();
    const device = makeDevice();
    const conn = new RelayConnection({ desktop, device });
    expect(() => conn.sendMessage({ type: 'heartbeat', v: 2 })).not.toThrow();
  });

  it('exposes deviceId', () => {
    const desktop = makeDesktop();
    const device = makeDevice();
    const conn = new RelayConnection({ desktop, device });
    expect(conn.getDeviceId()).toBe('d1');
  });

  it('decodes an initial seq=0 frame (fresh session, lastRecvSeq=-1)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { aeadEncrypt } = await import('../../../shared/crypto/aead');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: any[] = [];
    conn.on('message', (m: any) => received.push(m));

    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
    const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
    const { nonce, ct } = aeadEncrypt(keys.sendKey, plain);
    const env = JSON.stringify({
      v: 2, sid: device.sid!, seq: 0, kind: 'data',
      nonce: Buffer.from(nonce).toString('base64'),
      ct: Buffer.from(ct).toString('base64'),
    });

    onRaw(env);
    expect(received.map((m) => m.type)).toEqual(['heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(0);
  });

  it('survives asymmetric reconnect — desktop resets state but phone keeps its high seq (production bug regression)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { aeadEncrypt } = await import('../../../shared/crypto/aead');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: any[] = [];
    conn.on('message', (m: any) => received.push(m));

    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');

    for (let seq = 0; seq < 20; seq++) {
      const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
      const { nonce, ct } = aeadEncrypt(keys.sendKey, plain);
      const env = JSON.stringify({
        v: 2, sid: device.sid!, seq, kind: 'data',
        nonce: Buffer.from(nonce).toString('base64'),
        ct: Buffer.from(ct).toString('base64'),
      });
      onRaw(env);
    }

    expect(received).toHaveLength(20);
    expect((conn as any).lastRecvSeq).toBe(19);
  });
});
