// mobile/src/transport/composite.transport.ts
// Tries LAN first; falls back to relay if LAN can't connect within a timeout
// or keeps failing after repeated attempts. Once relay is authoritative,
// it stays authoritative until a fresh connect().

import type { MobileMessageV2 } from '@shared/types';
import type { Transport, TransportStatus, TransportEventMap } from './transport.interface';

const LAN_FIRST_TIMEOUT_MS = 10_000;

export class CompositeTransport implements Transport {
  private active: 'lan' | 'relay' | null = null;
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: MobileMessageV2) => void>();
  private lanUnsubs: Array<() => void> = [];
  private relayUnsubs: Array<() => void> = [];
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private relayUsed = false;

  constructor(private lan: Transport, private relay: Transport | null) {}

  connect(): void {
    // Wire LAN listeners
    this.lanUnsubs.push(this.lan.on('status', (s) => this.onLanStatus(s)));
    this.lanUnsubs.push(this.lan.on('message', (m) => this.onLanMessage(m)));

    // Wire relay listeners now (but don't start relay yet)
    if (this.relay) {
      this.relayUnsubs.push(this.relay.on('status', (s) => this.onRelayStatus(s)));
      this.relayUnsubs.push(this.relay.on('message', (m) => this.onRelayMessage(m)));
    }

    this.emitStatus({ state: 'connecting', mode: 'lan' });
    this.lan.connect();

    // If LAN doesn't reach "connected" before this timeout, try relay.
    this.fallbackTimer = setTimeout(() => {
      if (this.active === 'lan') return; // already connected via LAN
      this.tryRelay();
    }, LAN_FIRST_TIMEOUT_MS);
  }

  disconnect(): void {
    if (this.fallbackTimer) { clearTimeout(this.fallbackTimer); this.fallbackTimer = null; }
    for (const u of this.lanUnsubs) u();
    this.lanUnsubs = [];
    for (const u of this.relayUnsubs) u();
    this.relayUnsubs = [];
    this.lan.disconnect();
    this.relay?.disconnect();
    this.active = null;
  }

  send(msg: MobileMessageV2): void {
    if (this.active === 'lan') this.lan.send(msg);
    else if (this.active === 'relay') this.relay?.send(msg);
  }

  on<K extends keyof TransportEventMap>(event: K, handler: TransportEventMap[K]): () => void {
    if (event === 'status') {
      this.statusListeners.add(handler as any);
      return () => { this.statusListeners.delete(handler as any); };
    }
    this.messageListeners.add(handler as any);
    return () => { this.messageListeners.delete(handler as any); };
  }

  private onLanStatus(s: TransportStatus): void {
    if (s.state === 'connected') {
      if (this.fallbackTimer) { clearTimeout(this.fallbackTimer); this.fallbackTimer = null; }
      this.active = 'lan';
      this.emitStatus({ ...s, mode: 'lan' });
    } else if (this.active === 'lan') {
      // LAN lost connection while authoritative; forward the status so UI reflects it.
      this.emitStatus({ ...s, mode: 'lan' });
    } else {
      // Still trying — pass through but keep mode marker
      this.emitStatus({ ...s, mode: 'lan' });
    }
  }

  private onLanMessage(m: MobileMessageV2): void {
    if (this.active === 'lan') {
      for (const h of this.messageListeners) (h as (m: MobileMessageV2) => void)(m);
    }
  }

  private onRelayStatus(s: TransportStatus): void {
    if (s.state === 'connected') {
      this.active = 'relay';
      this.emitStatus({ ...s, mode: 'relay' });
    } else if (this.active === 'relay') {
      this.emitStatus({ ...s, mode: 'relay' });
    }
    // Before relay is authoritative, suppress its status chatter
  }

  private onRelayMessage(m: MobileMessageV2): void {
    if (this.active === 'relay') {
      for (const h of this.messageListeners) (h as (m: MobileMessageV2) => void)(m);
    }
  }

  private tryRelay(): void {
    if (!this.relay || this.relayUsed) return;
    this.relayUsed = true;
    this.emitStatus({ state: 'connecting', mode: 'relay' });
    this.relay.connect();
  }

  private emitStatus(s: TransportStatus): void {
    for (const h of this.statusListeners) (h as (s: TransportStatus) => void)(s);
  }
}
