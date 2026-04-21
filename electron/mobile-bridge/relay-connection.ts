// electron/mobile-bridge/relay-connection.ts
// One per remoteAllowed device. Wraps a RelayClient with stateless AEAD +
// envelope serialization. Holds long-lived session keys and a per-connection
// seq counter. No stream-cipher state: every envelope carries its own random
// 12-byte nonce.

import { EventEmitter } from 'events';
import type { MobileMessageV2, PairedDevice, Phase, PhaseHistory, RelayEnvelope } from '../../shared/types';
import { RELAY_URL } from '../../shared/types';
import { encodeV2, decodeV2 } from '../../shared/protocol/mobile';
import { deriveSessionKeys } from '../../shared/crypto/noise';
import { aeadEncrypt, aeadDecrypt } from '../../shared/crypto/aead';
import { RelayClient } from './relay-client';
import { mintToken } from './token-minter';
import type { Identity } from './identity';

function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export class RelayConnection extends EventEmitter {
  private client: RelayClient;
  private readonly sendKey: Uint8Array;
  private readonly recvKey: Uint8Array;
  private seq = 0;
  private lastRecvSeq = -1;
  private readonly sid: string;
  private readonly deviceId: string;
  private readonly pairSignPriv: Uint8Array;
  private readonly epoch: number;
  private phaseHistoryHandler: ((phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>) | null = null;

  onPhoneGetPhaseHistory(handler: (phase: Phase) => PhaseHistory[] | Promise<PhaseHistory[]>): void {
    this.phaseHistoryHandler = handler;
  }

  constructor(opts: { desktop: Identity; device: PairedDevice }) {
    super();
    if (
      !opts.device.phoneIdentityPub ||
      !opts.device.pairSignPriv ||
      !opts.device.pairSignPub ||
      !opts.device.sid
    ) {
      throw new Error(`RelayConnection requires v2-paired device; missing fields on ${opts.device.deviceId}`);
    }
    this.deviceId = opts.device.deviceId;
    this.sid = opts.device.sid;
    this.pairSignPriv = b64decode(opts.device.pairSignPriv);
    this.epoch = opts.device.epoch ?? 1;

    const desktopPriv = opts.desktop.priv;
    const phonePub = b64decode(opts.device.phoneIdentityPub);
    const keys = deriveSessionKeys(desktopPriv, phonePub, 'responder');
    this.sendKey = keys.sendKey;
    this.recvKey = keys.recvKey;

    this.client = new RelayClient({
      url: RELAY_URL,
      sid: this.sid,
      mintToken: () =>
        mintToken(this.pairSignPriv, {
          sid: this.sid,
          role: 'desktop',
          epoch: this.epoch,
          ttlMs: 15 * 60_000,
        }),
      pairSignPub: b64decode(opts.device.pairSignPub),
    });

    // On every WS (re)connect, reset our per-connection counters. The worker
    // resets lastSeq[desktop] = -1 on accepting a new WS, so our seq must
    // start at 0 to satisfy the anti-regression gate. Crypto state has no
    // counters anymore — nothing else to reset.
    this.client.on('connect', () => {
      this.seq = 0;
      this.lastRecvSeq = -1;
      this.emit('connect');
    });
    this.client.on('disconnect', () => this.emit('disconnect'));
    this.client.on('error', (err: Error) => this.emit('error', err));
    this.client.on('message', (raw: string) => this.onRawFrame(raw));
  }

  start(): void {
    this.client.start();
  }

  stop(): void {
    this.client.stop();
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  /** Encrypt + envelope + send. No-op if not connected. */
  sendMessage(msg: MobileMessageV2, kind: 'data' | 'ctrl' = 'data'): void {
    if (!this.client.isConnected()) return;
    const plain = new TextEncoder().encode(encodeV2(msg));
    const { nonce, ct } = aeadEncrypt(this.sendKey, plain);
    const envelope: RelayEnvelope = {
      v: 2,
      sid: this.sid,
      seq: this.seq++,
      kind,
      nonce: Buffer.from(nonce).toString('base64'),
      ct: Buffer.from(ct).toString('base64'),
    };
    this.client.send(JSON.stringify(envelope));
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  private onRawFrame(raw: string): void {
    let env: unknown;
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    if (!env || typeof env !== 'object') return;
    const e = env as Partial<RelayEnvelope>;
    if (e.v !== 2 || e.sid !== this.sid
        || typeof e.seq !== 'number' || typeof e.ct !== 'string'
        || typeof e.nonce !== 'string') return;

    if (e.seq <= this.lastRecvSeq) return; // replay / out-of-order
    this.lastRecvSeq = e.seq;

    try {
      const nonce = new Uint8Array(Buffer.from(e.nonce, 'base64'));
      const ct = new Uint8Array(Buffer.from(e.ct, 'base64'));
      const plain = aeadDecrypt(this.recvKey, nonce, ct);
      const msg = decodeV2(new TextDecoder().decode(plain));
      if (msg) {
        this.emit('message', msg, this.deviceId);
        if (msg.type === 'getPhaseHistory' && this.phaseHistoryHandler) {
          const handler = this.phaseHistoryHandler;
          const result = handler(msg.phase);
          const sendReply = (history: PhaseHistory[]) => {
            this.sendMessage({
              type: 'phaseHistory', v: 2,
              requestId: msg.requestId, phase: msg.phase, history,
            });
          };
          if (result && typeof (result as Promise<PhaseHistory[]>).then === 'function') {
            (result as Promise<PhaseHistory[]>).then(sendReply).catch((err: Error) => {
              console.warn('[relay-conn]', this.deviceId, 'phase-history handler failed:', err.message);
            });
          } else {
            try {
              sendReply(result as PhaseHistory[]);
            } catch (err) {
              console.warn('[relay-conn]', this.deviceId, 'phase-history handler failed:', (err as Error).message);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[relay-conn]', this.deviceId, 'decrypt failed seq=', e.seq, (err as Error).message);
    }
  }
}
