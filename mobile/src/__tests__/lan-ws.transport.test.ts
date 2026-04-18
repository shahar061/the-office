import { LanWsTransport } from '../transport/lan-ws.transport';
import { x25519 } from '@noble/curves/ed25519';
import { deriveSessionKeys } from '@shared/crypto/noise';
import { SendStream } from '@shared/crypto/secretstream';
import { encodeV2 } from '@shared/protocol/mobile';
import type { MobileMessageV2 } from '@shared/types';

class FakeWebSocket {
  public readyState = 0;
  public sent: (string | Uint8Array)[] = [];
  public onopen: ((ev: any) => void) | null = null;
  public onmessage: ((ev: { data: unknown }) => void) | null = null;
  public onclose: ((ev: { code: number }) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  constructor(public url: string) {}
  send(data: string | Uint8Array) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  simulateOpen() { this.readyState = 1; this.onopen?.({}); }
  simulateStringMessage(s: string) { this.onmessage?.({ data: s }); }
  simulateBinaryMessage(u: Uint8Array) { this.onmessage?.({ data: u }); }
}

let lastSocket: FakeWebSocket | null = null;
(globalThis as any).WebSocket = class extends FakeWebSocket {
  constructor(url: string) { super(url); lastSocket = this; }
};

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64');
}

function makeDesktopSide() {
  const desktopPriv = x25519.utils.randomPrivateKey();
  const desktopPub = x25519.getPublicKey(desktopPriv);
  return { desktopPriv, desktopPub };
}

function makePhoneDevice(desktopPub: Uint8Array) {
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  return {
    deviceId: 'd1',
    deviceToken: 't1',
    identityPriv: b64(phonePriv),
    desktopIdentityPub: b64(desktopPub),
    _phonePriv: phonePriv, _phonePub: phonePub,
  };
}

describe('LanWsTransport (v2)', () => {
  beforeEach(() => { lastSocket = null; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('sends plain auth on open, emits connected when encrypted authed arrives', () => {
    const { desktopPriv, desktopPub } = makeDesktopSide();
    const device = makePhoneDevice(desktopPub);
    // Desktop-side session keys for encrypting simulated server frames
    const desktopKeys = deriveSessionKeys(desktopPriv, device._phonePub, 'responder');
    const serverSend = new SendStream(desktopKeys.sendKey);

    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    const statuses: any[] = [];
    t.on('status', (s) => statuses.push(s));
    t.connect();

    lastSocket!.simulateOpen();

    // Transport should have sent a plain-text JSON `auth` frame
    const firstSent = lastSocket!.sent[0];
    expect(typeof firstSent).toBe('string');
    expect(firstSent as string).toContain('"type":"auth"');
    expect(firstSent as string).toContain('"v":2');

    // Server sends encrypted `authed`
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionId: 's', desktopName: 'test-desktop', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    const encryptedAuthed = serverSend.encrypt(new TextEncoder().encode(encodeV2(authed)));
    lastSocket!.simulateBinaryMessage(encryptedAuthed);

    const connected = statuses.find((s) => s.state === 'connected');
    expect(connected).toBeTruthy();
    expect(connected.desktopName).toBe('test-desktop');
  });

  it('emits disconnected on socket close and reconnects after backoff', () => {
    const { desktopPub } = makeDesktopSide();
    const device = makePhoneDevice(desktopPub);
    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    t.connect();
    lastSocket!.simulateOpen();
    const firstSocket = lastSocket;
    firstSocket!.close();
    jest.advanceTimersByTime(1100);
    expect(lastSocket).not.toBe(firstSocket);
  });

  it('handles plain-text authFailed and does not reconnect on unknownDevice', () => {
    const { desktopPub } = makeDesktopSide();
    const device = makePhoneDevice(desktopPub);
    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    const statuses: any[] = [];
    t.on('status', (s) => statuses.push(s));
    t.connect();
    lastSocket!.simulateOpen();
    lastSocket!.simulateStringMessage(JSON.stringify({ type: 'authFailed', v: 2, reason: 'unknownDevice' }));
    expect(statuses.some((s) => s.state === 'disconnected' && s.reason === 'unknownDevice')).toBe(true);
  });

  it('forwards encrypted event messages via the message event', () => {
    const { desktopPriv, desktopPub } = makeDesktopSide();
    const device = makePhoneDevice(desktopPub);
    const desktopKeys = deriveSessionKeys(desktopPriv, device._phonePub, 'responder');
    const serverSend = new SendStream(desktopKeys.sendKey);

    const t = new LanWsTransport({ host: '127.0.0.1', port: 8765, device });
    const received: MobileMessageV2[] = [];
    t.on('message', (m) => received.push(m as MobileMessageV2));
    t.connect();
    lastSocket!.simulateOpen();

    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionId: 's', desktopName: 'x', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    lastSocket!.simulateBinaryMessage(serverSend.encrypt(new TextEncoder().encode(encodeV2(authed))));

    const evt: MobileMessageV2 = {
      type: 'event', v: 2,
      event: { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 },
    };
    lastSocket!.simulateBinaryMessage(serverSend.encrypt(new TextEncoder().encode(encodeV2(evt))));

    const events = received.filter((m) => m.type === 'event');
    expect(events).toHaveLength(1);
  });
});
