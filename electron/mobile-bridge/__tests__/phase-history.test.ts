import { describe, it, expect, vi } from 'vitest';
import { x25519, ed25519 } from '@noble/curves/ed25519';
import { RelayConnection } from '../relay-connection';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { aeadEncrypt } from '../../../shared/crypto/aead';
import { encodeV2 } from '../../../shared/protocol/mobile';
import type { MobileMessageV2, PairedDevice, PhaseHistory } from '../../../shared/types';

function b64(u: Uint8Array): string { return Buffer.from(u).toString('base64'); }

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
    deviceId: 'd1', deviceName: 'iPhone', deviceTokenHash: 'h',
    pairedAt: 1, lastSeenAt: 1,
    phoneIdentityPub: b64(keys.phonePub),
    pairSignPriv: b64(keys.pairSignPriv),
    pairSignPub: b64(keys.pairSignPub),
    sid: 'SID', remoteAllowed: true, epoch: 1,
  };
}

describe('RelayConnection — getPhaseHistory routing', () => {
  it('invokes the registered handler and sends phaseHistory back on relay', () => {
    const keys = makeKeys();
    const device = makeDevice(keys);

    const stubHistory: PhaseHistory[] = [
      { agentRole: 'ceo', runs: [{ runNumber: 1, messages: [] }] },
    ];
    const handler = vi.fn().mockReturnValue(stubHistory);

    const conn = new RelayConnection({
      desktop: { priv: keys.desktopPriv, pub: keys.desktopPub },
      device,
    });
    conn.onPhoneGetPhaseHistory(handler);

    const sent: MobileMessageV2[] = [];
    const origSendMessage = conn.sendMessage.bind(conn);
    conn.sendMessage = (msg: MobileMessageV2) => { sent.push(msg); return origSendMessage(msg); };

    // Emit 'connect' so streams are ready.
    const client: any = (conn as any).client;
    client.emit('connect');

    // Encrypt a getPhaseHistory frame from the phone side.
    const phoneKeys = deriveSessionKeys(keys.phonePriv, keys.desktopPub, 'initiator');
    function encFrame(msg: MobileMessageV2): string {
      const plain = new TextEncoder().encode(encodeV2(msg));
      const { nonce, ct } = aeadEncrypt(phoneKeys.sendKey, plain);
      return JSON.stringify({
        v: 2, sid: device.sid!, seq: 0, kind: 'data',
        nonce: Buffer.from(nonce).toString('base64'),
        ct: Buffer.from(ct).toString('base64'),
      });
    }
    client.emit('message', encFrame({
      type: 'getPhaseHistory', v: 2, phase: 'imagine', requestId: 'req-xyz',
    }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('imagine');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      type: 'phaseHistory', v: 2, requestId: 'req-xyz', phase: 'imagine', history: stubHistory,
    });
  });
});
