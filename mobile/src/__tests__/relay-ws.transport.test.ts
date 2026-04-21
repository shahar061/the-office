import { RelayWsTransport } from '../transport/relay-ws.transport';
import { x25519 } from '@noble/curves/ed25519';
import { deriveSessionKeys } from '@shared/crypto/noise';
import { aeadEncrypt } from '@shared/crypto/aead';
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
  // Desktop-side session keys. Keyed to match what phone's recv expects:
  // desktop is the 'responder' in deriveSessionKeys.
  const desktopKeys = deriveSessionKeys(desktopPriv, phonePub, 'responder');
  return { device, desktopKeys };
}

function encAead(sendKey: Uint8Array, sid: string, seq: number, msg: MobileMessageV2): string {
  const plain = new TextEncoder().encode(encodeV2(msg));
  const { nonce, ct } = aeadEncrypt(sendKey, plain);
  return JSON.stringify({
    v: 2, sid, seq, kind: 'data',
    nonce: b64(nonce), ct: b64(ct),
  });
}

describe('RelayWsTransport — seq=0 peer-reconnect reset', () => {
  beforeEach(() => { lastSocket = null; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('does not reset on initial seq=0 (fresh transport)', async () => {
    const { device, desktopKeys } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    // First frame at seq=0 should decrypt under the constructor-initialized
    // keys without any reset dance (lastRecvSeq is still -1 at this point).
    const authed: MobileMessageV2 = {
      type: 'authed', v: 2,
      snapshot: {
        sessionActive: true,
        sessionId: 'p', desktopName: 'D', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, 0, authed));
    expect(messages.map((m) => m.type)).toContain('snapshot');
    expect(lastSocket!.readyState).toBe(1);
  });
});

describe('RelayWsTransport — stateless AEAD', () => {
  beforeEach(() => { lastSocket = null; jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  function encAead(sendKey: Uint8Array, sid: string, seq: number, msg: MobileMessageV2): string {
    const plain = new TextEncoder().encode(encodeV2(msg));
    const { nonce, ct } = aeadEncrypt(sendKey, plain);
    return JSON.stringify({
      v: 2, sid, seq, kind: 'data',
      nonce: b64(nonce), ct: b64(ct),
    });
  }

  const authedSnapshot = {
    sessionActive: true, sessionId: 'p', desktopName: 'D', phase: 'idle',
    startedAt: 1, activeAgents: [], chatTail: [], events: [],
  } as any;

  it('decodes an envelope that carries its own random nonce', async () => {
    const { device, desktopKeys } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    const authed: MobileMessageV2 = { type: 'authed', v: 2, snapshot: authedSnapshot };
    lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, 0, authed));

    expect(messages.map((m) => m.type)).toContain('snapshot');
  });

  it('survives asymmetric reconnect — desktop keeps its high seq while phone resets (production bug regression, mirror)', async () => {
    const { device, desktopKeys } = makeSetup();
    const t = new RelayWsTransport({ device, token: 'fake-token' });
    const messages: MobileMessageV2[] = [];
    t.on('message', (m) => messages.push(m));
    t.connect();
    lastSocket!.simulateOpen();

    const authed: MobileMessageV2 = { type: 'authed', v: 2, snapshot: authedSnapshot };
    lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, 0, authed));

    for (let seq = 1; seq <= 20; seq++) {
      const state: MobileMessageV2 = {
        type: 'state', v: 2, state: { typing: false } as any,
      };
      lastSocket!.simulateStringMessage(encAead(desktopKeys.sendKey, device.sid, seq, state));
    }

    const stateMsgs = messages.filter((m) => m.type === 'state');
    expect(stateMsgs).toHaveLength(20);
  });
});
