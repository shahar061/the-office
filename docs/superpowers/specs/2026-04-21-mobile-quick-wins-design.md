# Mobile Quick Wins — Design

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

Two small mobile-companion issues surfaced after the per-session pairing and mobile-polish batches:

1. **Agent sprites don't render on mobile when the phone is connected via Remote (relay).** The desktop's 10 Hz character-state broadcast is gated on `mobileConnectedCount < 1` (`src/renderer/src/hooks/useCharStream.ts:15`), and the `mobileConnectedCount` is derived from `status.connectedDevices` — which is `server.getConnectedCount()` in `electron/mobile-bridge/ws-server.ts`, counting only LAN-authenticated connections. Relay-connected phones are invisible to this gate, so char states never broadcast and the mobile canvas shows an empty office.

2. **The persistent Local / Remote connection badge is not visible in portrait mode on the phone.** The spec for the previous mobile-polish batch intended "always-visible Local/Remote badge on both apps," but on the phone `ConnectionPill` is only rendered from `LandscapeLayout.tsx`. In portrait, `PortraitOverlays` renders `ConnectionBanner` instead, which hides in the connected state. The user only sees the badge after rotating to landscape.

## Goals

1. On LAN or Remote, when a paired phone is connected, agent sprites render on the mobile canvas in sync with the desktop.
2. In portrait mode on mobile, the Local / Remote (or connecting / offline / etc.) pill is always visible.
3. No changes to the bridge interface, transport layer, or relay worker.

## Non-Goals

- Deleting `ConnectionBanner.tsx` (keep as unused; removal is a future cleanup, not this spec).
- Any chat-history or phase-navigation work (tracked as Spec C1 / C2).
- Any change to transport layer, crypto, relay, or pairing flow.
- Adding a new protocol field. The fix reuses the existing per-device `mode: 'lan' | 'relay' | 'offline'` already on `MobileStatus.devices[]`.

## Design

### Item 1 — Sprite gate fix

**Change location:** `src/renderer/src/components/OfficeView/OfficeView.tsx:130-132`.

Current selector:

```ts
const mobileConnectedCount = useMobileBridgeStore(
  (s) => s.status?.connectedDevices ?? 0,
);
```

`status.connectedDevices` counts only LAN-authenticated WS connections — relay-connected devices are absent from this count. Replace the selector with one that counts any device whose mode is not `'offline'`:

```ts
const mobileConnectedCount = useMobileBridgeStore(
  (s) => (s.status?.devices ?? []).filter((d) => d.mode !== 'offline').length,
);
```

The per-device `mode` field is already populated in `MobileBridge.getStatus()` (`electron/mobile-bridge/index.ts`) based on both `lanAuthed` and `relayConnections.isConnected()`, so a relay-only device appears with `mode: 'relay'` in `status.devices` and the filter will count it.

`useCharStream` is unchanged — it continues to gate the 10 Hz broadcast on `mobileConnectedCount >= 1`. The broadcast path in `bridge.onCharStates` already fans out to both LAN (via `server.broadcastCharState`) and relay (via the explicit `relayConnections.sendMessage` loop), so once the gate lifts, Remote-connected phones receive char states naturally.

### Item 2 — Portrait `ConnectionPill`

**Change location:** `mobile/src/session/PortraitLayout.tsx` — `PortraitOverlays` component.

Replace `ConnectionBanner` with `ConnectionPill` inside the `bannerSlot`:

```tsx
// import
import { ConnectionPill } from '../webview-host/ConnectionPill';
// ...
<View style={[overlayStyles.bannerSlot, { paddingTop: insets.top }]} pointerEvents="box-none">
  <ConnectionPill status={status} />
</View>
```

Remove the `ConnectionBanner` import. Leave the `bannerSlot` container, its absolute positioning, and `paddingTop: insets.top` unchanged — same slot, different content.

`ConnectionPill` (after the mobile-polish-batch merge) renders every transport state in one compact pill: green-dot "Local" when `mode:'lan'`, indigo-dot "Remote" when `mode:'relay'`, "Connecting" / "Offline — <reason>" / "Error" / "Idle" otherwise. So replacing the banner is a drop-in.

Visual placement within the slot: the pill sits at top-center by default. If the visual feels off after the swap, nudge `alignItems: 'center'` on the slot during implementation — noted but not pre-decided here.

`ConnectionBanner.tsx` becomes unused after this change. Keep the file in place — out of scope to delete.

## Testing

Two small test additions, existing harnesses:

1. **Sprite gate selector** — new vitest test proving the derivation from the devices array:
   - `devices = []` → 0.
   - One `mode:'lan'` → 1.
   - One `mode:'relay'` → 1 (regression guard for the bug).
   - Mixed: one `'lan'` + one `'relay'` + one `'offline'` → 2.

   The derivation is small enough to unit-test inline (export a helper or pass a deriving function to `useCharStream`). Simplest: add a pure helper next to the store selector — e.g., in a small test file that exercises the shape of the input and the numeric output. Alternative: test `useCharStream` with a stubbed `useMobileBridgeStore` — heavier but closer to the call site.

2. **Portrait pill render** — update `mobile/src/__tests__/PortraitOverlays.test.tsx`:
   - Add one new `it` asserting that when `status` is `{ state: 'connected', mode: 'relay', desktopName: 'D' }`, the rendered tree contains the text "Remote" (proving the pill is present and fed the status).
   - Existing gating tests (`activeTab='office'` / `activeTab='chat'`) stay unchanged.

## Scope

**In scope:**
- `src/renderer/src/components/OfficeView/OfficeView.tsx` — selector change (item 1).
- `mobile/src/session/PortraitLayout.tsx` — ConnectionBanner → ConnectionPill swap (item 2).
- Test additions as above.

**Out of scope:**
- Deleting `mobile/src/webview-host/ConnectionBanner.tsx`.
- Any change to `MobileBridge.getStatus()`, `WsServer.getConnectedCount()`, `useCharStream`, relay/LAN transports, or the Cloudflare Worker.
- Chat history / cross-phase navigation (Spec C1 / C2).

## Risks & Open Questions

- **The `mode` field on `MobileStatus.devices[]` is derived at `getStatus()` call time.** In a race between the relay connect event and the first `getStatus()` that the renderer receives, a freshly-connected relay device could briefly appear as `offline`. The 10 Hz char-broadcast gate would stay off until the next status push. In practice, `MobileBridge.onChange` fires on every relay connect/disconnect (`electron/mobile-bridge/index.ts`, the `RelayConnection` `'connect'` handler calls `baseNotifyChange()`), so the renderer receives an updated status within one event loop turn. No sprite delay beyond existing bridge notification latency.
- **`ConnectionPill` in the `bannerSlot` shares the slot's `pointerEvents="box-none"`.** The pill itself is non-interactive (just a dot + text), so tap-through to the canvas below still works. Confirmed by the pill's existing structure in `ConnectionPill.tsx`.
- **`ConnectionBanner` deletion deferred.** If a later pass reuses it, fine. If not, a tidy-up spec can delete the file — cheap.
