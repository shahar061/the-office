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

  // ── seq=0 peer-reconnect reset ──

  it('resets streams on envelope seq=0 after active session (peer reconnected)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { SendStream, RecvStream } = await import('../../../shared/crypto/secretstream');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({
      phoneIdentityPub: Buffer.from(phonePub).toString('base64'),
    });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: string[] = [];
    conn.on('message', (m: any) => received.push(m.type));

    // Phone-side SendStream keyed to match desktop's recv (desktop uses
    // role='responder', so phone uses 'initiator' for the counterpart).
    function makePhoneSend() {
      const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
      return new SendStream(keys.sendKey);
    }
    let phoneSend = makePhoneSend();

    function encFrame(seq: number, msg: any): string {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = phoneSend.encrypt(plain);
      return JSON.stringify({
        v: 2, sid: device.sid!, seq, kind: 'data',
        ct: Buffer.from(ct).toString('base64'),
      });
    }

    // Frames 0 and 1 from the original session
    onRaw(encFrame(0, { type: 'heartbeat', v: 2 }));
    onRaw(encFrame(1, { type: 'heartbeat', v: 2 }));
    expect(received).toEqual(['heartbeat', 'heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(1);

    // Simulate peer reconnect — fresh SendStream on the phone side,
    // send seq=0 again. Desktop should reset and decode the new frame.
    phoneSend = makePhoneSend();
    onRaw(encFrame(0, { type: 'heartbeat', v: 2 }));

    expect(received).toEqual(['heartbeat', 'heartbeat', 'heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(0);
  });

  it('preserves outgoing seq across peer-reconnect reset (seqRegression regression guard)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { SendStream } = await import('../../../shared/crypto/secretstream');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;

    // Drive desktop's outgoing seq forward by calling sendMessage a few
    // times. We ignore the "not connected" guard by swapping isConnected.
    (conn as any).client.isConnected = () => true;
    (conn as any).client.send = () => {};
    conn.sendMessage({ type: 'heartbeat', v: 2 });
    conn.sendMessage({ type: 'heartbeat', v: 2 });
    conn.sendMessage({ type: 'heartbeat', v: 2 });
    expect((conn as any).seq).toBe(3);

    // Drive lastRecvSeq forward so the seq=0 branch fires.
    function makePhoneSend() {
      const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
      return new SendStream(keys.sendKey);
    }
    let phoneSend = makePhoneSend();
    function encFrame(seq: number, msg: any): string {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const ct = phoneSend.encrypt(plain);
      return JSON.stringify({
        v: 2, sid: device.sid!, seq, kind: 'data',
        ct: Buffer.from(ct).toString('base64'),
      });
    }
    onRaw(encFrame(0, { type: 'heartbeat', v: 2 }));
    onRaw(encFrame(1, { type: 'heartbeat', v: 2 }));
    expect((conn as any).lastRecvSeq).toBe(1);

    // Simulate peer reconnect — fresh SendStream, seq=0.
    phoneSend = makePhoneSend();
    onRaw(encFrame(0, { type: 'heartbeat', v: 2 }));

    // Crypto streams reset (peer reconnected), but outgoing seq MUST NOT reset.
    expect((conn as any).seq).toBe(3);
    expect((conn as any).lastRecvSeq).toBe(0);
  });

  it('does not reset on initial seq=0 (fresh session, lastRecvSeq=-1)', async () => {
    const { deriveSessionKeys } = await import('../../../shared/crypto/noise');
    const { SendStream } = await import('../../../shared/crypto/secretstream');
    const { encodeV2 } = await import('../../../shared/protocol/mobile');
    const { x25519 } = await import('@noble/curves/ed25519');

    const desktop = makeDesktop();
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const device = makeDevice({ phoneIdentityPub: Buffer.from(phonePub).toString('base64') });
    const conn = new RelayConnection({ desktop, device });
    const onRaw = (conn as any).onRawFrame.bind(conn) as (raw: string) => void;
    const received: string[] = [];
    conn.on('message', (m: any) => received.push(m.type));

    const keys = deriveSessionKeys(phonePriv, desktop.pub, 'initiator');
    const sendStream = new SendStream(keys.sendKey);

    const plain = new TextEncoder().encode(encodeV2({ type: 'heartbeat', v: 2 }));
    const ct = sendStream.encrypt(plain);
    const env = JSON.stringify({
      v: 2, sid: device.sid!, seq: 0, kind: 'data',
      ct: Buffer.from(ct).toString('base64'),
    });

    // Initial frame at seq=0, lastRecvSeq is still -1 → no reset should fire
    // and the frame should decrypt under the constructor-initialized stream.
    onRaw(env);
    expect(received).toEqual(['heartbeat']);
    expect((conn as any).lastRecvSeq).toBe(0);
  });
});
