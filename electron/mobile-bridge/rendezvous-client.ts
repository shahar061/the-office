// electron/mobile-bridge/rendezvous-client.ts
// Desktop-side outbound WS to the relay's /pair/:roomId endpoint.
// Drives a PairingFSM to complete a relay-based pairing handshake.

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { MobileMessageV2 } from '../../shared/types';
import { encodeV2, isMobileMessageV2 } from '../../shared/protocol/mobile';
import type { Identity } from './identity';
import type { DeviceStore } from './device-store';
import type { PairingToken } from './pairing';
import { SendStream } from '../../shared/crypto/secretstream';
import { PairingFSM } from './pairing-fsm';

export interface RendezvousClientOpts {
  identity: Identity;
  desktopName: string;
  deviceStore: DeviceStore;
  pairingToken: PairingToken;
  roomId: string;
  /** wss://...relay... */
  relayUrl: string;
  onPaired?: (deviceId: string) => void;
  onPendingSas?: (sas: string | null) => void;
}

export class RendezvousClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private fsm: PairingFSM;
  private running = false;

  constructor(private opts: RendezvousClientOpts) {
    super();
    this.fsm = new PairingFSM({
      identity: opts.identity,
      desktopName: opts.desktopName,
      deviceStore: opts.deviceStore,
      pairingToken: opts.pairingToken,
      sendPlain: (msg) => this.sendRaw(encodeV2(msg)),
      sendEncrypted: (msg, send) => this.sendEncryptedEnvelope(msg, send),
      onPendingSas: (sas) => opts.onPendingSas?.(sas),
      onAuthenticated: ({ deviceId }) => {
        opts.onPaired?.(deviceId);
        // Pairing is done — close the rendezvous after a brief flush delay.
        // Subsequent traffic goes through the normal RelayConnection spawned
        // by the bridge factory.
        setTimeout(() => this.stop(), 100);
      },
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const url =
      `${this.opts.relayUrl}/pair/${encodeURIComponent(this.opts.roomId)}` +
      `?role=host&token=${encodeURIComponent(this.opts.pairingToken.token)}`;
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.emit('error', err as Error);
      this.running = false;
      return;
    }
    this.ws.on('open', () => {
      this.emit('connect');
    });
    this.ws.on('message', (data) => {
      this.onMessage(data.toString());
    });
    this.ws.on('close', () => {
      this.ws = null;
      this.emit('disconnect');
      if (this.running) {
        this.running = false;
        this.fsm.close();
      }
    });
    this.ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  stop(): void {
    this.running = false;
    this.fsm.close();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private sendRaw(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(text);
      } catch {
        // ignore send errors — connection may be closing
      }
    }
  }

  private sendEncryptedEnvelope(msg: MobileMessageV2, send: SendStream): void {
    // Post-handshake frames are sent as a JSON envelope with a base64 `ct`
    // field so they can travel as WS text frames (the relay's PairingRoomDO
    // forwards text frames only).  The phone's rendezvous-transport (Task 9)
    // checks for a `ct` field and base64-decodes + decrypts.
    const plain = new TextEncoder().encode(encodeV2(msg));
    const ct = send.encrypt(plain);
    const envelope = JSON.stringify({ ct: Buffer.from(ct).toString('base64') });
    this.sendRaw(envelope);
  }

  private onMessage(text: string): void {
    // Incoming messages on the rendezvous WS are always plain-JSON
    // MobileMessageV2 (pair / pairConfirm / pairRemoteConsent) during the
    // handshake.  The desktop never receives encrypted frames on this channel.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (!isMobileMessageV2(parsed)) return;
    const msg = parsed as MobileMessageV2;
    switch (msg.type) {
      case 'pair':
        void this.fsm.handlePair(msg);
        break;
      case 'pairConfirm':
        void this.fsm.handlePairConfirm();
        break;
      case 'pairRemoteConsent':
        void this.fsm.handlePairRemoteConsent(msg);
        break;
      default:
        // ignore unexpected message types
        break;
    }
  }
}
