import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => {
  const ipcHandlers = new Map<string, (...args: any[]) => any>();
  return {
    ipcMain: {
      handle(channel: string, fn: (...args: any[]) => any) {
        ipcHandlers.set(channel, fn);
      },
      on() {},
      removeHandler() {},
      removeListener() {},
    },
    BrowserWindow: { getAllWindows: () => [] },
    app: { getPath: () => '/tmp' },
    dialog: {},
    shell: { openExternal: async () => {}, openPath: async () => '' },
    clipboard: { writeText: () => {} },
    __ipcHandlers: ipcHandlers,
  };
});

function makeMobileBridgeStub(spies: {
  onChat: ReturnType<typeof vi.fn>;
  onAgentWaiting: ReturnType<typeof vi.fn>;
}): any {
  return {
    onChat: spies.onChat,
    onAgentWaiting: spies.onAgentWaiting,
    start: async () => {},
    stop: async () => {},
    getPairingQR: async () => ({ qrPayload: '', expiresAt: 0 }),
    listDevices: async () => [],
    revokeDevice: async () => {},
    renameDevice: async () => {},
    setRemoteAccess: async () => {},
    pauseRelay: () => {},
    isRelayPaused: () => false,
    setLanHost: async () => {},
    getStatus: () => ({
      running: false, port: null, connectedDevices: 0, pendingSas: null,
      v1DeviceCount: 0, relay: 'disabled', relayPausedUntil: null, lanHost: null, devices: [],
    }),
    onAgentEvent: () => {},
    onStatePatch: () => {},
    onArchivedRuns: () => {},
    onCharStates: () => {},
    onChange: () => () => {},
    onPhoneChat: () => () => {},
    onSessionScopeChanged: () => {},
    __getSnapshotForTests: () => ({} as any),
  };
}

describe('USER_RESPONSE IPC handler — Q&A echo to mobile', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('broadcasts both question and answer to mobileBridge.onChat and clears waiting', async () => {
    const { initPhaseHandlers } = await import('../../../electron/ipc/phase-handlers');
    const state = await import('../../../electron/ipc/state');
    const { IPC_CHANNELS } = await import('../../../shared/types');

    const onChatSpy = vi.fn();
    const onAgentWaitingSpy = vi.fn();
    state.setMobileBridge(makeMobileBridgeStub({ onChat: onChatSpy, onAgentWaiting: onAgentWaitingSpy }));

    // Seed chat context so the existing persist-branch is taken (matches live runtime)
    state.setCurrentChatPhase('imagine');
    state.setCurrentChatAgentRole('ceo');
    state.setCurrentChatRunNumber(1);

    // Register a pending question to be resolved by USER_RESPONSE
    const resolve = vi.fn();
    const reject = vi.fn();
    state.pendingQuestions.set('session-test', {
      resolve,
      reject,
      questions: [{ id: 'q1', question: 'Pick an option', options: ['A', 'B'] } as any],
    });

    initPhaseHandlers();

    const electron = await import('electron');
    const handler = (electron as any).__ipcHandlers.get(IPC_CHANNELS.USER_RESPONSE);
    expect(handler).toBeTruthy();

    const answers = { 'Pick an option': 'A' };
    await handler({}, 'session-test', answers);

    // Existing behavior still fires
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(answers);
    expect(onAgentWaitingSpy).toHaveBeenCalledWith(null);
    expect(state.pendingQuestions.has('session-test')).toBe(false);

    // New behavior: Q&A echoed to mobile chat tail
    expect(onChatSpy).toHaveBeenCalledTimes(1);
    const [msgs] = onChatSpy.mock.calls[0];
    expect(Array.isArray(msgs)).toBe(true);
    expect(msgs).toHaveLength(2);

    expect(msgs[0]).toMatchObject({
      role: 'agent',
      text: 'Pick an option',
      agentRole: 'ceo',
    });
    expect(typeof msgs[0].id).toBe('string');
    expect(typeof msgs[0].timestamp).toBe('number');

    expect(msgs[1]).toMatchObject({
      role: 'user',
      text: 'A',
      source: 'desktop',
    });
    expect(typeof msgs[1].id).toBe('string');
    expect(typeof msgs[1].timestamp).toBe('number');

    state.setMobileBridge(null);
  });

  it('skips the echo block entirely when mobileBridge is null (no phone paired)', async () => {
    const { initPhaseHandlers } = await import('../../../electron/ipc/phase-handlers');
    const state = await import('../../../electron/ipc/state');
    const { IPC_CHANNELS } = await import('../../../shared/types');

    state.setMobileBridge(null);
    state.setCurrentChatPhase('imagine');
    state.setCurrentChatAgentRole('ceo');
    state.setCurrentChatRunNumber(1);

    const resolve = vi.fn();
    const reject = vi.fn();
    state.pendingQuestions.set('session-lan', {
      resolve,
      reject,
      questions: [{ id: 'q1', question: 'Pick', options: ['X'] } as any],
    });

    initPhaseHandlers();

    const electron = await import('electron');
    const handler = (electron as any).__ipcHandlers.get(IPC_CHANNELS.USER_RESPONSE);
    await expect(handler({}, 'session-lan', { Pick: 'X' })).resolves.toBeUndefined();

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(state.pendingQuestions.has('session-lan')).toBe(false);
  });
});
