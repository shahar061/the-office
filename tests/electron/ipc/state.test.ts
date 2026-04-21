import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Electron must be mocked before state.ts is imported, because state.ts
//    calls app.getPath('userData') at module-evaluation time.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/state-test-data' },
  BrowserWindow: class {},
}));

import { setCurrentProjectDir, setMobileBridge } from '../../../electron/ipc/state';
import type { MobileBridge } from '../../../electron/mobile-bridge';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal MobileBridge stub. Only `onSessionScopeChanged` is a real
 * spy; all other required methods are no-op stubs to satisfy the TypeScript
 * interface without needing a real bridge instance.
 */
function makeStubBridge(): MobileBridge & { onSessionScopeChanged: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getPairingQR: vi.fn().mockResolvedValue({ qrPayload: '', expiresAt: 0 }),
    listDevices: vi.fn().mockResolvedValue([]),
    revokeDevice: vi.fn().mockResolvedValue(undefined),
    renameDevice: vi.fn().mockResolvedValue(undefined),
    setRemoteAccess: vi.fn().mockResolvedValue(undefined),
    pauseRelay: vi.fn(),
    isRelayPaused: vi.fn().mockReturnValue(false),
    setLanHost: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({
      running: false, port: null, connectedDevices: 0, pendingSas: null,
      v1DeviceCount: 0, relay: 'disabled', relayPausedUntil: null, lanHost: null, devices: [],
    }),
    onAgentEvent: vi.fn(),
    onChat: vi.fn(),
    onStatePatch: vi.fn(),
    onAgentWaiting: vi.fn(),
    onArchivedRuns: vi.fn(),
    onCharStates: vi.fn(),
    onChange: vi.fn().mockReturnValue(() => {}),
    onPhoneChat: vi.fn().mockReturnValue(() => {}),
    onSessionScopeChanged: vi.fn(),
    __getSnapshotForTests: vi.fn().mockReturnValue({}),
  } as unknown as MobileBridge & { onSessionScopeChanged: ReturnType<typeof vi.fn> };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('setCurrentProjectDir → bridge.onSessionScopeChanged', () => {
  let stub: ReturnType<typeof makeStubBridge>;

  beforeEach(() => {
    stub = makeStubBridge();
    setMobileBridge(stub);
  });

  afterEach(() => {
    setMobileBridge(null);
    vi.clearAllMocks();
  });

  it('calls onSessionScopeChanged with active:true when given a path', () => {
    setCurrentProjectDir('/tmp/p');

    expect(stub.onSessionScopeChanged).toHaveBeenCalledOnce();
    const call = stub.onSessionScopeChanged.mock.calls[0][0];
    expect(call.active).toBe(true);
    expect(call.sessionId).toBe('/tmp/p');
    expect(call.projectRoot).toBe('/tmp/p');

    // The .the-office/config.json won't exist for /tmp/p, so the try/catch in
    // setCurrentProjectDir falls back to path.basename('/tmp/p') → 'p'.
    expect(call.projectName).toBe('p');
  });

  it('calls onSessionScopeChanged with active:false when given null', () => {
    setCurrentProjectDir(null);

    expect(stub.onSessionScopeChanged).toHaveBeenCalledOnce();
    const call = stub.onSessionScopeChanged.mock.calls[0][0];
    expect(call.active).toBe(false);
  });

  it('does NOT call onSessionScopeChanged when no bridge is installed', () => {
    setMobileBridge(null);
    // Should not throw, and obviously no call to make.
    expect(() => setCurrentProjectDir('/tmp/p')).not.toThrow();
    // stub was detached above, so it should not have been called
    expect(stub.onSessionScopeChanged).not.toHaveBeenCalled();
  });
});
