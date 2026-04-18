import { describe, it, expect } from 'vitest';
import { PairingFSM } from '../pairing-fsm';
import { getOrCreateIdentity } from '../identity';
import { createPairingToken } from '../pairing';
import { DeviceStore } from '../device-store';
import { x25519 } from '@noble/curves/ed25519';
import { deriveSessionKeys } from '../../../shared/crypto/noise';
import { RecvStream, SendStream } from '../../../shared/crypto/secretstream';
import { decodeV2 } from '../../../shared/protocol/mobile';
import type { AppSettings, MobileMessageV2 } from '../../../shared/types';

function makeSettings(): AppSettings {
  return {
    defaultModelPreset: 'default', defaultPermissionMode: 'auto-safe',
    maxParallelTLs: 4, gitIdentities: [], defaultGitIdentityId: null,
    gitPreferences: { includeOfficeStateInRepo: false },
    mobile: { enabled: true, port: null, devices: [] },
  };
}

function makeStore() {
  let state = makeSettings();
  return { get: () => state, update: (p: Partial<AppSettings>) => { state = { ...state, ...p }; return state; } };
}

describe('PairingFSM', () => {
  it('drives pair → pairConfirm → pairRemoteConsent → paired', async () => {
    const store = makeStore() as any;
    const identity = getOrCreateIdentity(store);
    const deviceStore = new DeviceStore(store);
    const pairingToken = createPairingToken();

    const plainFrames: MobileMessageV2[] = [];
    const encryptedFrames: Buffer[] = [];

    const fsm = new PairingFSM({
      identity, desktopName: 'test-desktop', deviceStore, pairingToken,
      sendPlain: (m) => plainFrames.push(m),
      sendEncrypted: (m, send) => {
        const ct = send.encrypt(new TextEncoder().encode(JSON.stringify(m)));
        encryptedFrames.push(Buffer.from(ct));
      },
      onPendingSas: () => {},
    });

    // Phone keypair
    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);
    const keys = deriveSessionKeys(phonePriv, identity.pub, 'initiator');
    const recv = new RecvStream(keys.recvKey);

    await fsm.handlePair({
      type: 'pair', v: 2, pairingToken: pairingToken.token,
      devicePub: Buffer.from(phonePub).toString('base64'),
      deviceName: 'Test iPhone',
    });
    expect(fsm.getState()).toBe('awaiting-sas');

    await fsm.handlePairConfirm();
    expect(fsm.getState()).toBe('awaiting-remote-consent');

    await fsm.handlePairRemoteConsent({ type: 'pairRemoteConsent', v: 2, remoteAllowed: true });
    expect(fsm.getState()).toBe('authenticated');
    expect(encryptedFrames).toHaveLength(1);

    const plain = new TextDecoder().decode(recv.decrypt(new Uint8Array(encryptedFrames[0])));
    const parsed = decodeV2(plain);
    expect(parsed?.type).toBe('paired');

    const [dev] = deviceStore.list();
    expect(dev.remoteAllowed).toBe(true);
    expect(dev.deviceName).toBe('Test iPhone');
  });

  it('rejects wrong pairing token', async () => {
    const store = makeStore() as any;
    const identity = getOrCreateIdentity(store);
    const deviceStore = new DeviceStore(store);
    const pairingToken = createPairingToken();
    const plainFrames: MobileMessageV2[] = [];
    const fsm = new PairingFSM({
      identity, desktopName: 'test', deviceStore, pairingToken,
      sendPlain: (m) => plainFrames.push(m),
      sendEncrypted: () => {},
      onPendingSas: () => {},
    });

    const phonePriv = x25519.utils.randomPrivateKey();
    const phonePub = x25519.getPublicKey(phonePriv);

    await fsm.handlePair({
      type: 'pair', v: 2, pairingToken: 'WRONG',
      devicePub: Buffer.from(phonePub).toString('base64'),
      deviceName: 'Phone',
    });

    expect(fsm.getState()).toBe('closed');
    expect(plainFrames).toHaveLength(1);
    expect(plainFrames[0].type).toBe('authFailed');
  });

  it('ignores out-of-order handlers (pairConfirm before pair)', async () => {
    const store = makeStore() as any;
    const identity = getOrCreateIdentity(store);
    const deviceStore = new DeviceStore(store);
    const pairingToken = createPairingToken();
    const fsm = new PairingFSM({
      identity, desktopName: 'test', deviceStore, pairingToken,
      sendPlain: () => {},
      sendEncrypted: () => {},
      onPendingSas: () => {},
    });

    await fsm.handlePairConfirm(); // no-op
    expect(fsm.getState()).toBe('awaiting-pair');
  });
});
