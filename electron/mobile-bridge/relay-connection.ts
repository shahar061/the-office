// electron/mobile-bridge/relay-connection.ts
// One per remoteAllowed device. Wraps a RelayClient with encryption +
// envelope serialization. Owns its own SendStream/RecvStream and seq counter.

import { EventEmitter } from 'events';
import type { MobileMessageV2, PairedDevice, RelayEnvelope } from '../../shared/types';
import { RELAY_URL } from '../../shared/types';
import { encodeV2, decodeV2 } from '../../shared/protocol/mobile';
import { deriveSessionKeys } from '../../shared/crypto/noise';
import { SendStream, RecvStream } from '../../shared/crypto/secretstream';
import { RelayClient } from './relay-client';
import { mintToken } from './token-minter';
import type { Identity } from './identity';

function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

export class RelayConnection extends EventEmitter {
  private client: RelayClient;
  private send!: SendStream;
  private recv!: RecvStream;
  private seq = 0;
  private lastRecvSeq = -1;
  private readonly sid: string;
  private readonly deviceId: string;
  private readonly pairSignPriv: Uint8Array;
  private readonly desktopPriv: Uint8Array;
  private readonly phonePub: Uint8Array;
  private readonly epoch: number;

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

    this.desktopPriv = opts.desktop.priv;
    this.phonePub = b64decode(opts.device.phoneIdentityPub);
    this.resetStreams();

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

    // Recreate encryption state on every WS (re)connection. The phone also
    // resets its streams on each connect, so without matching resets here the
    // nonces drift apart after the first WS drop and every subsequent frame
    // fails to decrypt silently.
    this.client.on('connect', () => { this.resetStreams(); this.emit('connect'); });
    this.client.on('disconnect', () => this.emit('disconnect'));
    this.client.on('error', (err: Error) => this.emit('error', err));
    this.client.on('message', (raw: string) => this.onRawFrame(raw));
  }

  private resetStreams(): void {
    const keys = deriveSessionKeys(this.desktopPriv, this.phonePub, 'responder');
    this.send = new SendStream(keys.sendKey);
    this.recv = new RecvStream(keys.recvKey);
    this.seq = 0;
    this.lastRecvSeq = -1;
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
    const ct = this.send.encrypt(plain);
    const envelope: RelayEnvelope = {
      v: 2,
      sid: this.sid,
      seq: this.seq++,
      kind,
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
    if (e.v !== 2 || e.sid !== this.sid || typeof e.seq !== 'number' || typeof e.ct !== 'string') return;

    // Peer-reconnect signal: seq=0 after we've already received non-negative
    // seqs means the peer's WS dropped and reconnected, so its send stream
    // is fresh. Reset our streams in lockstep before attempting to decrypt.
    if (e.seq === 0 && this.lastRecvSeq >= 0) {
      this.resetStreams();
    }

    if (e.seq <= this.lastRecvSeq) return; // replay / out-of-order
    this.lastRecvSeq = e.seq;
    try {
      const ct = new Uint8Array(Buffer.from(e.ct, 'base64'));
      const plain = this.recv.decrypt(ct);
      const msg = decodeV2(new TextDecoder().decode(plain));
      if (msg) this.emit('message', msg, this.deviceId);
    } catch (err) {
      console.warn('[relay-conn]', this.deviceId, 'decrypt failed seq=', e.seq, (err as Error).message);
    }
  }
}
