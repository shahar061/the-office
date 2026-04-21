# Mobile Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two small mobile-companion fixes: (1) agent sprites render on mobile even when the phone is connected via Remote (relay), and (2) the persistent Local/Remote pill is visible in portrait mode on mobile.

**Architecture:** Item 1 changes one Zustand selector in the desktop renderer to derive connected-device count from the per-device `mode` field (which already reflects both LAN and relay) instead of the LAN-only `connectedDevices` count. Item 2 swaps `ConnectionBanner` for `ConnectionPill` inside `PortraitOverlays` — a drop-in change since `ConnectionPill` already renders every transport state including connected-Local / connected-Remote.

**Tech Stack:** TypeScript, React (desktop renderer), Expo/React Native (mobile shell), Vitest for desktop tests, Jest + @testing-library/react-native for mobile tests.

**Spec:** `docs/superpowers/specs/2026-04-21-mobile-quick-wins-design.md`

---

## File Structure

**Item 1 — Sprite gate fix:**
- Modify: `src/renderer/src/stores/mobile-bridge.store.ts` — add a named helper `selectMobileConnectedCount(status)` that derives the count from the per-device `mode` field.
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx:130-132` — use the helper.
- Test: `src/renderer/src/stores/__tests__/mobile-bridge.store.test.ts` (new) — unit-test the helper.

**Item 2 — Portrait `ConnectionPill`:**
- Modify: `mobile/src/session/PortraitLayout.tsx` — swap `ConnectionBanner` for `ConnectionPill` in `PortraitOverlays`.
- Test: `mobile/src/__tests__/PortraitOverlays.test.tsx` — add one new assertion for connected-Remote rendering.

---

## Task 1: Sprite gate — extract `selectMobileConnectedCount` helper + use in OfficeView

**Files:**
- Modify: `src/renderer/src/stores/mobile-bridge.store.ts` — add named export `selectMobileConnectedCount`.
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx:130-132` — call the helper.
- Test: `src/renderer/src/stores/__tests__/mobile-bridge.store.test.ts` (new).

**Intent:** The existing selector reads `status.connectedDevices`, which is `server.getConnectedCount()` — LAN-authenticated WS connections only. Relay-connected phones aren't counted, so `useCharStream`'s gate (`mobileConnectedCount < 1`) blocks the 10 Hz broadcast and sprites never appear on a Remote-only phone. Fix: extract a pure helper `selectMobileConnectedCount(status)` that filters `status.devices` by `mode !== 'offline'`, and use it as the OfficeView selector. Extracting the helper makes this genuine TDD — the test imports the named export and fails until the export exists.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/stores/__tests__/mobile-bridge.store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectMobileConnectedCount } from '../mobile-bridge.store';

type Device = {
  deviceId: string;
  deviceName: string;
  mode: 'lan' | 'relay' | 'offline';
  lastSeenAt: number;
  remoteAllowed: boolean;
};

function statusWith(devices: Device[]) {
  return {
    running: true, port: 0, connectedDevices: 0, pendingSas: null,
    v1DeviceCount: 0, relay: 'ready' as const, relayPausedUntil: null,
    lanHost: null, devices,
  };
}

describe('selectMobileConnectedCount', () => {
  it('returns 0 when status is null', () => {
    expect(selectMobileConnectedCount(null)).toBe(0);
  });

  it('returns 0 when no devices are present', () => {
    expect(selectMobileConnectedCount(statusWith([]))).toBe(0);
  });

  it('counts a LAN-connected device', () => {
    expect(selectMobileConnectedCount(statusWith([
      { deviceId: 'a', deviceName: 'A', mode: 'lan', lastSeenAt: 1, remoteAllowed: false },
    ]))).toBe(1);
  });

  it('counts a Remote-connected device (regression guard for the sprite bug)', () => {
    expect(selectMobileConnectedCount(statusWith([
      { deviceId: 'a', deviceName: 'A', mode: 'relay', lastSeenAt: 1, remoteAllowed: true },
    ]))).toBe(1);
  });

  it('ignores offline devices; counts mixed lan+relay+offline correctly', () => {
    expect(selectMobileConnectedCount(statusWith([
      { deviceId: 'a', deviceName: 'A', mode: 'lan', lastSeenAt: 1, remoteAllowed: false },
      { deviceId: 'b', deviceName: 'B', mode: 'relay', lastSeenAt: 1, remoteAllowed: true },
      { deviceId: 'c', deviceName: 'C', mode: 'offline', lastSeenAt: 1, remoteAllowed: true },
    ]))).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/stores/__tests__/mobile-bridge.store.test.ts`
Expected: FAIL — `selectMobileConnectedCount is not exported from mobile-bridge.store`.

- [ ] **Step 3: Add the helper to the store file**

Edit `src/renderer/src/stores/mobile-bridge.store.ts`. Below the `MobileStatus` interface and above the `MobileBridgeState` interface (so the helper is co-located with the type it operates on), add:

```ts
/**
 * Number of paired mobile devices currently connected via any transport
 * (LAN or relay). `status.connectedDevices` is LAN-only (it comes from
 * `server.getConnectedCount()` in the main process), so using it would
 * miss Remote-only phones and block the desktop's 10 Hz char-state
 * broadcast that drives sprite rendering on mobile. This helper derives
 * the full count from the per-device `mode` field which already reflects
 * both transports.
 */
export function selectMobileConnectedCount(status: MobileStatus | null): number {
  return (status?.devices ?? []).filter((d) => d.mode !== 'offline').length;
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npx vitest run src/renderer/src/stores/__tests__/mobile-bridge.store.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Wire the helper into OfficeView**

Edit `src/renderer/src/components/OfficeView/OfficeView.tsx`.

Add the import near the other store imports at the top of the file (grep for `useMobileBridgeStore` to find its existing import line; extend that line or add a sibling import):

```ts
import { useMobileBridgeStore, selectMobileConnectedCount } from '../../stores/mobile-bridge.store';
```

Replace the current selector block (around lines 130-132):

```ts
  const mobileConnectedCount = useMobileBridgeStore(
    (s) => s.status?.connectedDevices ?? 0,
  );
```

with:

```ts
  const mobileConnectedCount = useMobileBridgeStore(
    (s) => selectMobileConnectedCount(s.status),
  );
```

No other changes in the file.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: **762 + 5 = 767** tests pass.

TypeScript: `npx tsc --noEmit 2>&1 | grep -E "OfficeView|mobile-bridge.store"`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/stores/mobile-bridge.store.ts src/renderer/src/stores/__tests__/mobile-bridge.store.test.ts src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "fix(office-view): count LAN+relay devices in mobileConnectedCount"
```

---

## Task 2: Portrait `ConnectionPill` — swap for `ConnectionBanner`

**Files:**
- Modify: `mobile/src/session/PortraitLayout.tsx`
- Test: `mobile/src/__tests__/PortraitOverlays.test.tsx`

**Intent:** `PortraitOverlays` renders `ConnectionBanner` in the `bannerSlot` — which hides when connected, so in the happy path the user sees no transport indicator in portrait. `ConnectionPill` (post–mobile-polish-batch) renders every state including connected-Local / connected-Remote. Swap the component in place; the slot positioning stays the same.

- [ ] **Step 1: Write the failing test**

Open `mobile/src/__tests__/PortraitOverlays.test.tsx`. Add a new `it` at the end of the existing `describe('PortraitOverlays — expand button gating', ...)` block:

```tsx
  it('renders the Local/Remote pill when connected (pill visible in portrait)', () => {
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 300, height: 600 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
        <PortraitOverlays
          status={{ state: 'connected', desktopName: 'D', mode: 'relay' }}
          onExpand={() => {}}
          activeTab="office"
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('Remote')).not.toBeNull();
  });
```

The existing imports at the top of the test file (`render, screen`, `SafeAreaProvider`, `PortraitOverlays`) already cover what's needed. The current `describe`'s shared `renderWith` helper hardcodes `mode:'lan'` so it isn't reusable for the Remote check — a direct `render(...)` call is cleaner.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/__tests__/PortraitOverlays.test.tsx`
Expected: FAIL — the current `PortraitOverlays` renders `ConnectionBanner` which returns `null` when `state === 'connected'`, so `screen.queryByText('Remote')` returns `null` and the assertion fails.

- [ ] **Step 3: Swap `ConnectionBanner` for `ConnectionPill`**

Edit `mobile/src/session/PortraitLayout.tsx`:

1. Replace the import (around line 15):

```ts
// Before
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
// After
import { ConnectionPill } from '../webview-host/ConnectionPill';
```

2. Inside `PortraitOverlays`, replace the `<ConnectionBanner>` element (around line 37):

```tsx
// Before
<ConnectionBanner status={status} />
// After
<ConnectionPill status={status} />
```

No other changes in the file. Leave the `overlayStyles.bannerSlot` container, `paddingTop: insets.top`, and the slot's `pointerEvents="box-none"` unchanged — the pill is compact and non-interactive (children of bannerSlot don't need to receive touches), so pass-through to the canvas below remains correct.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/__tests__/PortraitOverlays.test.tsx`
Expected: all 3 tests pass (2 existing + 1 new).

Full mobile jest: `cd mobile && npx jest`
Expected: **46 + 1 = 47** tests pass.

Mobile TypeScript: `cd mobile && npx tsc --noEmit 2>&1 | grep "PortraitLayout\|ConnectionBanner\|ConnectionPill" | head`
Expected: no new errors. An "unused import" lint warning on the old `ConnectionBanner` would only appear if we forgot to replace it — we did, so this should be clean.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/PortraitLayout.tsx mobile/src/__tests__/PortraitOverlays.test.tsx
git commit -m "feat(mobile-layout): show ConnectionPill in PortraitOverlays"
```

---

## Task 3: End-to-end validation

**Files:** None — validation only.

- [ ] **Step 1: Full suites**

```bash
npx vitest run
cd mobile && npx jest && cd ..
```

Expected counts:
- Root vitest: **767** (762 baseline + 5 new from Task 1).
- Mobile jest: **47** (46 baseline + 1 new from Task 2).

If any test fails, STOP and diagnose. Do not continue.

- [ ] **Step 2: Manual QA — desktop + Remote-connected phone**

1. Start the desktop dev app with a phone paired and connected via Remote (relay).
2. Confirm the header pill reads `● <phone> · Remote`.
3. Open a project. Watch the desktop office canvas — agents walk around, run tools. Check the phone:
   - Before the fix (baseline): phone's Office tab shows the map and overlays but NO character sprites.
   - After the fix: phone's Office tab shows sprites moving in sync with the desktop (within the 10 Hz broadcast cadence, so ~100 ms latency).
4. Rotate the phone to landscape. Confirm the existing landscape `ConnectionPill` still reads "Remote" (regression check).

- [ ] **Step 3: Manual QA — portrait pill**

1. With the phone in portrait, confirm the `ConnectionPill` is visible at the top:
   - Connected via LAN → green dot, "Local".
   - Connected via Remote → indigo dot, "Remote".
2. Toggle the desktop app off for 5 seconds. Pill should switch to "Offline — socket-close" (or similar), red-ish dot.
3. Toggle desktop back on. Pill should reconnect: "Connecting" → "Local"/"Remote".

- [ ] **Step 4: Nothing to commit unless QA surfaced an issue.**

---

## Spec Coverage Checklist

| Spec requirement | Task(s) |
|---|---|
| Sprites render on mobile when phone is connected via LAN | 1 (pre-existing path; the fix doesn't regress it — regression guard in step 1 tests the LAN case) |
| Sprites render on mobile when phone is connected via Remote (relay) | 1 |
| Local/Remote pill visible in portrait mode | 2 |
| No bridge/protocol/transport/relay-worker changes | 1, 2 (only a renderer selector + a mobile component swap) |
| Reuses existing `mode: 'lan' \| 'relay' \| 'offline'` field | 1 (implicit — the new selector reads `d.mode`) |
| `ConnectionBanner.tsx` not deleted (kept as unused) | 2 (swap-in-place; file left on disk) |
| No chat-history work in this spec | All (out of scope per Non-Goals) |
| No changes to transport, crypto, or relay | All (only two renderer files touched) |
