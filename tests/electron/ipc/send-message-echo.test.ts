import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

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
    __ipcHandlers: ipcHandlers,
  };
});

describe('SEND_MESSAGE IPC handler — desktop echo to mobile', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('forwards desktop-typed user text to mobileBridge.onChat with source=desktop', async () => {
    const { initPhaseHandlers } = await import('../../../electron/ipc/phase-handlers');
    const state = await import('../../../electron/ipc/state');
    const { IPC_CHANNELS } = await import('../../../shared/types');

    const onChatSpy = vi.fn();
    state.setMobileBridge({
      onChat: onChatSpy,
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
      onAgentWaiting: () => {},
      onArchivedRuns: () => {},
      onCharStates: () => {},
      onChange: () => () => {},
      onPhoneChat: () => () => {},
      onSessionScopeChanged: () => {},
      __getSnapshotForTests: () => ({} as any),
    } as any);

    initPhaseHandlers();

    const electron = await import('electron');
    const handler = (electron as any).__ipcHandlers.get(IPC_CHANNELS.SEND_MESSAGE);
    expect(handler).toBeTruthy();
    await handler({}, 'hello from desktop');

    expect(onChatSpy).toHaveBeenCalledTimes(1);
    const [args] = onChatSpy.mock.calls[0];
    expect(args).toHaveLength(1);
    expect(args[0]).toMatchObject({
      role: 'user',
      text: 'hello from desktop',
      source: 'desktop',
    });
    expect(typeof args[0].id).toBe('string');
    expect(typeof args[0].timestamp).toBe('number');

    state.setMobileBridge(null);
  });

  it('is a no-op when mobileBridge is null', async () => {
    const { initPhaseHandlers } = await import('../../../electron/ipc/phase-handlers');
    const state = await import('../../../electron/ipc/state');
    const { IPC_CHANNELS } = await import('../../../shared/types');

    state.setMobileBridge(null);
    initPhaseHandlers();

    const electron = await import('electron');
    const handler = (electron as any).__ipcHandlers.get(IPC_CHANNELS.SEND_MESSAGE);
    await expect(handler({}, 'hi')).resolves.toBeUndefined();
  });
});
