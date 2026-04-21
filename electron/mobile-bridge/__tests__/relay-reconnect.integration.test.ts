import { describe, it, expect } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import { RelayConnection } from '../relay-connection';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { SendStream } from '../../../shared/crypto/secretstream';
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

function freshPhoneSend(keys: ReturnType<typeof makeKeys>) {
  const sessionKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
  return new SendStream(sessionKeys.sendKey);
}

function encEnvelope(sid: string, seq: number, msg: MobileMessageV2, sendStream: SendStream): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const ct = sendStream.encrypt(plain);
  return JSON.stringify({ v: 2, sid, seq, kind: 'data', ct: b64(ct) });
}

describe('RelayConnection — production bug regression', () => {
  it('recovers from a phone WS drop+reconnect without a second reconnect loop', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });

    const received: MobileMessageV2[] = [];
    conn.on('message', (m: MobileMessageV2) => received.push(m));

    // Drive the session by emitting 'message' events on the underlying
    // RelayClient — this is exactly what the `ws` library would do in
    // production after a frame arrives off the wire. Bypassing the WebSocket
    // keeps the test free of networking concerns.
    const client: any = (conn as any).client;

    // Initial connect also fires resetStreams on desktop side (matches
    // production behavior when the ws handshake completes).
    client.emit('connect');

    // Steady-state phone→desktop traffic with a stable SendStream.
    let phoneSend = freshPhoneSend(keys);
    client.emit('message', encEnvelope(device.sid!, 0, { type: 'heartbeat', v: 2 }, phoneSend));
    client.emit('message', encEnvelope(device.sid!, 1, { type: 'heartbeat', v: 2 }, phoneSend));
    expect(received).toHaveLength(2);
    expect((conn as any).lastRecvSeq).toBe(1);

    // Simulate phone's WS drop + reconnect: fresh SendStream, seq back to 0.
    // Note the desktop's WS is NOT re-emitting 'connect' here — we're
    // explicitly testing the case where ONLY the phone reconnected, which
    // is the scenario from the production bug log.
    phoneSend = freshPhoneSend(keys);
    client.emit('message', encEnvelope(device.sid!, 0, { type: 'heartbeat', v: 2 }, phoneSend));

    expect(received).toHaveLength(3);
    expect((conn as any).lastRecvSeq).toBe(0);

    // Subsequent frames under the fresh stream still decode.
    client.emit('message', encEnvelope(device.sid!, 1, { type: 'heartbeat', v: 2 }, phoneSend));
    expect(received).toHaveLength(4);
    expect((conn as any).lastRecvSeq).toBe(1);

    conn.stop();
  });
});
