import { describe, it, expect } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import { RelayConnection } from '../relay-connection';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { aeadEncrypt } from '../../../shared/crypto/aead';
import { encodeV2 } from '../../../shared/protocol/mobile';
import type { MobileMessageV2, PairedDevice } from '../../../shared/types';

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64');
}

function makeKeys() {
  const desktopPriv = x25519.utils.randomPrivateKey();
  const desktopPub = x25519.getPublicKey(desktopPriv);
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  const pairSignPriv = ed25519.utils.randomPrivateKey();
  const pairSignPub = ed25519.getPublicKey(pairSignPriv);
  return { desktopPriv, desktopPub, phonePriv, phonePub, pairSignPriv, pairSignPub };
}

function makeDevice(keys: ReturnType<typeof makeKeys>): PairedDevice {
  return {
    deviceId: 'd1',
    deviceName: 'iPhone',
    deviceTokenHash: 'h',
    pairedAt: 1,
    lastSeenAt: 1,
    phoneIdentityPub: b64(keys.phonePub),
    pairSignPriv: b64(keys.pairSignPriv),
    pairSignPub: b64(keys.pairSignPub),
    sid: 'SID',
    remoteAllowed: true,
    epoch: 1,
  };
}

function encEnvelope(
  sendKey: Uint8Array,
  sid: string,
  seq: number,
  msg: MobileMessageV2,
): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const { nonce, ct } = aeadEncrypt(sendKey, plain);
  return JSON.stringify({
    v: 2, sid, seq, kind: 'data',
    nonce: b64(nonce), ct: b64(ct),
  });
}

describe('RelayConnection — production bug regression (stateless AEAD)', () => {
  it('handles asymmetric reconnect — desktop resets but phone keeps sending without decrypt failures', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });

    const received: MobileMessageV2[] = [];
    conn.on('message', (m: MobileMessageV2) => received.push(m));

    const sessionKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
    const client: any = (conn as any).client;

    // Simulate initial connect — desktop's WS came up for the first time.
    client.emit('connect');

    // Steady-state phone→desktop traffic at seq 0..4.
    for (let seq = 0; seq <= 4; seq++) {
      client.emit('message', encEnvelope(
        sessionKeys.sendKey, device.sid!, seq, { type: 'heartbeat', v: 2 },
      ));
    }
    expect(received).toHaveLength(5);
    expect((conn as any).lastRecvSeq).toBe(4);

    // Simulate the production-bug scenario: desktop's WS flaps and reconnects.
    // RelayClient re-emits 'connect'; RelayConnection resets its seq counters
    // (but there's no crypto state to reset anymore — nonces are stateless).
    client.emit('connect');
    expect((conn as any).lastRecvSeq).toBe(-1);

    // Phone never noticed the desktop flap, so it keeps sending under the
    // same session key but with fresh random nonces per envelope. We pick
    // up its seq counter past the (former) 8-wide sliding window boundary
    // to demonstrate the bug is fixed — previously frames 9+ would fail.
    for (let seq = 5; seq <= 24; seq++) {
      client.emit('message', encEnvelope(
        sessionKeys.sendKey, device.sid!, seq, { type: 'heartbeat', v: 2 },
      ));
    }

    // Every single frame decoded: 5 from the first round + 20 from after
    // the desktop reset.
    expect(received).toHaveLength(5 + 20);
    expect((conn as any).lastRecvSeq).toBe(24);

    conn.stop();
  });

  it('handles phone reconnect — phone resets its seq back to 0, desktop still decrypts everything', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });

    const received: MobileMessageV2[] = [];
    conn.on('message', (m: MobileMessageV2) => received.push(m));

    const sessionKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
    const client: any = (conn as any).client;
    client.emit('connect');

    // Phone sends a few envelopes.
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 0, { type: 'heartbeat', v: 2 }));
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 1, { type: 'heartbeat', v: 2 }));
    expect(received).toHaveLength(2);
    expect((conn as any).lastRecvSeq).toBe(1);

    // Phone reconnects — its seq counter goes back to 0. Under the old
    // stream-cipher design this would collide with replay dedup. With
    // stateless AEAD + the desktop's own 'connect' event resetting
    // lastRecvSeq, the replay of seq=0 is accepted cleanly.
    client.emit('connect');
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 0, { type: 'heartbeat', v: 2 }));
    client.emit('message', encEnvelope(sessionKeys.sendKey, device.sid!, 1, { type: 'heartbeat', v: 2 }));

    expect(received).toHaveLength(4);
    expect((conn as any).lastRecvSeq).toBe(1);

    conn.stop();
  });
});
