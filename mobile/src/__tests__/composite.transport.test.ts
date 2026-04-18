import { CompositeTransport } from '../transport/composite.transport';
import type { Transport, TransportStatus, TransportEventMap } from '../transport/transport.interface';
import type { MobileMessageV2 } from '@shared/types';

class FakeTransport implements Transport {
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: MobileMessageV2) => void>();
  public connectCalls = 0;
  public disconnectCalls = 0;
  public sent: MobileMessageV2[] = [];

  connect(): void { this.connectCalls++; }
  disconnect(): void { this.disconnectCalls++; }
  send(msg: MobileMessageV2): void { this.sent.push(msg); }
  on<K extends keyof TransportEventMap>(event: K, handler: TransportEventMap[K]): () => void {
    if (event === 'status') {
      this.statusListeners.add(handler as any);
      return () => this.statusListeners.delete(handler as any);
    }
    this.messageListeners.add(handler as any);
    return () => this.messageListeners.delete(handler as any);
  }

  emitStatus(s: TransportStatus): void { for (const h of this.statusListeners) h(s); }
  emitMessage(m: MobileMessageV2): void { for (const h of this.messageListeners) h(m); }
}

describe('CompositeTransport', () => {
  let lan: FakeTransport;
  let relay: FakeTransport;

  beforeEach(() => {
    lan = new FakeTransport();
    relay = new FakeTransport();
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('connect() starts LAN immediately, not relay', () => {
    const t = new CompositeTransport(lan, relay);
    t.connect();
    expect(lan.connectCalls).toBe(1);
    expect(relay.connectCalls).toBe(0);
  });

  it('forwards LAN messages when LAN is authoritative', () => {
    const t = new CompositeTransport(lan, relay);
    const received: MobileMessageV2[] = [];
    t.on('message', (m) => received.push(m));
    t.connect();
    lan.emitStatus({ state: 'connected', desktopName: 'test' });
    lan.emitMessage({ type: 'heartbeat', v: 2 });
    expect(received).toHaveLength(1);
  });

  it('falls back to relay after LAN_FIRST_TIMEOUT if LAN never connects', () => {
    const t = new CompositeTransport(lan, relay);
    t.connect();
    // Simulate LAN never connecting. Fire fake timer.
    jest.advanceTimersByTime(11_000);
    expect(relay.connectCalls).toBe(1);
  });

  it('does not fall back to relay if relay is null', () => {
    const t = new CompositeTransport(lan, null);
    t.connect();
    jest.advanceTimersByTime(30_000);
    expect(lan.connectCalls).toBeGreaterThanOrEqual(1);
    // No relay object to check; just verify no throw
  });

  it('forwards relay messages after switching to relay mode', () => {
    const t = new CompositeTransport(lan, relay);
    const received: MobileMessageV2[] = [];
    t.on('message', (m) => received.push(m));
    t.connect();
    // LAN never connects, relay takes over
    jest.advanceTimersByTime(11_000);
    relay.emitStatus({ state: 'connected', desktopName: 'test' });
    relay.emitMessage({ type: 'heartbeat', v: 2 });
    expect(received).toHaveLength(1);
  });

  it('does not forward LAN messages once relay is authoritative', () => {
    const t = new CompositeTransport(lan, relay);
    const received: MobileMessageV2[] = [];
    t.on('message', (m) => received.push(m));
    t.connect();
    jest.advanceTimersByTime(11_000);
    relay.emitStatus({ state: 'connected', desktopName: 'test' });
    // A stray LAN message should be ignored
    lan.emitMessage({ type: 'heartbeat', v: 2 });
    expect(received).toHaveLength(0);
  });

  it('disconnect() tears down both transports', () => {
    const t = new CompositeTransport(lan, relay);
    t.connect();
    t.disconnect();
    expect(lan.disconnectCalls).toBe(1);
    expect(relay.disconnectCalls).toBe(1);
  });

  it('status events carry the correct mode', () => {
    const t = new CompositeTransport(lan, relay);
    const statuses: TransportStatus[] = [];
    t.on('status', (s) => statuses.push(s));
    t.connect();
    lan.emitStatus({ state: 'connected', desktopName: 'test' });
    const withMode = statuses.find((s) => s.state === 'connected');
    expect((withMode as any)?.mode).toBe('lan');
  });
});
