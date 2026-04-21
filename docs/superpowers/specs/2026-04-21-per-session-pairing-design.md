# Per-Session Pairing Scope — Design

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

Today the mobile companion is "paired forever" to a desktop. Pairing is independent of whether the desktop is in the Lobby (session picker) or the Office (inside a project). When the desktop is in the Lobby, the phone still renders its session screen — with a stale or empty snapshot — which feels broken.

We want the phone's live mirror to be scoped to an actual desktop session. While the desktop is in the Lobby, the phone should present an intentional idle state instead of a broken session screen.

## Goals

1. Cryptographic trust remains permanent (one-time QR + SAS ritual). Users do not re-pair per session.
2. The phone renders a live session only while the desktop is inside a session. Returning to the Lobby takes the phone to an intentional idle state.
3. Switching sessions on the desktop causes the phone to auto-rejoin the new session without re-scanning.
4. Re-entry to a session always hydrates the phone from scratch — no cached tail, no archived runs, no waiting state bleeds across the idle boundary.
5. First-time pairing is always performed from inside a session, so the user's first phone screen after pairing is a real live session.
6. Existing trusted devices keep working with zero migration action.

## Non-Goals

- Multi-desktop switching on the phone.
- Listing recent sessions on the phone's idle screen.
- Making remote-access consent per-session (stays per-device).
- Letting the phone pick a session.
- Any change to crypto, identity, relay protocol framing, or device-store schema.

## Mental Model

Two user-facing concepts, both persisted across app launches but with very different lifetimes:

- **Trusted device** — permanent. The one-time QR + SAS ceremony establishes this. Stored in desktop `DeviceStore` and mobile `secure-store`. Unchanged from today.
- **Connected to session** — ephemeral. Exists only while the desktop is inside a session. The phone's UI branches on this state. No user-visible ceremony when it toggles.

Desktop Settings copy renames "Paired Devices" → "Trusted Devices". The phone never uses the word "paired" in its session/idle UI; it talks about being "connected to [Project]" or "waiting for [Desktop]".

## Architecture

The mobile bridge (`electron/mobile-bridge/`) keeps running for the lifetime of the desktop process. All WebSocket and relay connections remain open across the Lobby boundary. Only snapshot contents change.

A new `sessionActive` boolean on `SessionSnapshot` tells the phone whether the desktop is currently in a session. The desktop flips this flag when entering/leaving the Office screen.

```
┌─────────────────────────────────────────────────────────────┐
│ Desktop (unchanged lifecycle)                               │
│                                                             │
│ project.store ──┐                                           │
│                 ▼                                           │
│           onSessionScopeChanged({active, sessionId, ...})   │
│                 │                                           │
│                 ▼                                           │
│         MobileBridge → SnapshotBuilder.setScope()           │
│                 │                                           │
│                 ▼                                           │
│         broadcastToAuthenticated(snapshot) ────────────┐   │
└────────────────────────────────────────────────────────┼────┘
                                                         │
                             LAN WS / Relay (unchanged)  │
                                                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Mobile (branches on sessionActive)                          │
│                                                             │
│  App.tsx → SessionScreen (always mounted after loadDevice)  │
│   ├─ Welcome / QR / SAS / Consent (trust flow, unchanged)   │
│   └─ SessionScreen branches internally on sessionActive:    │
│        ├─ sessionActive=true  → WebViewHost + layouts       │
│        └─ sessionActive=false → IdleScreen (new)            │
└─────────────────────────────────────────────────────────────┘
```

## Protocol

`shared/types.ts` — additions to `SessionSnapshot` and `SessionStatePatch`:

```ts
// SessionSnapshot
sessionActive: boolean;            // false ≡ desktop in Lobby / no session
sessionId: string | null;          // null when sessionActive=false
projectName?: string;              // human-readable label for phone UI
projectRoot?: string;              // optional cwd; phone displays basename only

// SessionStatePatch
sessionActive?: boolean;
sessionId?: string | null;
projectName?: string | null;
projectRoot?: string | null;
```

No new message types. No new handshakes. No protocol version bump. The phone interprets `sessionActive=false` as "render idle screen; discard session view state." The phone treats `sessionActive=false` as authoritative and ignores any `sessionId` sent alongside it.

**Transition semantics on the desktop side (as shipped):**

- Desktop enters Office → `onSessionScopeChanged({active:true, …})` calls `SnapshotBuilder.setScope()` which clears all volatile state (chatTail, archivedRuns, waiting, character states) from the prior session, then sets `sessionActive=true` + scope fields. The bridge then broadcasts a **full** `{ type: 'snapshot', v: 2, snapshot }` frame via `broadcastToAuthenticated`. Sending the complete snapshot (rather than a patch) guarantees atomic replacement: the phone never sees a partial transition where `sessionActive` has changed but `chatTail` still contains stale data.
- Desktop returns to Lobby → same path: `setScope({active:false})` clears volatile state and nulls `sessionId`/`projectName`/`projectRoot`, then broadcasts the full snapshot. No separate patch message type is used.
- Desktop switches directly from session A → session B (via the Lobby step): phone observes two full-snapshot broadcasts — one with `sessionActive=false`, one with `sessionActive=true` for the new session. The idle→active transition triggers the "Now connected to [Project]" toast on the phone.

## Desktop Changes

1. **`SnapshotBuilder`** — currently hardcodes `sessionId = 'current'` at line 15. Parameterize it; add `sessionActive`, `projectName`, `projectRoot`. Add a `setScope({active, sessionId, projectName, projectRoot})` method that also clears tail/runs/waiting/character states when `active=false`.

2. **`MobileBridge` interface** — add a method:
   ```ts
   onSessionScopeChanged(scope:
     | { active: true; sessionId: string; projectName: string; projectRoot?: string }
     | { active: false }
   ): void
   ```
   Implementation forwards to `SnapshotBuilder.setScope` and pushes a patch via the existing `EventForwarder` path.

3. **`electron/main.ts` wiring** — subscribe to the project-state signal that already drives the Lobby/Office transition in the main process, and call `bridge.onSessionScopeChanged` when it changes. Emit one initial scope on bridge start so first-connect snapshots are correct.

4. **QR generation gating** — `bridge.getPairingQR()` becomes a no-op / rejected call when `sessionActive=false`. The IPC handler returns an error string. In the renderer, the "Pair device" button in Settings → Mobile is disabled with a tooltip ("Open a project first to pair a phone") while in the Lobby.

5. **Copy rename** — "Paired Devices" → "Trusted Devices" in `SettingsPanel/sections/mobile/PairingView.tsx` and `MobileSection.tsx`. Keep the per-device row (last-seen, remote-access toggle, revoke).

6. **No changes** to `DeviceStore` schema, relay connection logic, pairing FSM, token minting, or any crypto.

## Mobile Changes

1. **Session/idle branch inside `SessionScreen`** — rather than adding an `idle`/`session` variant to `App.tsx`'s Screen union, the branching lives entirely inside `SessionScreen`. The component calls `useSession()`, which reads `sessionActive` from the snapshot store. When `sessionActive` is `false` (or before the first snapshot arrives), `SessionScreen` early-returns `<IdleScreen/>`. When `true`, it renders the full `WebViewHost` + layout tree. This means `App.tsx` routes to `SessionScreen` as soon as `loadDevice()` succeeds — the transport connects immediately and the first snapshot from the desktop determines whether the user sees the session view or the idle view. If no device is stored, the trust flow (Welcome → QR → SAS → Consent) is unchanged.

2. **`IdleScreen` component** (`mobile/src/session/IdleScreen.tsx`):
   - Title: "Waiting for [Desktop Name]"
   - Subtitle: "Trusted device ✓"
   - Body: "Open a project on [Desktop Name] to continue." — swaps to "[Desktop Name] is offline" when the transport reports disconnected.
   - No QR scanner, no re-pair button. Settings sheet remains reachable (for revoke / debug).

3. **Session ↔ idle transitions** — `useSession` (or a thin layer above it) exposes a `sessionActive` boolean derived from the latest snapshot.
   - `true → false`: unmount `WebViewHost` entirely to enforce the fresh-reconnect contract; fade in `IdleScreen`.
   - `false → true`: mount `WebViewHost` with the fresh snapshot; show a one-shot toast "Now connected to [Project]".

4. **Offline distinction inlined into `IdleScreen`** — rather than relying on a separate `ConnectionBanner`, `IdleScreen` reads the transport `status` prop and conditionally swaps its body copy: "Open a project on [Desktop] to continue." when connected vs. "[Desktop] is offline." when disconnected. The user-visible distinction between "desktop offline" and "desktop in Lobby" is equivalent to the ConnectionBanner approach described in the original spec.

5. **Unchanged:** `secure-store`, transport (`composite.transport.ts`, `lan-ws.transport.ts`, `relay-ws.transport.ts`), pairing screens (`Welcome`/`QRScan`/`Sas`/`RemoteConsent`), `WebViewHost`, portrait/landscape layouts, orientation handling.

## Error Handling & Edge Cases

- **Transport disconnect vs. Lobby** — idle is triggered *only* by a snapshot with `sessionActive=false`. Transport-layer disconnects keep the last-known session on screen with the existing red `ConnectionBanner`. When the transport reconnects, the fresh snapshot decides idle vs. session.
- **Desktop quit mid-session** — phone shows last-known session + red banner. On desktop relaunch into Lobby, the first snapshot flips `sessionActive=false` and the phone transitions to idle. If the user re-enters the same session on desktop, the phone hydrates fresh per the protocol.
- **Defensive read** — phone treats `sessionActive=false` as authoritative and ignores any `sessionId` sent with it.
- **QR attempted in Lobby** — IPC handler returns an error; renderer's disabled button makes this unreachable through normal UI. Mobile side never hits this path because there's no QR to scan.
- **Chat send during session close** — existing transport queue flushes if the WS is still open; drops otherwise. Post-idle, no composer is rendered, so no new input is possible.
- **Legacy v1 devices (pre-`phoneIdentityPub`)** — continue to work on LAN. They do not understand `sessionActive`, but because the bridge also clears tail/runs/waiting on a Lobby transition, a v1 phone will see an empty session (strictly better than today's stale one). No forced re-pair.

## Migration

No migration step. Existing trusted devices keep working without user action. On first launch of the new build:

- Desktop: `DeviceStore` schema unchanged; `SnapshotBuilder` sends `sessionActive=true/false` as soon as the project-state signal wires up. Older mobile builds that don't understand the field will behave as today (session screen stays rendered; but tail/runs/waiting are now cleared in Lobby, so it's at least empty rather than stale).
- Mobile: new builds branch on `sessionActive`; old builds fall through to the existing session screen as today.

## Testing

Unit and integration tests, no new harnesses required.

- `SnapshotBuilder`: `setScope()` always clears volatile state (tail, archivedRuns, waiting, character states, phase, activeAgentId, sessionEnded) in both directions — `setScope({active:false})` additionally nulls `sessionId`/`projectName`/`projectRoot`; `setScope({active:true, …})` sets those fields while still clearing volatile state from the prior session.
- `MobileBridge.onSessionScopeChanged`: forwards to `SnapshotBuilder` and emits a patch through `EventForwarder`.
- `MobileBridge.getPairingQR`: rejects when scope is inactive.
- Mobile `App.tsx`: given a stored device and a snapshot with `sessionActive=true`, lands on `SessionScreen`; with `false`, lands on `IdleScreen`. Flipping the flag mounts/unmounts `WebViewHost`.
- Mobile `useSession`: exposes `sessionActive` and transitions cleanly.
- Renderer `PairingView`: QR button disabled when scope is inactive; tooltip copy present.

## Risks & Open Questions

- **Desktop project-state signal in main process** — the renderer has `project.store`, but the bridge lives in the main process. We need a small IPC or main-process project-state mirror. Complexity is low but we should confirm where the signal naturally lives before planning.
- **Toast behavior during rapid switching** — if a user hops Lobby → A → Lobby → B in seconds, the two toasts shouldn't stack. Spec: debounce toasts so only the latest idle → active transition shows.
