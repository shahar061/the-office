import React from 'react';
import { render, act, screen } from '@testing-library/react-native';
import { useConnectionStore } from '../state/connection.store';
import { useSessionStore } from '../types/shared';

// ── Module mocks ─────────────────────────────────────────────────────────────

// Prevent real sockets from being created.
jest.mock('../transport/create', () => ({ createTransportForDevice: jest.fn() }));
jest.mock('../pairing/secure-store', () => ({
  saveDevice: jest.fn().mockResolvedValue(undefined),
}));

// Stub orientation — avoids expo-screen-orientation native-module dependency.
jest.mock('../session/orientation', () => ({
  lockOrientation: jest.fn().mockResolvedValue(undefined),
  resetOrientation: jest.fn().mockResolvedValue(undefined),
}));

// IdleScreen stub — renders the desktopName so we can assert on it.
// Note: jest.mock factories cannot reference any out-of-scope variables
// (not even React or JSX helpers), so every dependency must be require()d
// inside the factory, and elements must be created with createElement.
jest.mock('../session/IdleScreen', () => ({
  IdleScreen: ({ desktopName }: { desktopName: string }) => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, { testID: 'idle-screen' }, desktopName);
  },
}));

// WebViewHost stub — avoids react-native-webview + expo-asset native deps.
jest.mock('../webview-host/WebViewHost', () => ({
  WebViewHost: () => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, { testID: 'webview-host' }, 'webview');
  },
}));

// Portrait / Landscape layout stubs.
jest.mock('../session/PortraitLayout', () => ({
  PortraitOverlays: () => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, { testID: 'portrait-overlays' }, 'overlays');
  },
  PortraitComposer: (() => {
    const { forwardRef, createElement } = require('react');
    const { Text } = require('react-native');
    return forwardRef(() => createElement(Text, { testID: 'portrait-composer' }, 'composer'));
  })(),
}));
jest.mock('../session/LandscapeLayout', () => ({
  LandscapeLayout: () => {
    const { createElement } = require('react');
    const { Text } = require('react-native');
    return createElement(Text, { testID: 'landscape-layout' }, 'landscape');
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { createTransportForDevice } from '../transport/create';
import { SessionScreen } from '../session/SessionScreen';

// ── Helpers ───────────────────────────────────────────────────────────────────

type StatusHandler = (s: any) => void;
type MessageHandler = (m: any) => void;

function makeFakeTransport() {
  let statusHandlers: StatusHandler[] = [];
  let messageHandlers: MessageHandler[] = [];
  const fake: any = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    on(event: 'status' | 'message', handler: StatusHandler | MessageHandler) {
      if (event === 'status') {
        statusHandlers.push(handler as StatusHandler);
        return () => { statusHandlers = statusHandlers.filter((h) => h !== handler); };
      }
      messageHandlers.push(handler as MessageHandler);
      return () => { messageHandlers = messageHandlers.filter((h) => h !== handler); };
    },
    emitStatus(s: any) { for (const h of statusHandlers) h(s); },
    emitMessage(m: any) { for (const h of messageHandlers) h(m); },
  };
  return fake;
}

const device = {
  deviceId: 'd1', deviceToken: 't', identityPriv: 'p', identityPub: 'ip',
  desktopIdentityPub: 'dp', desktopName: 'TestDesktop',
  host: '', port: 0, remoteAllowed: true, relayToken: 'rt', sid: 'sid',
};

const baseSnapshot = {
  sessionId: '/tmp/proj',
  desktopName: 'TestDesktop',
  projectName: 'proj',
  phase: 'idle' as const,
  startedAt: 1,
  activeAgentId: null,
  characters: [],
  chatTail: [],
  sessionEnded: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionScreen — branch on sessionActive', () => {
  let fakeTransport: ReturnType<typeof makeFakeTransport>;

  beforeEach(() => {
    fakeTransport = makeFakeTransport();
    (createTransportForDevice as jest.Mock).mockReturnValue(fakeTransport);
    useConnectionStore.setState({ status: { state: 'connected', desktopName: 'TestDesktop' } });
    useSessionStore.setState({ snapshot: null, pendingEvents: [] });
  });

  it('renders IdleScreen before any snapshot arrives (sessionActive defaults to false)', () => {
    render(<SessionScreen device={device} onPairingLost={jest.fn()} />);
    expect(screen.getByTestId('idle-screen')).toBeTruthy();
    expect(screen.queryByTestId('webview-host')).toBeNull();
  });

  it('shows the desktop name in IdleScreen', () => {
    render(<SessionScreen device={device} onPairingLost={jest.fn()} />);
    expect(screen.getByTestId('idle-screen').props.children).toBe('TestDesktop');
  });

  it('switches to WebViewHost when sessionActive becomes true', () => {
    render(<SessionScreen device={device} onPairingLost={jest.fn()} />);
    expect(screen.getByTestId('idle-screen')).toBeTruthy();

    act(() => {
      fakeTransport.emitMessage({
        type: 'snapshot',
        v: 2,
        snapshot: { ...baseSnapshot, sessionActive: true },
      });
    });

    expect(screen.getByTestId('webview-host')).toBeTruthy();
    expect(screen.queryByTestId('idle-screen')).toBeNull();
  });

  it('returns to IdleScreen when sessionActive flips back to false', () => {
    render(<SessionScreen device={device} onPairingLost={jest.fn()} />);

    // First, go active.
    act(() => {
      fakeTransport.emitMessage({
        type: 'snapshot',
        v: 2,
        snapshot: { ...baseSnapshot, sessionActive: true },
      });
    });
    expect(screen.getByTestId('webview-host')).toBeTruthy();

    // Now go idle.
    act(() => {
      fakeTransport.emitMessage({
        type: 'snapshot',
        v: 2,
        snapshot: {
          ...baseSnapshot,
          sessionActive: false,
          sessionId: null,
          projectName: undefined,
        },
      });
    });

    expect(screen.getByTestId('idle-screen')).toBeTruthy();
    expect(screen.queryByTestId('webview-host')).toBeNull();
  });
});
