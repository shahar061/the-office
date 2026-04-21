import { RelayWsTransport } from '../transport/relay-ws.transport';
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
  public onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  constructor(public url: string, public protocol?: string) {}
  send(data: string | Uint8Array) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  simulateOpen() { this.readyState = 1; this.onopen?.({}); }
  simulateStringMessage(s: string) { this.onmessage?.({ data: s }); }
}

let lastSocket: FakeWebSocket | null = null;
(globalThis as any).WebSocket = class extends FakeWebSocket {
  constructor(url: string, protocol?: string) { super(url, protocol); lastSocket = this; }
};

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64');
}

function makeSetup() {
  const desktopPriv = x25519.utils.randomPrivateKey();
  const desktopPub = x25519.getPublicKey(desktopPriv);
  const phonePriv = x25519.utils.randomPrivateKey();
  const phonePub = x25519.getPublicKey(phonePriv);
  const device = {
    deviceId: 'd1', deviceToken: 't1',
    identityPriv: b64(phonePriv),
    desktopIdentityPub: b64(desktopPub),
    sid: 'SID',
  };
  // Desktop-side SendStream (keyed to match what phone's recv expects).
  function freshDesktopSend() {
    const keys = deriveSessionKeys(desktopPriv, phonePub, 'responder');
    return new SendStream(keys.sendKey);
  }
  return { device, freshDesktopSend };
}

function encFrame(sendStream: SendStream, sid: string, seq: number, msg: MobileMessageV2): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const ct = sendStream.encrypt(plain);
  return JSON.stringify({ v: 2, sid, seq, kind: 'data', ct: b64(ct) });
}

describe('RelayWsTransport — seq=0 peer-reconnect reset', () => {
  beforeEach(() => { lastSocket = null; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('resets crypto streams when an incoming envelope has seq=0 after an active session', async () => {
    const { device, freshDesktopSend } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    // Desktop-side fresh SendStream for the first session.
    let desktopSend = freshDesktopSend();

    // Send the initial `authed` frame so the transport finishes its auth
    // handshake and is in the 'connected' state. The snapshot shape uses the
    // post-per-session-pairing SessionSnapshot contract.
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionActive: true,
        sessionId: 'p',
        desktopName: 'D',
        phase: 'idle',
        startedAt: 1,
        activeAgentId: null,
        characters: [],
        chatTail: [],
        sessionEnded: false,
      },
    };
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, authed));

    // Drive lastRecvSeq forward with a normal frame
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 1, { type: 'heartbeat', v: 2 }));
    expect(messages.map((m) => m.type)).toContain('snapshot');

    // Simulate desktop reconnecting: fresh SendStream, new frame at seq=0.
    desktopSend = freshDesktopSend();
    const afterReconnect: MobileMessageV2 = { type: 'heartbeat', v: 2 };
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, afterReconnect));

    // The transport should have reset its recv stream, evidenced by lastRecvSeq
    // being set to 0 (the seq from the reset frame). Without the reset branch,
    // the seq=0 frame is dropped by the dedup guard (0 ≤ lastRecvSeq=1).
    expect((t as any).lastRecvSeq).toBe(0);
    expect(lastSocket!.readyState).toBe(1);

    // Send a follow-up frame at seq=1 to prove post-reset state is consistent.
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 1, { type: 'heartbeat', v: 2 }));
    expect((t as any).lastRecvSeq).toBe(1);
  });

  it('does not reset on initial seq=0 (fresh transport)', async () => {
    const { device, freshDesktopSend } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    // First frame at seq=0 should decrypt under the constructor-initialized
    // streams without triggering a reset (lastRecvSeq is still -1 at this
    // point).
    const desktopSend = freshDesktopSend();
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionActive: true,
        sessionId: 'p', desktopName: 'D', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    lastSocket!.simulateStringMessage(encFrame(desktopSend, device.sid, 0, authed));
    expect(messages.map((m) => m.type)).toContain('snapshot');
    expect(lastSocket!.readyState).toBe(1);
  });
});
