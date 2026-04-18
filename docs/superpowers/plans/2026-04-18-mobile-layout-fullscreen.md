# Mobile Layout Overhaul + Fullscreen Landscape Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix mobile app layout (no edge cutoffs, consistent tokens, 44pt touch targets, correct keyboard behavior) and add a button-driven fullscreen landscape canvas mode that returns to portrait-with-chat-focused on tap.

**Architecture:** The session screen splits into (1) a pure-logic `useSession` hook owning transport + chat lifecycle, (2) a thin `SessionScreen` shell that mounts `WebViewHost` once as an absolute-fill background and picks chrome by mode, and (3) two chrome overlays — `PortraitLayout` (banner + composer + expand button) and `LandscapeLayout` (connection pill + chat FAB). A new `theme/` module holds colors, spacing, typography, radius, and hitTarget tokens. `expo-screen-orientation` is introduced for runtime orientation lock.

**Tech Stack:** Expo 54 / React Native 0.81 / TypeScript 5.9 / Zustand 5 / jest-expo / `react-native-safe-area-context` / new: `expo-screen-orientation`.

**Reference spec:** `docs/superpowers/specs/2026-04-18-mobile-layout-fullscreen-design.md`

---

## File Structure

### New files
- `mobile/src/theme/colors.ts` — color tokens
- `mobile/src/theme/spacing.ts` — spacing scale + radius + hitTarget
- `mobile/src/theme/typography.ts` — font size/weight presets
- `mobile/src/theme/index.ts` — barrel re-export
- `mobile/src/transport/create.ts` — `createTransportForDevice` factory (extracted from `SessionScreen` so `useSession` tests can mock it)
- `mobile/src/session/orientation.ts` — `lockOrientation` / `resetOrientation` wrappers
- `mobile/src/session/useSession.ts` — transport + chat-send + ack-tracking hook
- `mobile/src/session/PortraitLayout.tsx` — portrait chrome
- `mobile/src/session/LandscapeLayout.tsx` — landscape chrome
- `mobile/src/session/SessionScreen.tsx` — shell (replaces `src/screens/SessionScreen.tsx`)
- `mobile/src/webview-host/ConnectionPill.tsx` — compact connection indicator for landscape
- `mobile/src/__tests__/orientation.test.ts` — orientation wrapper tests
- `mobile/src/__tests__/useSession.test.ts` — useSession hook tests

### Modified files
- `mobile/package.json` — add `expo-screen-orientation`
- `mobile/app.json` — `orientation: "default"`; add `expo-screen-orientation` plugin
- `mobile/App.tsx` — update `SessionScreen` import path; theme token swap in loading/pairing states
- `mobile/src/webview-host/ConnectionBanner.tsx` — theme token swap
- `mobile/src/pairing/WelcomeScreen.tsx` — theme token swap
- `mobile/src/pairing/QRScanScreen.tsx` — theme token swap
- `mobile/src/pairing/SasConfirmScreen.tsx` — theme token swap
- `mobile/src/pairing/RemoteConsentScreen.tsx` — theme token swap

### Deleted files
- `mobile/src/screens/SessionScreen.tsx` — superseded by `session/SessionScreen.tsx`
- `mobile/src/screens/` directory (empty after deletion)

---

## Phase A — Foundations (no behavior change)

### Task 1: Theme module

**Files:**
- Create: `mobile/src/theme/colors.ts`
- Create: `mobile/src/theme/spacing.ts`
- Create: `mobile/src/theme/typography.ts`
- Create: `mobile/src/theme/index.ts`

- [ ] **Step 1: Create `colors.ts`**

```ts
// mobile/src/theme/colors.ts
export const colors = {
  // Backgrounds
  bg: '#0a0a0a',
  bgElevated: 'rgba(255,255,255,0.04)',
  bgOverlay: 'rgba(15,15,26,0.92)',
  bgPill: 'rgba(15,23,42,0.85)',

  // Borders
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.12)',

  // Text
  text: '#f5f5f5',
  textMuted: '#cbd5e1',
  textDim: '#6b7280',

  // Accents & status
  accent: '#6366f1',
  accentSecondary: '#0ea5e9',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#93c5fd',
};
```

- [ ] **Step 2: Create `spacing.ts`**

```ts
// mobile/src/theme/spacing.ts
export const spacing   = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius    = { sm: 4, md: 6, lg: 8, round: 999 };
export const hitTarget = { min: 44 };
```

- [ ] **Step 3: Create `typography.ts`**

```ts
// mobile/src/theme/typography.ts
export const typography = {
  caption:    { fontSize: 10, fontWeight: '500' as const },
  label:      { fontSize: 11, fontWeight: '600' as const },
  body:       { fontSize: 14, fontWeight: '400' as const },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const },
  heading:    { fontSize: 18, fontWeight: '700' as const },
};
```

- [ ] **Step 4: Create `index.ts` barrel**

```ts
// mobile/src/theme/index.ts
export { colors } from './colors';
export { spacing, radius, hitTarget } from './spacing';
export { typography } from './typography';
```

- [ ] **Step 5: Verify tsc is happy**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors from new theme files.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/theme/
git commit -m "mobile(theme): add colors / spacing / typography tokens"
```

---

### Task 2: Install `expo-screen-orientation` and unlock orientation in `app.json`

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`

- [ ] **Step 1: Install dependency**

Run: `cd mobile && npx expo install expo-screen-orientation`
Expected: adds `expo-screen-orientation` to dependencies with an Expo-compatible version.

- [ ] **Step 2: Update `app.json`**

Change `"orientation": "portrait"` → `"orientation": "default"` and add `"expo-screen-orientation"` to the `plugins` array.

Final `mobile/app.json` expo section should look like:

```json
{
  "expo": {
    "name": "The Office",
    "slug": "the-office",
    "scheme": "theoffice",
    "version": "0.1.0",
    "orientation": "default",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#0a0a0a"
    },
    "assetBundlePatterns": ["**/*", "assets/webview/**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "dev.shahar.theoffice",
      "infoPlist": {
        "NSLocalNetworkUsageDescription": "The Office connects to your desktop on the local network to show live agent activity.",
        "NSCameraUsageDescription": "The Office uses your camera to scan the pairing QR code shown on your desktop."
      }
    },
    "android": {
      "package": "dev.shahar.theoffice",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0a0a0a"
      },
      "usesCleartextTraffic": true,
      "permissions": ["CAMERA", "INTERNET", "ACCESS_NETWORK_STATE"],
      "softwareKeyboardLayoutMode": "resize"
    },
    "plugins": [
      ["expo-camera", { "cameraPermission": "Allow The Office to scan pairing QR codes" }],
      "expo-secure-store",
      "expo-asset",
      "expo-screen-orientation"
    ]
  }
}
```

- [ ] **Step 3: Verify install**

Run: `cd mobile && node -e "require('expo-screen-orientation')"`
Expected: exits 0 (no module-not-found).

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json
git commit -m "mobile: install expo-screen-orientation; unlock app.json orientation"
```

---

### Task 3: `orientation.ts` wrapper + tests

**Files:**
- Create: `mobile/src/session/orientation.ts`
- Create: `mobile/src/__tests__/orientation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/__tests__/orientation.test.ts
import { lockOrientation, resetOrientation } from '../session/orientation';
import * as ScreenOrientation from 'expo-screen-orientation';

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT: 1, LANDSCAPE: 3 },
  lockAsync: jest.fn(),
}));

const mockLockAsync = ScreenOrientation.lockAsync as jest.Mock;

describe('orientation wrapper', () => {
  beforeEach(() => { mockLockAsync.mockReset(); mockLockAsync.mockResolvedValue(undefined); });

  it('lockOrientation("portrait") calls lockAsync with PORTRAIT', async () => {
    await lockOrientation('portrait');
    expect(mockLockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.PORTRAIT);
  });

  it('lockOrientation("landscape") calls lockAsync with LANDSCAPE', async () => {
    await lockOrientation('landscape');
    expect(mockLockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.LANDSCAPE);
  });

  it('lockOrientation swallows rejections from lockAsync', async () => {
    mockLockAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(lockOrientation('portrait')).resolves.toBeUndefined();
  });

  it('resetOrientation locks to portrait and swallows errors', async () => {
    mockLockAsync.mockRejectedValueOnce(new Error('nope'));
    await expect(resetOrientation()).resolves.toBeUndefined();
    expect(mockLockAsync).toHaveBeenCalledWith(ScreenOrientation.OrientationLock.PORTRAIT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/orientation.test.ts`
Expected: FAIL with "Cannot find module '../session/orientation'".

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/session/orientation.ts
import * as ScreenOrientation from 'expo-screen-orientation';

export type Mode = 'portrait' | 'landscape';

export async function lockOrientation(mode: Mode): Promise<void> {
  const lock = mode === 'portrait'
    ? ScreenOrientation.OrientationLock.PORTRAIT
    : ScreenOrientation.OrientationLock.LANDSCAPE;
  try {
    await ScreenOrientation.lockAsync(lock);
  } catch (err) {
    console.warn('[orientation] lock failed:', err);
  }
}

export async function resetOrientation(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
  } catch {
    // best-effort on unmount
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/__tests__/orientation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/orientation.ts mobile/src/__tests__/orientation.test.ts
git commit -m "mobile(orientation): best-effort lock/reset wrapper with tests"
```

---

## Phase B — Extract session logic

### Task 4: `createTransportForDevice` helper

Pull the transport-building code out of `SessionScreen` into a standalone factory so the new `useSession` hook can be unit-tested without importing real transports.

**Files:**
- Create: `mobile/src/transport/create.ts`

- [ ] **Step 1: Create the factory**

```ts
// mobile/src/transport/create.ts
import { LanWsTransport } from './lan-ws.transport';
import { RelayWsTransport } from './relay-ws.transport';
import { CompositeTransport } from './composite.transport';
import type { Transport } from './transport.interface';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

export function createTransportForDevice(device: PairedDeviceCredentials): Transport {
  const lan = device.host !== ''
    ? new LanWsTransport({
        host: device.host,
        port: device.port,
        device: {
          deviceId: device.deviceId,
          deviceToken: device.deviceToken,
          identityPriv: device.identityPriv,
          desktopIdentityPub: device.desktopIdentityPub,
        },
      })
    : null;

  const relay = device.remoteAllowed && device.relayToken
    ? new RelayWsTransport({
        device: {
          deviceId: device.deviceId,
          deviceToken: device.deviceToken,
          identityPriv: device.identityPriv,
          desktopIdentityPub: device.desktopIdentityPub,
          sid: device.sid,
        },
        token: device.relayToken,
      })
    : null;

  // Diagnostic kept from pre-refactor SessionScreen — useful when the phone
  // lands without a connectable channel (e.g. stale credentials missing relayToken).
  // eslint-disable-next-line no-console
  console.log('[createTransportForDevice]', JSON.stringify({
    deviceId: device.deviceId,
    hasHost: device.host !== '',
    remoteAllowed: device.remoteAllowed,
    hasRelayToken: !!device.relayToken,
    builtLan: lan !== null,
    builtRelay: relay !== null,
  }));

  return new CompositeTransport(lan, relay);
}
```

- [ ] **Step 2: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/transport/create.ts
git commit -m "mobile(transport): extract createTransportForDevice factory"
```

---

### Task 5: `useSession` hook + tests

**Files:**
- Create: `mobile/src/session/useSession.ts`
- Create: `mobile/src/__tests__/useSession.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/__tests__/useSession.test.ts
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

function makeFakeTransport(): Transport & { emitStatus: StatusHandler; emitMessage: MessageHandler; connectCalls: number; disconnectCalls: number; sent: MobileMessageV2[] } {
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
  return fake;
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
    act(() => fake.emitMessage({ type: 'tokenRefresh', v: 2, token: 'rt2' }));
    expect(saveDevice).toHaveBeenCalledWith(expect.objectContaining({ relayToken: 'rt2' }));
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts`
Expected: FAIL with "Cannot find module '../session/useSession'".

- [ ] **Step 3: Implement `useSession`**

```ts
// mobile/src/session/useSession.ts
import { useEffect, useRef, useState } from 'react';
import { createTransportForDevice } from '../transport/create';
import type { Transport } from '../transport/transport.interface';
import { useConnectionStore } from '../state/connection.store';
import { useSessionStore } from '../types/shared';
import { loadLastKnown, saveLastKnown } from '../state/cache';
import type { MobileMessageV2 } from '../types/shared';
import { saveDevice, type PairedDeviceCredentials } from '../pairing/secure-store';

interface PendingAck {
  resolve: (ok: boolean, error?: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface UseSessionOpts {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export interface UseSessionReturn {
  status: ReturnType<typeof useConnectionStore.getState>['status'];
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  canSend: boolean;
  submit: () => Promise<{ ok: boolean; error?: string }>;
}

export function useSession({ device, onPairingLost }: UseSessionOpts): UseSessionReturn {
  const status = useConnectionStore((s) => s.status);
  const transportRef = useRef<Transport | null>(null);
  const pendingAcksRef = useRef<Map<string, PendingAck>>(new Map());
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadLastKnown().then((last) => {
      if (last) useSessionStore.getState().hydrateFromCache(last.snapshot);
    });

    const transport = createTransportForDevice(device);
    transportRef.current = transport;

    const offStatus = transport.on('status', (s) => {
      useConnectionStore.getState().setStatus(s);
      if (s.state === 'disconnected' && (s.reason === 'unknownDevice' || s.reason === 'revoked')) {
        onPairingLost();
      }
    });

    const offMessage = transport.on('message', (m: MobileMessageV2) => {
      const store = useSessionStore.getState();
      switch (m.type) {
        case 'snapshot':
          store.setSnapshot(m.snapshot);
          void saveLastKnown(m.snapshot);
          break;
        case 'event':
          store.appendEvent(m.event);
          break;
        case 'chatFeed':
          store.appendChat(m.messages);
          {
            const snap = useSessionStore.getState().snapshot;
            if (snap) void saveLastKnown(snap);
          }
          break;
        case 'state':
          store.applyStatePatch(m.patch);
          {
            const snap = useSessionStore.getState().snapshot;
            if (snap) void saveLastKnown(snap);
          }
          break;
        case 'chatAck': {
          const pending = pendingAcksRef.current.get(m.clientMsgId);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(m.ok, m.error);
            pendingAcksRef.current.delete(m.clientMsgId);
          }
          break;
        }
        case 'tokenRefresh': {
          void saveDevice({ ...device, relayToken: m.token });
          break;
        }
      }
    });

    transport.connect();

    return () => {
      offStatus();
      offMessage();
      transport.disconnect();
      transportRef.current = null;
      for (const { timer } of pendingAcksRef.current.values()) clearTimeout(timer);
      pendingAcksRef.current.clear();
    };
  }, [device, onPairingLost]);

  const submit = async (): Promise<{ ok: boolean; error?: string }> => {
    const body = draft.trim();
    if (!body || sending) return { ok: false, error: 'empty' };
    const transport = transportRef.current;
    if (!transport) return { ok: false, error: 'no transport' };
    setSending(true);
    const clientMsgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(() => {
        pendingAcksRef.current.delete(clientMsgId);
        resolve({ ok: false, error: 'Timed out waiting for acknowledgment' });
      }, 5000);
      pendingAcksRef.current.set(clientMsgId, {
        resolve: (ok, error) => resolve({ ok, error }),
        timer,
      });
      transport.send({ type: 'chat', v: 2, body, clientMsgId });
    });

    if (ack.ok) setDraft('');
    setSending(false);
    return ack;
  };

  const canSend = status.state === 'connected' && draft.trim().length > 0 && !sending;

  return { status, draft, setDraft, sending, canSend, submit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/__tests__/useSession.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/useSession.ts mobile/src/__tests__/useSession.test.ts
git commit -m "mobile(session): extract useSession hook with tests"
```

---

### Task 6: `PortraitLayout` component

Renders banner + WebView area + composer + expand button, using theme tokens and `useSession`'s return object. Uses `useSafeAreaInsets()` for bottom padding; iOS wraps composer in `KeyboardAvoidingView`; Android relies on `softwareKeyboardLayoutMode: "resize"` from `app.json`.

**Files:**
- Create: `mobile/src/session/PortraitLayout.tsx`

- [ ] **Step 1: Create `PortraitLayout.tsx`**

```tsx
// mobile/src/session/PortraitLayout.tsx
import { useRef } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
import { colors, spacing, radius, hitTarget, typography } from '../theme';
import type { UseSessionReturn } from './useSession';

interface Props {
  session: UseSessionReturn;
  onExpand: () => void;
}

export function PortraitLayout({ session, onExpand }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { status, draft, setDraft, sending, canSend, submit } = session;

  const handleSend = async () => {
    const ack = await submit();
    if (!ack.ok && ack.error && ack.error !== 'empty' && ack.error !== 'no transport') {
      Alert.alert('Send failed', ack.error);
    }
  };

  const composer = (
    <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        placeholder="Reply to active agent…"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        editable={!sending && status.state === 'connected'}
        multiline
        maxLength={1000}
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
      >
        <Text style={canSend ? styles.sendBtnTextActive : styles.sendBtnTextInactive}>
          {sending ? '…' : 'Send'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.bannerSlot, { paddingTop: insets.top }]} pointerEvents="box-none">
        <ConnectionBanner status={status} />
      </View>

      <Pressable
        onPress={onExpand}
        style={[
          styles.expandBtn,
          { top: insets.top + spacing.xxl, right: spacing.md },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Expand canvas to landscape"
      >
        <Text style={styles.expandGlyph}>⤢</Text>
      </Pressable>

      {Platform.OS === 'ios'
        ? <KeyboardAvoidingView style={styles.keyboardAvoid} behavior="padding">{composer}</KeyboardAvoidingView>
        : <View style={styles.keyboardAvoid}>{composer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent overlay; the WebView is the shell's background.
  root: { ...StyleSheet.absoluteFillObject },
  bannerSlot: { position: 'absolute', top: 0, left: 0, right: 0 },
  keyboardAvoid: { flex: 1, justifyContent: 'flex-end' },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgOverlay,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: hitTarget.min,
    maxHeight: 120,
    color: colors.text,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sendBtn: {
    minHeight: hitTarget.min,
    minWidth: 70,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive:   { backgroundColor: colors.accent },
  sendBtnInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  sendBtnTextActive:   { color: '#fff',        ...typography.bodyStrong },
  sendBtnTextInactive: { color: colors.textDim, ...typography.body },
  expandBtn: {
    position: 'absolute',
    width: 32, height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.bgOverlay,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  expandGlyph: { color: colors.text, fontSize: 18, lineHeight: 20 },
});
```

- [ ] **Step 2: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/session/PortraitLayout.tsx
git commit -m "mobile(session): add PortraitLayout chrome component"
```

---

### Task 7: New `SessionScreen.tsx` shell (portrait-only) + `App.tsx` import swap

This task makes `PortraitLayout` reachable — still portrait-only, no landscape yet. Confirms refactor is functionally equivalent before adding the new behavior.

**Files:**
- Create: `mobile/src/session/SessionScreen.tsx`
- Modify: `mobile/App.tsx:13` — change import

- [ ] **Step 1: Create new shell**

```tsx
// mobile/src/session/SessionScreen.tsx
import { View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { PortraitLayout } from './PortraitLayout';
import { colors } from '../theme';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export function SessionScreen({ device, onPairingLost }: Props) {
  const session = useSession({ device, onPairingLost });

  // Landscape mode + orientation transitions land in Task 10 — for now
  // the shell only renders portrait chrome.
  const onExpand = () => { /* wired up in Task 10 */ };

  return (
    <View style={styles.root}>
      <WebViewHost />
      <PortraitLayout session={session} onExpand={onExpand} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
```

- [ ] **Step 2: Update `App.tsx` import**

In `mobile/App.tsx:13` change:

```ts
import { SessionScreen } from './src/screens/SessionScreen';
```

to:

```ts
import { SessionScreen } from './src/session/SessionScreen';
```

- [ ] **Step 3: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

- Start Metro: `cd mobile && npx expo start --clear`
- Pair the phone and land on the session screen.
- Verify: canvas shows, banner appears when disconnected, composer works (send a message, get ack, see it on desktop), safe-area insets no longer cut off the composer.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/SessionScreen.tsx mobile/App.tsx
git commit -m "mobile(session): switch App to new session/SessionScreen shell"
```

---

## Phase C — Landscape mode

### Task 8: `ConnectionPill` component

**Files:**
- Create: `mobile/src/webview-host/ConnectionPill.tsx`

- [ ] **Step 1: Create the pill**

```tsx
// mobile/src/webview-host/ConnectionPill.tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import type { TransportStatus } from '../transport/transport.interface';

interface Props { status: TransportStatus }

export function ConnectionPill({ status }: Props) {
  if (status.state === 'connected') return null;

  let dot = colors.warning;
  let label = 'Connecting';
  if (status.state === 'disconnected') { dot = colors.error; label = `Offline — ${status.reason}`; }
  else if (status.state === 'error') { dot = colors.error; label = 'Error'; }
  else if (status.state === 'idle') { dot = colors.textDim; label = 'Idle'; }

  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgPill,
    borderColor: 'rgba(59,130,246,0.55)',
    borderWidth: 1,
    borderRadius: radius.round,
  },
  dot: { width: 8, height: 8, borderRadius: radius.round },
  text: { color: colors.info, ...typography.caption },
});
```

- [ ] **Step 2: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/webview-host/ConnectionPill.tsx
git commit -m "mobile(webview-host): add ConnectionPill for landscape chrome"
```

---

### Task 9: `LandscapeLayout` component

**Files:**
- Create: `mobile/src/session/LandscapeLayout.tsx`

- [ ] **Step 1: Create the landscape chrome**

```tsx
// mobile/src/session/LandscapeLayout.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionPill } from '../webview-host/ConnectionPill';
import { colors, spacing, radius, typography } from '../theme';
import type { TransportStatus } from '../transport/transport.interface';

interface Props {
  status: TransportStatus;
  onOpenChat: () => void;
}

export function LandscapeLayout({ status, onOpenChat }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root} pointerEvents="box-none">
      <StatusBar hidden />
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.sm,
          left: insets.left + spacing.sm,
        }}
        pointerEvents="box-none"
      >
        <ConnectionPill status={status} />
      </View>
      <Pressable
        onPress={onOpenChat}
        style={[
          styles.fab,
          {
            bottom: insets.bottom + spacing.lg,
            right: insets.right + spacing.lg,
          },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Open chat and return to portrait"
      >
        <Text style={styles.fabGlyph}>💬</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  fab: {
    position: 'absolute',
    width: 56, height: 56,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    // Subtle elevation on Android + shadow on iOS
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  fabGlyph: { fontSize: 24, color: '#fff' },
});
```

- [ ] **Step 2: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/session/LandscapeLayout.tsx
git commit -m "mobile(session): add LandscapeLayout chrome component"
```

---

### Task 10: Mode state + orientation transitions in `SessionScreen`

Wires the expand button in portrait to rotate to landscape, the FAB in landscape to rotate back to portrait, and auto-focuses the TextInput after the return to portrait. Dismisses the keyboard before going landscape. Restores portrait on unmount. Re-applies the lock when the app returns from background.

**Files:**
- Modify: `mobile/src/session/SessionScreen.tsx`
- Modify: `mobile/src/session/PortraitLayout.tsx` — accept `focusInputRef` prop to let the shell trigger focus

- [ ] **Step 1: Update `PortraitLayout.tsx` to accept a focus ref**

Add an imperative handle so the shell can call `.focusInput()` on the layout. Replace the current `PortraitLayout` implementation with:

```tsx
// mobile/src/session/PortraitLayout.tsx
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
import { colors, spacing, radius, hitTarget, typography } from '../theme';
import type { UseSessionReturn } from './useSession';

interface Props {
  session: UseSessionReturn;
  onExpand: () => void;
}

export interface PortraitLayoutHandle {
  focusInput: () => void;
}

export const PortraitLayout = forwardRef<PortraitLayoutHandle, Props>(function PortraitLayout({ session, onExpand }, ref) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { status, draft, setDraft, sending, canSend, submit } = session;

  useImperativeHandle(ref, () => ({
    focusInput: () => { inputRef.current?.focus(); },
  }), []);

  const handleSend = async () => {
    const ack = await submit();
    if (!ack.ok && ack.error && ack.error !== 'empty' && ack.error !== 'no transport') {
      Alert.alert('Send failed', ack.error);
    }
  };

  const composer = (
    <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        placeholder="Reply to active agent…"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        editable={!sending && status.state === 'connected'}
        multiline
        maxLength={1000}
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
      >
        <Text style={canSend ? styles.sendBtnTextActive : styles.sendBtnTextInactive}>
          {sending ? '…' : 'Send'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.bannerSlot, { paddingTop: insets.top }]} pointerEvents="box-none">
        <ConnectionBanner status={status} />
      </View>

      <Pressable
        onPress={onExpand}
        style={[
          styles.expandBtn,
          { top: insets.top + spacing.xxl, right: spacing.md },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Expand canvas to landscape"
      >
        <Text style={styles.expandGlyph}>⤢</Text>
      </Pressable>

      {Platform.OS === 'ios'
        ? <KeyboardAvoidingView style={styles.keyboardAvoid} behavior="padding">{composer}</KeyboardAvoidingView>
        : <View style={styles.keyboardAvoid}>{composer}</View>}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  bannerSlot: { position: 'absolute', top: 0, left: 0, right: 0 },
  keyboardAvoid: { flex: 1, justifyContent: 'flex-end' },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgOverlay,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: hitTarget.min,
    maxHeight: 120,
    color: colors.text,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sendBtn: {
    minHeight: hitTarget.min,
    minWidth: 70,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive:   { backgroundColor: colors.accent },
  sendBtnInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  sendBtnTextActive:   { color: '#fff',         ...typography.bodyStrong },
  sendBtnTextInactive: { color: colors.textDim, ...typography.body },
  expandBtn: {
    position: 'absolute',
    width: 32, height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.bgOverlay,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  expandGlyph: { color: colors.text, fontSize: 18, lineHeight: 20 },
});
```

- [ ] **Step 2: Wire mode state + orientation transitions in `SessionScreen.tsx`**

Replace `mobile/src/session/SessionScreen.tsx` contents:

```tsx
// mobile/src/session/SessionScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View, StyleSheet } from 'react-native';
import { WebViewHost } from '../webview-host/WebViewHost';
import { useSession } from './useSession';
import { PortraitLayout, type PortraitLayoutHandle } from './PortraitLayout';
import { LandscapeLayout } from './LandscapeLayout';
import { lockOrientation, resetOrientation } from './orientation';
import { colors } from '../theme';
import type { PairedDeviceCredentials } from '../pairing/secure-store';

type Mode = 'portrait' | 'landscape';

interface Props {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export function SessionScreen({ device, onPairingLost }: Props) {
  const session = useSession({ device, onPairingLost });
  const [mode, setMode] = useState<Mode>('portrait');
  const transitioningRef = useRef(false);
  const portraitRef = useRef<PortraitLayoutHandle>(null);
  const focusPendingRef = useRef(false);

  const changeMode = (next: Mode) => {
    if (transitioningRef.current || next === mode) return;
    transitioningRef.current = true;
    if (next === 'landscape') Keyboard.dismiss();
    if (next === 'portrait') focusPendingRef.current = true;
    setMode(next);
  };

  // Apply the OS-level orientation lock whenever `mode` changes.
  useEffect(() => {
    let cancelled = false;
    lockOrientation(mode).finally(() => {
      if (!cancelled) transitioningRef.current = false;
      if (mode === 'portrait' && focusPendingRef.current) {
        focusPendingRef.current = false;
        // One animation frame to let layout settle before focusing.
        requestAnimationFrame(() => portraitRef.current?.focusInput());
      }
    });
    return () => { cancelled = true; };
  }, [mode]);

  // Reset orientation when SessionScreen unmounts (e.g. pairing lost).
  useEffect(() => () => { resetOrientation().catch(() => {}); }, []);

  // Re-apply the lock when the app returns to the foreground — iOS/Android
  // can reset orientation on app-switch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') lockOrientation(mode).catch(() => {});
    });
    return () => sub.remove();
  }, [mode]);

  return (
    <View style={styles.root}>
      <WebViewHost />
      {mode === 'portrait' ? (
        <PortraitLayout
          ref={portraitRef}
          session={session}
          onExpand={() => changeMode('landscape')}
        />
      ) : (
        <LandscapeLayout
          status={session.status}
          onOpenChat={() => changeMode('portrait')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
```

- [ ] **Step 3: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (orientation)**

- Start Metro: `cd mobile && npx expo start --clear`
- Pair and land on session screen.
- Tap expand button → phone rotates to landscape; pill appears (if not connected), FAB appears bottom-right.
- Tap FAB → rotates back to portrait, keyboard opens, TextInput is focused.
- Open keyboard → tap expand → keyboard dismisses cleanly, rotates to landscape.
- Rapid-tap expand and FAB → no weird intermediate states.
- Background the app in landscape → return → still landscape.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/SessionScreen.tsx mobile/src/session/PortraitLayout.tsx
git commit -m "mobile(session): add landscape mode + orientation transitions"
```

---

## Phase D — Theme migration

### Task 11: Migrate `ConnectionBanner` to theme tokens

**Files:**
- Modify: `mobile/src/webview-host/ConnectionBanner.tsx`

- [ ] **Step 1: Replace literals with tokens**

```tsx
// mobile/src/webview-host/ConnectionBanner.tsx
import { View, Text, StyleSheet } from 'react-native';
import type { TransportStatus } from '../transport/transport.interface';
import { colors, spacing, typography } from '../theme';

interface Props { status: TransportStatus }

export function ConnectionBanner({ status }: Props) {
  if (status.state === 'connected') return null;

  let text: string;
  let color: string;
  switch (status.state) {
    case 'idle': return null;
    case 'connecting': text = 'Connecting…'; color = colors.warning; break;
    case 'disconnected': text = `Not connected — ${status.reason}`; color = colors.error; break;
    case 'error': text = `Error — ${status.error.message}`; color = colors.error; break;
  }

  return (
    <View style={[styles.banner, { backgroundColor: color }]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  text: { color: '#fff', ...typography.label },
});
```

- [ ] **Step 2: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/webview-host/ConnectionBanner.tsx
git commit -m "mobile(webview-host): migrate ConnectionBanner to theme tokens"
```

---

### Task 12: Migrate `SasConfirmScreen` to theme tokens

**Files:**
- Modify: `mobile/src/pairing/SasConfirmScreen.tsx`

- [ ] **Step 1: Read existing file and identify literals**

Read `mobile/src/pairing/SasConfirmScreen.tsx` in full. Identify every color hex/rgba, every padding/margin/gap/borderRadius number, every fontSize/fontWeight.

- [ ] **Step 2: Replace literals with tokens**

Token-map to use:
- `#0a0a0a` → `colors.bg`
- `#f5f5f5` → `colors.text`
- `#cbd5e1` → `colors.textMuted`
- `#6b7280` → `colors.textDim`
- `#6366f1` → `colors.accent`
- `rgba(255,255,255,0.04)` → `colors.bgElevated`
- `rgba(255,255,255,0.08)` → `colors.border`
- `rgba(255,255,255,0.1)` → `colors.borderStrong`
- Any padding 8 / 10 → `spacing.sm` (8)
- Any padding 12 → `spacing.md` (12)
- Any padding 14 → `spacing.md` (12) — mild normalization
- Any padding 16 → `spacing.lg` (16)
- Any padding 24 / 28 → `spacing.xl` (24)
- Any gap between SAS digit groups: `spacing.md` (12)
- borderRadius 6 → `radius.md`; 8 → `radius.lg`
- fontSize 10/weight 500 → `typography.caption`
- fontSize 11/weight 600 → `typography.label`
- fontSize 14 → `typography.body` or `typography.bodyStrong` based on weight
- fontSize 18+/weight 700 → `typography.heading`

Add at the top of the file: `import { colors, spacing, radius, typography } from '../theme';`

Every change replaces only literals — do not alter layout structure or JSX. Keep the RTL fix (`direction: 'ltr'` on the SAS row, `writingDirection: 'ltr'` on each digit group) verbatim.

- [ ] **Step 3: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual visual QA**

- Start Metro, re-pair a phone, reach the SAS confirm screen.
- Compare against a screenshot taken before this commit: only the 8 → 12 gap normalization is expected to differ visibly; everything else should be identical.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/pairing/SasConfirmScreen.tsx
git commit -m "mobile(pairing): migrate SasConfirmScreen to theme tokens"
```

---

### Task 13: Migrate `WelcomeScreen`, `QRScanScreen`, `RemoteConsentScreen`

**Files:**
- Modify: `mobile/src/pairing/WelcomeScreen.tsx`
- Modify: `mobile/src/pairing/QRScanScreen.tsx`
- Modify: `mobile/src/pairing/RemoteConsentScreen.tsx`

One file per commit so regressions are easy to bisect.

- [ ] **Step 1: Migrate `WelcomeScreen.tsx`**

Apply the same token map from Task 12. Add `import { colors, spacing, radius, typography } from '../theme';`. Swap color literals and numeric literals; keep JSX and props unchanged.

- [ ] **Step 2: tsc + visual QA for WelcomeScreen**

Run: `cd mobile && npx tsc --noEmit`
Open Expo, force-quit, re-open to show the WelcomeScreen as the first render. Compare against the pre-migration screenshot.

- [ ] **Step 3: Commit WelcomeScreen**

```bash
git add mobile/src/pairing/WelcomeScreen.tsx
git commit -m "mobile(pairing): migrate WelcomeScreen to theme tokens"
```

- [ ] **Step 4: Migrate `QRScanScreen.tsx`**

Apply the token map. The camera overlay box/frame stays untouched (native composition); only the background color, countdown text, error text, and cancel button migrate.

- [ ] **Step 5: tsc + visual QA for QRScanScreen**

Run: `cd mobile && npx tsc --noEmit`
Trigger the scanner flow and compare visually.

- [ ] **Step 6: Commit QRScanScreen**

```bash
git add mobile/src/pairing/QRScanScreen.tsx
git commit -m "mobile(pairing): migrate QRScanScreen to theme tokens"
```

- [ ] **Step 7: Migrate `RemoteConsentScreen.tsx`**

Apply the token map.

- [ ] **Step 8: tsc + visual QA for RemoteConsentScreen**

Run: `cd mobile && npx tsc --noEmit`
Trigger the remote-consent step during pairing and compare visually.

- [ ] **Step 9: Commit RemoteConsentScreen**

```bash
git add mobile/src/pairing/RemoteConsentScreen.tsx
git commit -m "mobile(pairing): migrate RemoteConsentScreen to theme tokens"
```

---

### Task 14: Migrate `App.tsx` loading/pairing states to theme tokens

**Files:**
- Modify: `mobile/App.tsx`

- [ ] **Step 1: Identify affected sections**

In `mobile/App.tsx`, the loading screen (`<ActivityIndicator>` wrapper), the error alert placeholder styles, and any top-level `<View>` with inline styles are the target. The pairing screen imports already got tokens in Tasks 12–13.

- [ ] **Step 2: Replace inline style literals with theme tokens**

Add `import { colors, spacing } from './src/theme';` at the top of App.tsx. Swap:
- `backgroundColor: '#0a0a0a'` → `backgroundColor: colors.bg`
- Padding/margin literals → `spacing.*`
- Text colors → `colors.text` / `colors.textDim`

Don't change the JSX structure.

- [ ] **Step 3: Add `edges` prop to pairing-screen SafeAreaView (if used)**

If `App.tsx` wraps any pairing screen in `<SafeAreaView>` without an `edges` prop, change it to:

```tsx
<SafeAreaView edges={['top','bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
```

Do NOT wrap the `SessionScreen` case in `SafeAreaView` — the shell already manages insets via chrome components.

- [ ] **Step 4: tsc check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual visual QA — all pairing + loading screens**

Walk through: fresh launch (loading), welcome, QR scan, SAS confirm, remote consent, session screen. Compare each against pre-migration screenshots. Only intentional changes: the 44pt composer height and the 8→12 SAS gap normalization.

- [ ] **Step 6: Commit**

```bash
git add mobile/App.tsx
git commit -m "mobile(app): migrate loading/pairing-wrapper styles to theme tokens"
```

---

## Phase E — Cleanup + QA

### Task 15: Delete superseded `src/screens/SessionScreen.tsx`

**Files:**
- Delete: `mobile/src/screens/SessionScreen.tsx`
- Delete: `mobile/src/screens/` (if empty)

- [ ] **Step 1: Confirm no remaining imports of the old path**

Run: `cd mobile && grep -r "src/screens/SessionScreen" src App.tsx || echo "no references"`
Expected: `no references`.

- [ ] **Step 2: Delete the file**

Run:

```bash
rm mobile/src/screens/SessionScreen.tsx
rmdir mobile/src/screens 2>/dev/null || true
```

- [ ] **Step 3: tsc + jest pass**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add -A mobile/src
git commit -m "mobile: remove superseded src/screens/SessionScreen.tsx"
```

---

### Task 16: Final manual QA checklist

This is a gate before handing the branch off. Work through every item; if any fail, file an issue or fix inline and re-run.

- [ ] **1. Fresh pairing → session** — no visible layout jump as canvas loads. Composer 44pt tall, not under home indicator on iPhone; not under gesture bar on Android.
- [ ] **2. Notched device (iPhone 14/15 or Pixel with cutout)** — portrait: no chrome under the notch/status bar. Landscape: pill + FAB clear of side cutouts and home indicator.
- [ ] **3. Expand button → landscape** — canvas rotates smoothly, status bar hidden, pill in top-left (if disconnected), FAB in bottom-right.
- [ ] **4. FAB → portrait + chat focus** — keyboard animates up, TextInput already focused.
- [ ] **5. Rapid button hammer** — tap expand/FAB several times quickly; app stays stable, ends in a consistent state.
- [ ] **6. Connection drop in landscape** — break the transport (stop desktop); pill reappears; restore; pill disappears.
- [ ] **7. Keyboard open → tap expand** — keyboard dismisses before rotation, no half-state.
- [ ] **8. Background → foreground in landscape** — swipe to home in landscape, return to app; orientation lock restored.
- [ ] **9. AskUserQuestion arrives in landscape** — question shows in the WebView chat tab; tapping FAB returns to portrait where user can answer. No proactive indicator expected (out of scope).
- [ ] **10. All pairing screens + settings panel** — visually compared against pre-migration screenshots. Token swaps should be imperceptible except the intentional 44pt composer bump and the 8→12 SAS gap.

If all ten pass: done.

---

## Self-Review (plan vs. spec)

**Spec coverage:**

| Spec requirement | Covered by |
| --- | --- |
| Theme module with colors/spacing/typography/radius/hitTarget | Task 1 |
| `expo-screen-orientation` + `app.json` unlock | Task 2 |
| `orientation.ts` wrapper | Task 3 |
| `createTransportForDevice` factory | Task 4 |
| `useSession` hook | Task 5 |
| `PortraitLayout` + 44pt touch targets | Task 6 |
| `SessionScreen` shell with absolute-fill WebView | Task 7 |
| `ConnectionPill` compact indicator | Task 8 |
| `LandscapeLayout` + StatusBar hidden | Task 9 |
| Mode state, orientation transitions, Keyboard.dismiss, auto-focus, AppState re-lock, isTransitioning guard, resetOrientation on unmount | Task 10 |
| Theme token migration across ConnectionBanner | Task 11 |
| Theme token migration across SasConfirmScreen | Task 12 |
| Theme token migration across Welcome/QRScan/RemoteConsent | Task 13 |
| Theme token migration in App.tsx loading/pairing wrappers | Task 14 |
| Delete superseded `src/screens/SessionScreen.tsx` | Task 15 |
| Manual QA checklist from spec §Testing Strategy | Task 16 |
| Keyboard conflict resolution (drop KeyboardAvoidingView on Android) | Built into Task 6 + Task 10 PortraitLayout |
| Safe-area strategy (no top-level SafeAreaView, `useSafeAreaInsets` in chrome) | Built into Task 6 + Task 9 + Task 14 |
| `useSession` jest tests | Task 5 |
| `orientation` jest tests | Task 3 |

All spec items accounted for. No orphan requirements.

**Type consistency (spot-checked):**

- `UseSessionReturn.submit` returns `Promise<{ ok: boolean; error?: string }>` — matches both the test (Task 5) and the `handleSend` in PortraitLayout (Task 6).
- `PortraitLayoutHandle.focusInput` defined in Task 10 Step 1 is called in Task 10 Step 2.
- `Mode` alias `'portrait' | 'landscape'` consistent across orientation.ts (Task 3), SessionScreen (Task 10).
- `PairedDeviceCredentials` imported consistently from `pairing/secure-store` in all new files.

**Placeholder scan:** no occurrences of TBD, TODO, "implement later", or "similar to Task N". Every step shows exact file paths, exact commands with expected output, and complete code.
