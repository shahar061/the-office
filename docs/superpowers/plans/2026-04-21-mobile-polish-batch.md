# Mobile Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small mobile polish fixes: (1) desktop-typed messages appear on the phone, (2) the fullscreen button hides on the Chat tab, (3) a persistent "Local" / "Remote" connection badge is visible on both apps.

**Architecture:** Item 1 is a one-function IPC handler change. Item 2 threads a new `activeTab` postMessage from the mobile-renderer webview through the Expo shell down to `PortraitOverlays`. Item 3 expands the existing always-hidden `ConnectionPill` to render mode text in the happy path and renames user-facing "LAN"→"Local" / "Relay"→"Remote" across the desktop renderer.

**Tech Stack:** TypeScript, Electron main + renderer (React/Zustand), Expo mobile (React Native) + WebView, Vitest for desktop/shared tests, Jest + @testing-library/react-native for mobile shell, Vitest + React Testing Library for the webview renderer.

**Spec:** `docs/superpowers/specs/2026-04-21-mobile-polish-batch-design.md`

---

## File Structure

**Item 1 — Desktop echo:**
- Modify: `electron/ipc/phase-handlers.ts:731` — replace no-op `SEND_MESSAGE` handler body with a forward-to-mobile implementation.
- Test: `tests/electron/ipc/send-message-echo.test.ts` (new).

**Item 2 — Fullscreen button gating:**
- Modify: `src/mobile-renderer/MobileApp.tsx` — call a tiny helper to emit `{type:'activeTab', tab}` via `ReactNativeWebView.postMessage` on tab change + once on mount.
- Create: `src/mobile-renderer/emitActiveTab.ts` — single helper function, mirrors `sendAnswer.ts`.
- Modify: `mobile/src/webview-host/WebViewHost.tsx` — add `onActiveTabChange` prop and route the new message to it.
- Modify: `mobile/src/session/SessionScreen.tsx` — hold `activeTab` state, wire through `WebViewHost` and into `PortraitOverlays`.
- Modify: `mobile/src/session/PortraitLayout.tsx` — accept `activeTab` prop on `PortraitOverlays`, gate the expand `<Pressable>` on `activeTab === 'office'`.
- Test: `mobile/src/__tests__/PortraitOverlays.test.tsx` (new) — gating assertions.
- Test: `mobile/src/__tests__/WebViewHost.test.tsx` (new) — onMessage routing for `activeTab`.
- Rebuild: `npm run build:mobile-all` and commit the updated bundle under `mobile/assets/webview/`.

**Item 3 — Local / Remote labels:**
- Modify: `mobile/src/webview-host/ConnectionPill.tsx` — render always, branch on `status.state === 'connected'` to show mode text.
- Modify: `src/renderer/src/components/HeaderStatusPill/HeaderStatusPill.tsx` — rename "LAN" → "Local" and "LAN+Remote" → "Local+Remote" in `describe()`.
- Modify: `src/renderer/src/components/HeaderStatusPill/PillPopover.tsx:73` — rename "LAN" → "Local".
- Modify: `src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx` — rename all "Relay X" labels to "Remote X".
- Test: `mobile/src/__tests__/ConnectionPill.test.tsx` (new).
- Test: `tests/renderer/HeaderStatusPill.test.tsx` (new) — 4 mode cases.

---

## Task 1: Desktop echo — forward SEND_MESSAGE to mobile bridge

**Files:**
- Modify: `electron/ipc/phase-handlers.ts:729-734`
- Test: `tests/electron/ipc/send-message-echo.test.ts` (new)

**Intent:** The current handler is an explicit no-op (comment: "User messages are added to the chat store locally by the renderer."). We add a side-effect: forward the user's text to `mobileBridge.onChat(...)` with `source: 'desktop'`. We deliberately do NOT call `sendChat()` because that also emits `CHAT_MESSAGE` back to the renderer, which would double-render (the `ChatPanel.tsx:216-221` already adds the message optimistically).

- [ ] **Step 1: Write the failing test**

Create `tests/electron/ipc/send-message-echo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Install a minimal Electron module stub before any imports that transitively
// require `electron`. This mirrors the pattern used elsewhere in tests/electron/.
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
    // Expose the handler map so the test can fire channels synthetically.
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
      // Other MobileBridge methods — satisfy the interface with no-ops.
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

    // Cleanup
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/electron/ipc/send-message-echo.test.ts`
Expected: FAIL — `onChat` is never called because the current handler body is a no-op.

- [ ] **Step 3: Implement the forwarding**

Edit `electron/ipc/phase-handlers.ts`. First, add `randomUUID` to the imports at the top (if not already present):

```ts
import { randomUUID } from 'crypto';
```

Locate the `SEND_MESSAGE` handler (currently at lines 731-734):

```ts
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, _message: string) => {
    // User messages are added to the chat store locally by the renderer.
    // This handler exists for future use (routing messages to active SDK sessions).
  });
```

Replace with:

```ts
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, message: string) => {
    // Forward desktop-typed user input to the mobile bridge so the phone's
    // chat tail mirrors desktop input. We intentionally do NOT call sendChat()
    // here — that path also emits CHAT_MESSAGE to the renderer, which would
    // double-render (ChatPanel already adds an optimistic local message on
    // input). This handler is a mobile-only side-effect; desktop UI is
    // unaffected. If an SDK routing body is added later, chain on top of this
    // forward rather than replacing it.
    if (!mobileBridge) return;
    mobileBridge.onChat([{
      id: randomUUID(),
      role: 'user',
      text: message,
      timestamp: Date.now(),
      source: 'desktop',
    }]);
  });
```

Ensure `mobileBridge` is imported at the top of the file. Open `electron/ipc/phase-handlers.ts` line 54 neighborhood — it already imports `sendChat` from `./state`; extend that import line to include `mobileBridge`. If the existing import uses `import { sendChat, ... } from './state'`, add `mobileBridge` to the list.

Grep first to confirm the current import shape: `grep -n "from './state'" electron/ipc/phase-handlers.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/electron/ipc/send-message-echo.test.ts`
Expected: PASS — both cases.

Run full suite sanity check: `npx vitest run`
Expected: 751+ passing (baseline + 2 new).

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/phase-handlers.ts tests/electron/ipc/send-message-echo.test.ts
git commit -m "feat(ipc): forward desktop SEND_MESSAGE to mobile bridge"
```

---

## Task 2: PortraitOverlays gating prop (shell-only, test first)

**Files:**
- Modify: `mobile/src/session/PortraitLayout.tsx`
- Test: `mobile/src/__tests__/PortraitOverlays.test.tsx` (new)

**Intent:** `PortraitOverlays` accepts a new `activeTab: 'chat' | 'office'` prop and renders the expand `<Pressable>` only when it's `'office'`. Default is `'office'` for backward-compat while other layers are still wiring up (Task 4 will flow the real value from a state).

- [ ] **Step 1: Write the failing test**

Create `mobile/src/__tests__/PortraitOverlays.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortraitOverlays } from '../session/PortraitLayout';

const connectedStatus = { state: 'connected' as const, desktopName: 'D', mode: 'lan' as const };

function renderWith(props: { activeTab: 'chat' | 'office'; onExpand?: () => void }) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 300, height: 600 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <PortraitOverlays
        status={connectedStatus}
        onExpand={props.onExpand ?? (() => {})}
        activeTab={props.activeTab}
      />
    </SafeAreaProvider>,
  );
}

describe('PortraitOverlays — expand button gating', () => {
  it('renders the expand button when activeTab === "office"', () => {
    renderWith({ activeTab: 'office' });
    expect(screen.queryByA11yLabel('Expand canvas to landscape')).not.toBeNull();
  });

  it('hides the expand button when activeTab === "chat"', () => {
    renderWith({ activeTab: 'chat' });
    expect(screen.queryByA11yLabel('Expand canvas to landscape')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/PortraitOverlays.test.tsx`
Expected: FAIL — TypeScript error or prop-missing, because `PortraitOverlays` doesn't yet accept `activeTab`.

- [ ] **Step 3: Update PortraitOverlays**

Open `mobile/src/session/PortraitLayout.tsx`. Update the `OverlaysProps` interface (around line 23-26) to add the new prop as OPTIONAL with a default, so the existing call site in `SessionScreen.tsx` keeps compiling while Task 4 wires the real value:

```ts
interface OverlaysProps {
  status: UseSessionReturn['status'];
  onExpand: () => void;
  /** Tab currently active inside the WebView. Only the Office tab gets the
   *  expand-to-landscape button; the Chat tab has no use for fullscreen.
   *  Optional for transitional compilation — Task 4 passes the real value. */
  activeTab?: 'chat' | 'office';
}
```

Update the `PortraitOverlays` function signature + body (around line 28-48) to destructure with a default and gate the button:

```tsx
export function PortraitOverlays({ status, onExpand, activeTab = 'office' }: OverlaysProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={overlayStyles.root} pointerEvents="box-none">
      <View style={[overlayStyles.bannerSlot, { paddingTop: insets.top }]} pointerEvents="box-none">
        <ConnectionBanner status={status} />
      </View>
      {activeTab === 'office' && (
        <Pressable
          onPress={onExpand}
          style={[
            overlayStyles.expandBtn,
            { top: insets.top + spacing.xxl, right: spacing.md },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Expand canvas to landscape"
        >
          <Text style={overlayStyles.expandGlyph}>⤢</Text>
        </Pressable>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/__tests__/PortraitOverlays.test.tsx`
Expected: PASS — both cases.

Full mobile jest: `cd mobile && npx jest`
Expected: all green. The existing `SessionScreen.tsx` call site to `PortraitOverlays` still compiles because `activeTab` is optional (defaults to `'office'`, matching today's behavior).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/PortraitLayout.tsx mobile/src/__tests__/PortraitOverlays.test.tsx
git commit -m "feat(mobile-layout): gate PortraitOverlays expand button on activeTab"
```

---

## Task 3: WebViewHost routes `activeTab` message to a callback

**Files:**
- Modify: `mobile/src/webview-host/WebViewHost.tsx`
- Test: `mobile/src/__tests__/WebViewHost.test.tsx` (new)

**Intent:** The `onMessage` handler already branches on `data.type` (`__console`, `ready`, `sendChat`). Add one more branch for `activeTab` and invoke a new optional `onActiveTabChange` prop when it arrives.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/__tests__/WebViewHost.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';

// Mock react-native-webview: render a null element but expose its onMessage
// prop to the test so we can fire synthetic messages.
let capturedOnMessage: ((e: { nativeEvent: { data: string } }) => void) | null = null;
jest.mock('react-native-webview', () => {
  return {
    WebView: (props: any) => {
      capturedOnMessage = props.onMessage;
      return null;
    },
  };
});
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({ downloadAsync: async () => {}, localUri: 'file:///tmp/idx.html', uri: 'file:///tmp/idx.html' }),
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

import { WebViewHost } from '../webview-host/WebViewHost';

describe('WebViewHost — activeTab routing', () => {
  beforeEach(() => { capturedOnMessage = null; });

  it('calls onActiveTabChange when the webview posts {type:"activeTab", tab}', () => {
    const spy = jest.fn();
    render(
      <WebViewHost
        onPhoneAnswer={async () => ({ ok: true })}
        onActiveTabChange={spy}
      />,
    );
    expect(capturedOnMessage).toBeTruthy();
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({ type: 'activeTab', tab: 'chat' }) } });
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({ type: 'activeTab', tab: 'office' }) } });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 'chat');
    expect(spy).toHaveBeenNthCalledWith(2, 'office');
  });

  it('ignores activeTab messages with invalid tab value', () => {
    const spy = jest.fn();
    render(
      <WebViewHost
        onPhoneAnswer={async () => ({ ok: true })}
        onActiveTabChange={spy}
      />,
    );
    capturedOnMessage!({ nativeEvent: { data: JSON.stringify({ type: 'activeTab', tab: 'bogus' }) } });
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/WebViewHost.test.tsx`
Expected: FAIL — `onActiveTabChange` prop doesn't exist yet.

- [ ] **Step 3: Implement**

Open `mobile/src/webview-host/WebViewHost.tsx`. Extend the `Props` interface (around line 9-12):

```tsx
interface Props {
  style?: any;
  onPhoneAnswer: (body: string) => Promise<{ ok: boolean; error?: string }>;
  /** Fired whenever the webview tells the shell which tab is active.
   *  Used by SessionScreen to gate the expand-to-landscape button. */
  onActiveTabChange?: (tab: 'chat' | 'office') => void;
}
```

Update the function signature (line 14):

```tsx
export function WebViewHost({ style, onPhoneAnswer, onActiveTabChange }: Props) {
```

In the `onMessage` handler body (around lines 160-179), add an `activeTab` branch below the existing `sendChat` branch but before the closing `}`:

```tsx
if (data?.type === 'activeTab' && (data.tab === 'chat' || data.tab === 'office')) {
  onActiveTabChange?.(data.tab);
  return;
}
```

The final `onMessage` body should read (roughly):

```tsx
onMessage={(e) => {
  try {
    const data = JSON.parse(e.nativeEvent.data);
    if (data?.type === '__console') {
      console.log('[WV:' + (data.level || 'log') + ']', data.body);
      return;
    }
    if (data?.type === 'ready') {
      console.log('[WebViewHost] got ready');
      setReady(true);
      return;
    }
    if (data?.type === 'sendChat' && typeof data.body === 'string') {
      void onPhoneAnswer(data.body).then((result) => {
        if (!result.ok) console.warn('[WebViewHost] sendChat failed', result.error);
      });
      return;
    }
    if (data?.type === 'activeTab' && (data.tab === 'chat' || data.tab === 'office')) {
      onActiveTabChange?.(data.tab);
      return;
    }
  } catch { /* ignore non-JSON */ }
}}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/__tests__/WebViewHost.test.tsx`
Expected: PASS — both cases.

Full mobile jest: `cd mobile && npx jest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/webview-host/WebViewHost.tsx mobile/src/__tests__/WebViewHost.test.tsx
git commit -m "feat(mobile-webview-host): route activeTab postMessage to onActiveTabChange"
```

---

## Task 4: SessionScreen — activeTab state + wire through

**Files:**
- Modify: `mobile/src/session/SessionScreen.tsx`

**Intent:** `SessionScreen` holds an `activeTab` state, defaults to `'office'` (matches the webview's MobileApp default). Pass the current value into `PortraitOverlays.activeTab` and set the `onActiveTabChange` callback on `WebViewHost`. No new tests needed — coverage comes from Tasks 2 and 3 plus manual QA.

- [ ] **Step 1: Read the current file top-to-bottom**

Open `mobile/src/session/SessionScreen.tsx` and re-familiarize yourself with the render tree. The file was last touched when the sessionActive branch was added.

- [ ] **Step 2: Add the activeTab state**

Add a `useState` right below the existing `mode` state (around line 22):

```tsx
const [activeTab, setActiveTab] = useState<'chat' | 'office'>('office');
```

- [ ] **Step 3: Pass the callback to WebViewHost and the value to PortraitOverlays**

Find the happy-path return (the branch taken when `session.sessionActive === true`). Update the `<WebViewHost>` and `<PortraitOverlays>` JSX:

```tsx
<WebViewHost
  onPhoneAnswer={session.sendChat}
  onActiveTabChange={setActiveTab}
/>
{mode === 'portrait'
  ? <PortraitOverlays
      status={session.status}
      activeTab={activeTab}
      onExpand={() => changeMode('landscape')}
    />
  : <LandscapeLayout status={session.status} onOpenChat={() => changeMode('portrait')} />}
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no NEW errors for `SessionScreen.tsx`. Pre-existing errors elsewhere are acceptable.

Run mobile jest smoke: `cd mobile && npx jest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/SessionScreen.tsx
git commit -m "feat(mobile-session): thread activeTab through SessionScreen"
```

---

## Task 5: Webview emits `activeTab` on tab change + mount

**Files:**
- Create: `src/mobile-renderer/emitActiveTab.ts`
- Modify: `src/mobile-renderer/MobileApp.tsx`
- Test: extend `src/mobile-renderer/__tests__/sendAnswer.test.ts` pattern — add a new test file for `emitActiveTab`.

**Intent:** The webview's `MobileApp` owns the `'office' | 'chat'` tab state. On mount and on every change, emit `{type:'activeTab', tab}` to the RN host via `ReactNativeWebView.postMessage`. Mirror the existing `sendAnswer.ts` helper pattern — one tiny module per message type, for testability and consistency.

- [ ] **Step 1: Write the helper test**

Create `src/mobile-renderer/__tests__/emitActiveTab.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emitActiveTab } from '../emitActiveTab';

describe('emitActiveTab', () => {
  beforeEach(() => {
    (window as any).ReactNativeWebView = undefined;
  });

  it('posts the right payload to ReactNativeWebView', () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    emitActiveTab('chat');
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'activeTab', tab: 'chat' }));
    emitActiveTab('office');
    expect(postMessage).toHaveBeenLastCalledWith(JSON.stringify({ type: 'activeTab', tab: 'office' }));
  });

  it('is a safe no-op when ReactNativeWebView is absent', () => {
    expect(() => emitActiveTab('office')).not.toThrow();
  });
});
```

- [ ] **Step 2: Verify failing**

Run: `npx vitest run src/mobile-renderer/__tests__/emitActiveTab.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement the helper**

Create `src/mobile-renderer/emitActiveTab.ts`:

```ts
// Emits the current active tab to the React Native host so the shell can
// gate tab-scoped chrome (the expand-to-landscape button, specifically).
// Mirrors sendAnswer.ts: one message type, one module, no state.
export function emitActiveTab(tab: 'chat' | 'office'): void {
  const host = (window as unknown as {
    ReactNativeWebView?: { postMessage: (s: string) => void };
  }).ReactNativeWebView;
  if (!host) return;
  host.postMessage(JSON.stringify({ type: 'activeTab', tab }));
}
```

- [ ] **Step 4: Wire into MobileApp**

Open `src/mobile-renderer/MobileApp.tsx`. Add an import at the top:

```ts
import { emitActiveTab } from './emitActiveTab';
```

Add an effect that fires on mount and on any change to `activeTab`. Place it below the existing `useIsLandscape()` hook, inside `MobileApp`:

```tsx
useEffect(() => {
  emitActiveTab(activeTab);
}, [activeTab]);
```

Note: the existing file computes `const activeTab = landscape ? 'office' : tab;` (line 35). The effect above depends on that derived value. In landscape, the webview reports `'office'` — matching what the shell should see while the user is in landscape canvas mode. That's correct.

Make sure `useEffect` is imported (it already is at line 1 — `import { useEffect, useState }`). No other changes to this file.

- [ ] **Step 5: Run tests to verify**

Run: `npx vitest run src/mobile-renderer/__tests__/emitActiveTab.test.ts`
Expected: PASS.

Run: `npx vitest run src/mobile-renderer`
Expected: all webview tests green (including pre-existing `sendAnswer`, `ChatView`, etc.).

- [ ] **Step 6: Commit**

```bash
git add src/mobile-renderer/emitActiveTab.ts src/mobile-renderer/__tests__/emitActiveTab.test.ts src/mobile-renderer/MobileApp.tsx
git commit -m "feat(mobile-renderer): emit activeTab postMessage on tab change + mount"
```

---

## Task 6: Rebuild webview bundle

**Files:**
- Regenerate: everything under `mobile/assets/webview/` via `npm run build:mobile-all`.

**Intent:** Task 5 changed code inside `src/mobile-renderer/`. The mobile app loads this code as a bundled HTML+JS asset at `mobile/assets/webview/`. The bundle needs rebuilding and the outputs committed, matching the pattern from prior commits like `5e2d80b feat(mobile-bridge): wire archived-runs triggers + rebuild bundle`.

- [ ] **Step 1: Build**

Run from the repo root:

```bash
npm run build:mobile-all
```

This first runs `build:mobile-renderer` (Vite build to `dist-mobile-renderer/`) and then `copy:webview` (copies `dist-mobile-renderer/index.html` + JS bundle into `mobile/assets/webview/`).

Expected: completes with a small summary of bundle size. Any error means the `MobileApp.tsx` / `emitActiveTab.ts` change has a bundle-time issue — fix before proceeding.

- [ ] **Step 2: Verify the diff**

Run: `git status` and confirm `mobile/assets/webview/index.html` (and the JS bundle inside that directory) are modified.

Inspect the diff briefly to make sure the bundle includes the new `emitActiveTab` code. Searching for the string is enough:

```bash
grep -l "activeTab" mobile/assets/webview/*.js
```

Expected: at least one match.

- [ ] **Step 3: Commit**

```bash
git add mobile/assets/webview
git commit -m "chore(mobile): rebuild webview bundle with activeTab emitter"
```

---

## Task 7: Mobile ConnectionPill — show Local / Remote in happy path

**Files:**
- Modify: `mobile/src/webview-host/ConnectionPill.tsx`
- Test: `mobile/src/__tests__/ConnectionPill.test.tsx` (new)

**Intent:** Currently `ConnectionPill` returns `null` when connected. Change it to render a "Local" or "Remote" badge in the connected state. Other states keep their existing copy.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/__tests__/ConnectionPill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { ConnectionPill } from '../webview-host/ConnectionPill';

describe('ConnectionPill', () => {
  it('renders "Local" when connected on LAN', () => {
    render(<ConnectionPill status={{ state: 'connected', desktopName: 'D', mode: 'lan' }} />);
    expect(screen.queryByText('Local')).not.toBeNull();
  });

  it('renders "Remote" when connected via relay', () => {
    render(<ConnectionPill status={{ state: 'connected', desktopName: 'D', mode: 'relay' }} />);
    expect(screen.queryByText('Remote')).not.toBeNull();
  });

  it('renders "Connected" when connected with unknown mode', () => {
    render(<ConnectionPill status={{ state: 'connected', desktopName: 'D' }} />);
    expect(screen.queryByText('Connected')).not.toBeNull();
  });

  it('renders "Connecting" for state=connecting', () => {
    render(<ConnectionPill status={{ state: 'connecting' }} />);
    expect(screen.queryByText('Connecting')).not.toBeNull();
  });

  it('renders "Offline — <reason>" for state=disconnected', () => {
    render(<ConnectionPill status={{ state: 'disconnected', reason: 'timeout' }} />);
    expect(screen.queryByText('Offline — timeout')).not.toBeNull();
  });

  it('renders "Error" for state=error', () => {
    render(<ConnectionPill status={{ state: 'error', error: new Error('x') }} />);
    expect(screen.queryByText('Error')).not.toBeNull();
  });

  it('renders "Idle" for state=idle', () => {
    render(<ConnectionPill status={{ state: 'idle' }} />);
    expect(screen.queryByText('Idle')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/ConnectionPill.test.tsx`
Expected: FAIL — the first three cases fail because the current component returns `null` when connected.

- [ ] **Step 3: Implement**

Open `mobile/src/webview-host/ConnectionPill.tsx` and replace the whole function body:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import type { TransportStatus } from '../transport/transport.interface';

interface Props { status: TransportStatus }

export function ConnectionPill({ status }: Props) {
  let dot: string;
  let label: string;

  switch (status.state) {
    case 'connected':
      if (status.mode === 'lan') { dot = colors.success; label = 'Local'; break; }
      if (status.mode === 'relay') { dot = colors.accent; label = 'Remote'; break; }
      dot = colors.info; label = 'Connected';
      break;
    case 'connecting':
      dot = colors.warning; label = 'Connecting';
      break;
    case 'disconnected':
      dot = colors.error; label = `Offline — ${status.reason}`;
      break;
    case 'error':
      dot = colors.error; label = 'Error';
      break;
    case 'idle':
      dot = colors.textDim; label = 'Idle';
      break;
  }

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

Notes:
- The early return on `state === 'connected'` is gone. The pill is always rendered now.
- `colors.success` is green (matches desktop's `#22c55e`); `colors.accent` is indigo (matches desktop's `#6366f1`). Both are already defined in `mobile/src/theme/colors.ts`.
- Idle and error dot colors are preserved from the original implementation.

- [ ] **Step 4: Run test to verify**

Run: `cd mobile && npx jest src/__tests__/ConnectionPill.test.tsx`
Expected: PASS — all 7 cases.

Full mobile jest: `cd mobile && npx jest`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/webview-host/ConnectionPill.tsx mobile/src/__tests__/ConnectionPill.test.tsx
git commit -m "feat(mobile): show Local/Remote badge on ConnectionPill in connected state"
```

---

## Task 8: Desktop HeaderStatusPill — rename LAN → Local

**Files:**
- Modify: `src/renderer/src/components/HeaderStatusPill/HeaderStatusPill.tsx`
- Test: `tests/renderer/HeaderStatusPill.test.tsx` (new)

**Intent:** The header pill's `describe()` function (lines 13-27) maps `mode` to a display string using "LAN". Rename to "Local" everywhere. Also rename the mixed-mode string "LAN+Remote" → "Local+Remote".

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/HeaderStatusPill.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeaderStatusPill } from '../../src/renderer/src/components/HeaderStatusPill/HeaderStatusPill';
import { useMobileBridgeStore } from '../../src/renderer/src/stores/mobile-bridge.store';

type Device = {
  deviceId: string; deviceName: string;
  mode: 'lan' | 'relay' | 'offline';
  lastSeenAt: number; remoteAllowed: boolean;
};

function setDevices(devices: Device[]) {
  useMobileBridgeStore.setState({
    status: {
      running: true, port: 0, connectedDevices: devices.length, pendingSas: null,
      v1DeviceCount: 0, relay: 'ready', relayPausedUntil: null, lanHost: null,
      devices,
    },
  });
}

describe('HeaderStatusPill label derivation', () => {
  it('shows "Pair a phone" when no devices are connected', () => {
    setDevices([]);
    render(<HeaderStatusPill />);
    expect(screen.getByText(/Pair a phone/)).toBeTruthy();
  });

  it('shows "● <name> · Local" for one LAN device', () => {
    setDevices([{ deviceId: 'd', deviceName: 'iPhone', mode: 'lan', lastSeenAt: 1, remoteAllowed: false }]);
    render(<HeaderStatusPill />);
    expect(screen.getByText('● iPhone · Local')).toBeTruthy();
  });

  it('shows "● <name> · Remote" for one Relay device', () => {
    setDevices([{ deviceId: 'd', deviceName: 'iPhone', mode: 'relay', lastSeenAt: 1, remoteAllowed: true }]);
    render(<HeaderStatusPill />);
    expect(screen.getByText('● iPhone · Remote')).toBeTruthy();
  });

  it('shows "📱 N phones · Local+Remote" for mixed modes', () => {
    setDevices([
      { deviceId: 'a', deviceName: 'A', mode: 'lan', lastSeenAt: 1, remoteAllowed: false },
      { deviceId: 'b', deviceName: 'B', mode: 'relay', lastSeenAt: 1, remoteAllowed: true },
    ]);
    render(<HeaderStatusPill />);
    expect(screen.getByText('📱 2 phones · Local+Remote')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/HeaderStatusPill.test.tsx`
Expected: FAIL — existing code says "LAN" and "LAN+Remote".

- [ ] **Step 3: Implement**

Open `src/renderer/src/components/HeaderStatusPill/HeaderStatusPill.tsx`. Update the `describe()` function (lines 13-27). Change each "LAN" string to "Local":

```ts
function describe(devices: Device[]): { label: string; dotColor: string } {
  if (devices.length === 0) return { label: '📱 Pair a phone', dotColor: 'transparent' };
  if (devices.length === 1) {
    const d = devices[0];
    const mode = d.mode === 'lan' ? 'Local' : d.mode === 'relay' ? 'Remote' : 'Idle';
    const color = d.mode === 'lan' ? '#22c55e' : d.mode === 'relay' ? '#6366f1' : '#6b7280';
    return { label: `● ${d.deviceName} · ${mode}`, dotColor: color };
  }
  const modes = new Set(devices.map((d) => d.mode));
  const combo = modes.has('lan') && modes.has('relay') ? 'Local+Remote'
              : modes.has('lan') ? 'Local'
              : modes.has('relay') ? 'Remote'
              : 'Idle';
  return { label: `📱 ${devices.length} phones · ${combo}`, dotColor: '#a5b4fc' };
}
```

The only changes: three replacements of `'LAN'` → `'Local'` and `'LAN+Remote'` → `'Local+Remote'`.

- [ ] **Step 4: Run test to verify**

Run: `npx vitest run tests/renderer/HeaderStatusPill.test.tsx`
Expected: PASS — all 4 cases.

Full vitest: `npx vitest run`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/HeaderStatusPill/HeaderStatusPill.tsx tests/renderer/HeaderStatusPill.test.tsx
git commit -m "feat(header-pill): rename LAN → Local in mode summary"
```

---

## Task 9: PillPopover + MobileSection copy rename

**Files:**
- Modify: `src/renderer/src/components/HeaderStatusPill/PillPopover.tsx`
- Modify: `src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx`

**Intent:** Finish the copy rename across the Settings panel and the pill popover. Two files, three targeted string edits each.

- [ ] **Step 1: Rename in PillPopover**

Open `src/renderer/src/components/HeaderStatusPill/PillPopover.tsx`. Line 73 reads:

```tsx
{d.mode === 'lan' ? 'LAN' : d.mode === 'relay' ? 'Remote' : 'Idle'}
```

Change to:

```tsx
{d.mode === 'lan' ? 'Local' : d.mode === 'relay' ? 'Remote' : 'Idle'}
```

The dot-color expression one line above already uses `#22c55e` (green) for `lan` and `#6366f1` (indigo) for `relay` — no color change needed.

Button text on line 90: `⏸ {paused ? 'Remote access paused' : 'Pause remote access'}` — this is already "Remote" and stays unchanged.

- [ ] **Step 2: Rename in MobileSection**

Open `src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx`. Locate the `relayLabel` map (around line 26-31):

```tsx
const relayLabel = {
  ready: '● Relay ready',
  unreachable: '○ Relay unreachable · LAN still works',
  disabled: '● Relay disabled (no remote devices)',
  paused: '⏸ Relay paused',
}[relay];
```

Change to:

```tsx
const relayLabel = {
  ready: '● Remote ready',
  unreachable: '○ Remote unreachable · Local still works',
  disabled: '● Remote disabled (no remote devices)',
  paused: '⏸ Remote paused',
}[relay];
```

Four string replacements in one object.

- [ ] **Step 3: Type-check + lint + test**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

Run: `npx vitest run`
Expected: all green (no tests were exercising these specific strings; renames are behavior-preserving for tests).

- [ ] **Step 4: Visual sanity check**

No user-facing test in vitest covers the Settings panel directly. If the project has a local dev flow (`npm run dev`), open Settings → Mobile and confirm the labels now read "Remote ready" etc. If not running the app, skip — these are copy-only changes validated by code review.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/HeaderStatusPill/PillPopover.tsx src/renderer/src/components/SettingsPanel/sections/MobileSection.tsx
git commit -m "feat(settings-mobile,pill-popover): rename Relay → Remote, LAN → Local in user-facing copy"
```

---

## Task 10: End-to-end validation

**Files:** None — validation only.

- [ ] **Step 1: Run the full suite**

Run:

```bash
npx vitest run
cd mobile && npx jest && cd ..
```

Expected: both green. Desktop vitest at 753+ (baseline 751 + SEND_MESSAGE 2 + HeaderStatusPill 4 − possible test-file count changes). Mobile jest at 45+ (baseline 33 + PortraitOverlays 2 + WebViewHost 2 + ConnectionPill 7).

- [ ] **Step 2: Manual QA — desktop**

Run `npm run dev`. Walk through:

1. Open a project. Top-bar header pill shows either "● \<desktop\> · Local" (LAN-only phone) or "● \<desktop\> · Remote" (relay-only phone) or "📱 N phones · Local+Remote" (mixed).
2. Click the pill — the popover row shows "Local" or "Remote" per device. No "LAN" anywhere.
3. Open Settings → Mobile. The status footer reads "● Remote ready" / "○ Remote unreachable · Local still works" / "● Remote disabled (no remote devices)" / "⏸ Remote paused".
4. Type a message in the chat panel. Check that it appears in the desktop chat panel (unchanged UX).

- [ ] **Step 3: Manual QA — mobile (if a paired phone is available)**

1. With a paired phone connected: the `ConnectionPill` is now always visible. It shows "Local" (green dot) on LAN or "Remote" (indigo dot) on relay.
2. On the phone's portrait view, tap the Chat tab. The expand-to-landscape button disappears from the top-right. Tap back to Office — the button reappears.
3. With both desktop and phone open: type a message in the desktop chat panel. Within ~100ms (LAN) it appears in the phone's chat tail.
4. Switch from Office to Chat on the phone and back. Expand button toggle is responsive.

- [ ] **Step 4: Nothing to commit unless QA surfaced an issue.** If manual QA exposes a bug, fix it + add a regression test + amend the appropriate task's commit (or add a small follow-up commit) before merging.

---

## Spec Coverage Checklist

| Spec requirement | Task(s) |
|---|---|
| Desktop SEND_MESSAGE no-op → forward to mobile bridge with `source:'desktop'` | 1 |
| Do NOT route desktop user messages through `sendChat` (avoid double-render) | 1 |
| Fullscreen button gated by tab — hidden on Chat | 2 (component), 3 (route), 4 (wire), 5 (emit), 6 (bundle) |
| New `activeTab` postMessage type (webview → shell) | 3 (route), 5 (emit) |
| Webview bundle rebuild + commit | 6 |
| Mobile `ConnectionPill` always visible with Local/Remote badge | 7 |
| "LAN" → "Local" on desktop header pill + popover + settings | 8, 9 |
| "Relay" → "Remote" on desktop Settings relay-status labels | 9 |
| Protocol internal field names (`mode: 'lan' \| 'relay'`) unchanged | (implicit — Tasks 7/8/9 change display strings only) |
| Landscape-mode UI unchanged | 2, 4 (no landscape-layout edits) |
| No regressions to existing mobile/desktop behavior | 10 (QA) |
