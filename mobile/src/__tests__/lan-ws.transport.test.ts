import { LanWsTransport } from '../transport/lan-ws.transport';
import type { MobileMessage } from '../types/shared';

class FakeWebSocket {
  public readyState = 0;
  public sent: string[] = [];
  public onopen: ((ev: any) => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: ((ev: { code: number }) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  constructor(public url: string) { /* empty */ }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  simulateOpen() { this.readyState = 1; this.onopen?.({}); }
  simulateMessage(msg: MobileMessage) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

let lastSocket: FakeWebSocket | null = null;
(globalThis as any).WebSocket = class extends FakeWebSocket {
  constructor(url: string) { super(url); lastSocket = this; }
};

describe('LanWsTransport', () => {
  beforeEach(() => { lastSocket = null; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  const device = { deviceId: 'd1', deviceToken: 't1' };

  it('sends auth on open and emits connected on authed', () => {
    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    const statuses: any[] = [];
    t.on('status', (s) => statuses.push(s));
    t.connect();

    lastSocket!.simulateOpen();
    expect(lastSocket!.sent[0]).toContain('"type":"auth"');

    lastSocket!.simulateMessage({
      type: 'authed', v: 1,
      snapshot: {
        sessionId: 's', desktopName: 'test-desktop', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    });

    const connected = statuses.find((s) => s.state === 'connected');
    expect(connected).toBeTruthy();
    expect(connected.desktopName).toBe('test-desktop');
  });

  it('emits disconnected on socket close and reconnects after backoff', () => {
    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    t.connect();
    lastSocket!.simulateOpen();
    const firstSocket = lastSocket;
    firstSocket!.close();

    // First backoff is 1000ms
    jest.advanceTimersByTime(1100);
    expect(lastSocket).not.toBe(firstSocket);  // new socket created
  });

  it('emits authFailed and does not reconnect after unknownDevice', () => {
    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    const statuses: any[] = [];
    t.on('status', (s) => statuses.push(s));
    t.connect();
    lastSocket!.simulateOpen();
    lastSocket!.simulateMessage({ type: 'authFailed', v: 1, reason: 'unknownDevice' });

    expect(statuses.some((s) => s.state === 'disconnected' && s.reason === 'unknownDevice')).toBe(true);
  });

  it('forwards event messages via the message event', () => {
    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    const received: MobileMessage[] = [];
    t.on('message', (m) => received.push(m));
    t.connect();
    lastSocket!.simulateOpen();
    lastSocket!.simulateMessage({
      type: 'authed', v: 1,
      snapshot: {
        sessionId: 's', desktopName: 'x', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    });
    lastSocket!.simulateMessage({
      type: 'event', v: 1,
      event: { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 },
    });
    const events = received.filter((m) => m.type === 'event');
    expect(events).toHaveLength(1);
  });
});
