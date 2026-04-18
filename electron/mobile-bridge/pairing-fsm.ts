// electron/mobile-bridge/pairing-fsm.ts
// Transport-agnostic pairing state machine. Drives the
// pair → pairConfirm → pairRemoteConsent → paired handshake.
// Caller provides identity + deviceStore + pairingToken + I/O callbacks;
// the FSM handles crypto + state transitions.

import { randomUUID, randomBytes } from 'crypto';
import type { MobileMessageV2, PairedDevice } from '../../shared/types';
import type { Identity } from './identity';
import { deriveSessionKeys } from '../../shared/crypto/noise';
import { deriveSas } from '../../shared/crypto/sas';
import { SendStream, RecvStream } from '../../shared/crypto/secretstream';
import type { DeviceStore } from './device-store';
import {
  isPairingTokenExpired,
  generateDeviceToken,
  hashDeviceToken,
  generatePairSignKeypair,
  type PairingToken,
} from './pairing';
import { mintToken } from './token-minter';

const RELAY_TOKEN_TTL_MS = 24 * 60 * 60_000;

export interface PairingFSMOpts {
  identity: Identity;
  desktopName: string;
  deviceStore: DeviceStore;
  pairingToken: PairingToken;
  /** Send a frame BEFORE encryption is established (e.g. authFailed). */
  sendPlain: (msg: MobileMessageV2) => void;
  /** Send a frame AFTER authentication succeeds, encrypted with the post-
   *  handshake SendStream. */
  sendEncrypted: (msg: MobileMessageV2, send: SendStream) => void;
  onPendingSas?: (sas: string | null) => void;
  /** Called after a successful paired transition, so the caller can mark
   *  the connection as fully authenticated. Receives the session streams
   *  so the caller can continue traffic on the same channel. */
  onAuthenticated?: (ctx: { deviceId: string; send: SendStream; recv: RecvStream }) => void;
}

type State =
  | { kind: 'awaiting-pair' }
  | {
      kind: 'awaiting-sas';
      devicePub: Uint8Array;
      sessionKeys: { sendKey: Uint8Array; recvKey: Uint8Array };
      deviceName: string;
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

export class PairingFSM {
  private state: State = { kind: 'awaiting-pair' };

  constructor(private opts: PairingFSMOpts) {}

  getState(): State['kind'] { return this.state.kind; }

  async handlePair(msg: Extract<MobileMessageV2, { type: 'pair' }>): Promise<void> {
    if (this.state.kind !== 'awaiting-pair') return;
    if (msg.pairingToken !== this.opts.pairingToken.token
        || isPairingTokenExpired(this.opts.pairingToken.expiresAt)) {
      this.opts.sendPlain({ type: 'authFailed', v: 2, reason: 'expired' });
      this.state = { kind: 'closed' };
      return;
    }
    let devicePubBuf: Buffer;
    try { devicePubBuf = Buffer.from(msg.devicePub, 'base64'); }
    catch {
      this.opts.sendPlain({ type: 'authFailed', v: 2, reason: 'malformed' });
      this.state = { kind: 'closed' };
      return;
    }
    if (devicePubBuf.length !== 32) {
      this.opts.sendPlain({ type: 'authFailed', v: 2, reason: 'malformed' });
      this.state = { kind: 'closed' };
      return;
    }
    const devicePub = new Uint8Array(devicePubBuf);
    const sessionKeys = deriveSessionKeys(this.opts.identity.priv, devicePub, 'responder');
    const sas = deriveSas(this.opts.identity.pub, devicePub, msg.pairingToken);
    this.state = {
      kind: 'awaiting-sas',
      devicePub, sessionKeys,
      deviceName: msg.deviceName || 'Unknown device',
    };
    this.opts.onPendingSas?.(sas);
  }

  async handlePairConfirm(): Promise<void> {
    if (this.state.kind !== 'awaiting-sas') return;
    const { devicePub, sessionKeys, deviceName } = this.state;
    const deviceId = randomUUID();
    const deviceToken = generateDeviceToken();
    const deviceTokenHash = await hashDeviceToken(deviceToken);
    const pairSign = generatePairSignKeypair();
    const sid = randomBytes(16).toString('base64url');
    // Guard: if the FSM was closed while hashing, don't transition.
    if (this.state.kind !== 'awaiting-sas') return;
    this.state = {
      kind: 'awaiting-remote-consent',
      deviceId, deviceToken, deviceTokenHash, pairSign, sid,
      devicePub, sessionKeys, deviceName,
    };
  }

  async handlePairRemoteConsent(msg: Extract<MobileMessageV2, { type: 'pairRemoteConsent' }>): Promise<void> {
    if (this.state.kind !== 'awaiting-remote-consent') return;
    const s = this.state;
    const device: PairedDevice = {
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      deviceTokenHash: s.deviceTokenHash,
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
      phoneIdentityPub: Buffer.from(s.devicePub).toString('base64'),
      pairSignPriv: Buffer.from(s.pairSign.priv).toString('base64'),
      pairSignPub: Buffer.from(s.pairSign.pub).toString('base64'),
      sid: s.sid,
      remoteAllowed: !!msg.remoteAllowed,
      epoch: 1,
    };
    this.opts.deviceStore.add(device);
    this.opts.onPendingSas?.(null);

    const send = new SendStream(s.sessionKeys.sendKey);
    const recv = new RecvStream(s.sessionKeys.recvKey);
    this.state = { kind: 'authenticated', deviceId: s.deviceId, send, recv };

    // If the user allowed remote access, mint an initial phone relay token so
    // the phone can immediately connect to wss://.../s/<sid> without waiting
    // for a subsequent tokenRefresh frame. This matters especially for the
    // rendezvous pairing flow (Plan 4), where the WebSocket closes as soon
    // as `paired` lands; a separate tokenRefresh would never arrive.
    let relayToken: string | undefined;
    let relayTokenExpiresAt: number | undefined;
    if (device.remoteAllowed) {
      relayTokenExpiresAt = Date.now() + RELAY_TOKEN_TTL_MS;
      relayToken = mintToken(s.pairSign.priv, {
        sid: s.sid,
        role: 'phone',
        epoch: 1,
        ttlMs: RELAY_TOKEN_TTL_MS,
      });
    }

    this.opts.sendEncrypted(
      {
        type: 'paired', v: 2,
        deviceId: s.deviceId,
        deviceToken: s.deviceToken,
        desktopName: this.opts.desktopName,
        sid: s.sid,
        ...(relayToken ? { relayToken, relayTokenExpiresAt } : {}),
      },
      send,
    );
    this.opts.onAuthenticated?.({ deviceId: s.deviceId, send, recv });
  }

  close(): void {
    if (this.state.kind === 'awaiting-sas' || this.state.kind === 'awaiting-remote-consent') {
      this.opts.onPendingSas?.(null);
    }
    this.state = { kind: 'closed' };
  }
}
