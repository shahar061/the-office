import { renderHook, act } from '@testing-library/react-native';
import type { Transport, TransportStatus } from '../transport/transport.interface';
import type { MobileMessageV2 } from '../types/shared';
import { useConnectionStore } from '../state/connection.store';
import { useSessionStore } from '../types/shared';

// Mock the module seam so useSession doesn't build real sockets.
jest.mock('../transport/create', () => ({ createTransportForDevice: jest.fn() }));
jest.mock('../state/cache', () => ({
  loadLastKnown: jest.fn().mockResolvedValue(null),
  saveLastKnown: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../pairing/secure-store', () => ({
  saveDevice: jest.fn().mockResolvedValue(undefined),
}));

import { createTransportForDevice } from '../transport/create';
import { saveDevice } from '../pairing/secure-store';
import { saveLastKnown } from '../state/cache';
import { useSession } from '../session/useSession';

type StatusHandler = (s: TransportStatus) => void;
type MessageHandler = (m: MobileMessageV2) => void;

function makeFakeTransport() {
  let statusHandlers: StatusHandler[] = [];
  let messageHandlers: MessageHandler[] = [];
  const fake: any = {
    connectCalls: 0,
    disconnectCalls: 0,
    sent: [] as MobileMessageV2[],
    connect: jest.fn(() => { fake.connectCalls++; }),
    disconnect: jest.fn(() => { fake.disconnectCalls++; }),
    send: jest.fn((m: MobileMessageV2) => { fake.sent.push(m); }),
    on(event: 'status' | 'message', handler: StatusHandler | MessageHandler) {
      if (event === 'status') { statusHandlers.push(handler as StatusHandler); return () => { statusHandlers = statusHandlers.filter((h) => h !== handler); }; }
      messageHandlers.push(handler as MessageHandler); return () => { messageHandlers = messageHandlers.filter((h) => h !== handler); };
    },
    emitStatus(s: TransportStatus) { for (const h of statusHandlers) h(s); },
    emitMessage(m: MobileMessageV2) { for (const h of messageHandlers) h(m); },
  };
  return fake as Transport & { emitStatus: (s: TransportStatus) => void; emitMessage: (m: MobileMessageV2) => void; connectCalls: number; disconnectCalls: number; sent: MobileMessageV2[] };
}

const device = {
  deviceId: 'd1', deviceToken: 't', identityPriv: 'p', desktopIdentityPub: 'dp',
  host: '', port: 0, remoteAllowed: true, relayToken: 'rt', sid: 'sid',
};

describe('useSession', () => {
  beforeEach(() => {
    useConnectionStore.setState({ status: { state: 'idle' } });
    useSessionStore.setState({ snapshot: null, pendingEvents: [] });
    (createTransportForDevice as jest.Mock).mockReset();
    (saveDevice as jest.Mock).mockReset();
    (saveLastKnown as jest.Mock).mockReset();
  });

  it('builds transport and connects on mount, disconnects on unmount', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { unmount } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    expect(fake.connectCalls).toBe(1);
    unmount();
    expect(fake.disconnectCalls).toBe(1);
  });

  it('routes snapshot messages to the store and cache', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    const snapshot = { sessionId: 's', desktopName: 'X', phase: 'imagine', startedAt: 1, activeAgentId: null, characters: [], chatTail: [], sessionEnded: false } as any;
    act(() => fake.emitMessage({ type: 'snapshot', v: 2, snapshot }));
    expect(useSessionStore.getState().snapshot).toEqual(snapshot);
    expect(saveLastKnown).toHaveBeenCalledWith(snapshot);
  });

  it('calls onPairingLost on disconnected status with unknownDevice/revoked', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const onPairingLost = jest.fn();
    renderHook(() => useSession({ device, onPairingLost }));
    act(() => fake.emitStatus({ state: 'disconnected', reason: 'revoked' }));
    expect(onPairingLost).toHaveBeenCalledTimes(1);
  });

  it('tokenRefresh persists a new device token', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => fake.emitMessage({ type: 'tokenRefresh', v: 2, token: 'rt2', expiresAt: Date.now() + 3600000 }));
    expect(saveDevice).toHaveBeenCalledWith(expect.objectContaining({ relayToken: 'rt2' }));
  });

  it('routes event messages to pendingEvents', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    const event = { agentId: 'a1', agentRole: 'ceo' as const, source: 'sdk' as const, type: 'agent:created' as const, timestamp: Date.now(), isTopLevel: true };
    act(() => fake.emitMessage({ type: 'event', v: 2, event }));
    expect(useSessionStore.getState().pendingEvents).toHaveLength(1);
    expect(useSessionStore.getState().pendingEvents[0]).toEqual(event);
  });

  it('chatFeed appends messages and re-saves the snapshot', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    const snapshot = { sessionId: 's', desktopName: 'X', phase: 'imagine', startedAt: 1, activeAgentId: null, characters: [], chatTail: [], sessionEnded: false } as any;
    act(() => fake.emitMessage({ type: 'snapshot', v: 2, snapshot }));
    (saveLastKnown as jest.Mock).mockClear();
    const messages = [{ id: 'm1', role: 'user' as const, text: 'hi', timestamp: Date.now() }];
    act(() => fake.emitMessage({ type: 'chatFeed', v: 2, messages }));
    expect(useSessionStore.getState().snapshot?.chatTail).toHaveLength(1);
    expect(saveLastKnown).toHaveBeenCalledTimes(1);
  });

  it('state patch updates the snapshot and re-saves it', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    const snapshot = { sessionId: 's', desktopName: 'X', phase: 'imagine', startedAt: 1, activeAgentId: null, characters: [], chatTail: [], sessionEnded: false } as any;
    act(() => fake.emitMessage({ type: 'snapshot', v: 2, snapshot }));
    (saveLastKnown as jest.Mock).mockClear();
    act(() => fake.emitMessage({ type: 'state', v: 2, patch: { kind: 'phase', phase: 'warroom' } }));
    expect(useSessionStore.getState().snapshot?.phase).toBe('warroom');
    expect(saveLastKnown).toHaveBeenCalledTimes(1);
  });

  it('submit resolves ok=true when a matching chatAck arrives', async () => {
    jest.useFakeTimers();
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => useConnectionStore.getState().setStatus({ state: 'connected', desktopName: 'x' }));
    act(() => result.current.setDraft('hello'));
    let ackPromise!: Promise<{ ok: boolean; error?: string }>;
    act(() => { ackPromise = result.current.submit(); });
    const sent = fake.sent.find((m: any) => m.type === 'chat') as any;
    expect(sent).toBeTruthy();
    act(() => fake.emitMessage({ type: 'chatAck', v: 2, clientMsgId: sent.clientMsgId, ok: true }));
    await expect(ackPromise).resolves.toEqual({ ok: true });
    jest.useRealTimers();
  });

  it('submit resolves ok=false when no ack arrives within 5s', async () => {
    jest.useFakeTimers();
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => useConnectionStore.getState().setStatus({ state: 'connected', desktopName: 'x' }));
    act(() => result.current.setDraft('hi'));
    let ackPromise!: Promise<{ ok: boolean; error?: string }>;
    act(() => { ackPromise = result.current.submit(); });
    act(() => { jest.advanceTimersByTime(5_001); });
    await expect(ackPromise).resolves.toEqual({ ok: false, error: expect.stringMatching(/timed out/i) });
    jest.useRealTimers();
  });

  it('routes charState to applyCharState', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    const cs = [{
      agentId: 'ceo', x: 10, y: 20,
      direction: 'down' as const, animation: 'idle' as const,
      visible: true, alpha: 1, toolBubble: null,
    }];
    act(() => fake.emitMessage({ type: 'charState', v: 2, ts: 1234, characters: cs }));
    expect(useSessionStore.getState().characterStates.get('ceo')?.x).toBe(10);
    expect(useSessionStore.getState().lastCharStateTs).toBe(1234);
  });

  it('sendChat resolves ok=true when a matching chatAck arrives', async () => {
    jest.useFakeTimers();
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => useConnectionStore.getState().setStatus({ state: 'connected', desktopName: 'x' }));
    let ackPromise!: Promise<{ ok: boolean; error?: string }>;
    act(() => { ackPromise = result.current.sendChat('Option A'); });
    const sent = fake.sent.find((m: any) => m.type === 'chat') as any;
    expect(sent?.body).toBe('Option A');
    act(() => fake.emitMessage({ type: 'chatAck', v: 2, clientMsgId: sent.clientMsgId, ok: true }));
    await expect(ackPromise).resolves.toEqual({ ok: true });
    jest.useRealTimers();
  });

  it('sendChat does NOT clear draft on success (only submit does)', async () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));
    act(() => useConnectionStore.getState().setStatus({ state: 'connected', desktopName: 'x' }));
    act(() => result.current.setDraft('something the user typed'));
    act(() => { void result.current.sendChat('Option A'); });
    expect(result.current.draft).toBe('something the user typed');
  });

  it('sessionActive defaults to false until a snapshot arrives, then reflects snapshot.sessionActive', () => {
    const fake = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fake);
    const { result } = renderHook(() => useSession({ device, onPairingLost: jest.fn() }));

    expect(result.current.sessionActive).toBe(false);

    act(() => {
      fake.emitMessage({
        type: 'snapshot', v: 2,
        snapshot: {
          sessionActive: true,
          sessionId: '/tmp/p',
          desktopName: 'D',
          projectName: 'p',
          phase: 'idle',
          startedAt: 1,
          activeAgentId: null,
          characters: [],
          chatTail: [],
          sessionEnded: false,
        },
      });
    });
    expect(result.current.sessionActive).toBe(true);

    act(() => {
      fake.emitMessage({
        type: 'snapshot', v: 2,
        snapshot: {
          sessionActive: false,
          sessionId: null,
          desktopName: 'D',
          phase: 'idle',
          startedAt: 2,
          activeAgentId: null,
          characters: [],
          chatTail: [],
          sessionEnded: false,
        },
      });
    });
    expect(result.current.sessionActive).toBe(false);
  });
});
