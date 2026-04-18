# Desktop / Mobile Canvas State Parity — Design

**Status:** design approved, pending user review
**Target:** `electron/` (main + renderer) + `mobile/` + `shared/` + `src/mobile-renderer/`
**Scope chosen:** B — Visual-state parity. Same positions, direction, animation frame, fade lifecycle, tool-bubble text. Camera stays viewport-local. Warroom choreography is out of scope.
**Related:** prior spec — `2026-04-18-mobile-layout-fullscreen-design.md` (layout / fullscreen mode)

---

## Problem

Today, the mobile WebView and the desktop renderer independently simulate character positions and animations. Both sides compute wander paths, pick random tiles, and animate sprites using the same code — but with uncoordinated random-number streams. Within seconds of a session starting, the same agent is in different tiles on desktop vs. mobile, facing different directions, playing different frames of the walk cycle.

The user wants: **"If I see a sprite walking on the canvas I want to see the exact same thing in the mobile."** The sprites should visually mirror what the desktop canvas is rendering.

### Concrete divergences observed

- **Wander loops** — both sides pick random tiles every 3–8 s. Same logic, different RNG state ⇒ different sprites in different tiles.
- **Tool bubbles** — desktop shows `Read → src/foo.ts`; mobile shows a generic "…" based on activity.
- **Facing direction** — computed locally during walk, not synced.
- **Fade in/out lifecycle** — desktop uses 0.5–1 s alpha fade; mobile snaps visibility on snapshot change.
- **Dead data** — `CharacterSnapshot.x`/`y` are serialized over the wire but never read by mobile.

## Goals

- Mobile canvas visually mirrors the desktop canvas within ~100 ms latency.
- Zero independent simulation on mobile — desktop is authoritative for every position, direction, animation, tool bubble, and fade.
- Minimal protocol extension — one new `MobileMessageV2` variant; no new encryption / auth / transport work.
- Preserve the chat channel intact (phone → desktop chat, `AskUserQuestion` answering, `/imagine` kickoff) — untouched by this work.

## Non-Goals

- **Warroom choreography** (PM / TL walks to the table, clone spawning, monitor glow). These are scene-only on desktop and stay that way. A future spec can extend the protocol with position deltas that would include clones for free, but explicit choreography events (monitor glow, decorator states) are not shipped.
- **Phase-based camera focus.** The mobile camera fits its own portrait or landscape viewport; it doesn't track `imagine` / `warroom` / `build` zones like the desktop does.
- **Interactive object reveal animations** (artifacts, war table) — mobile has no clickable artifacts.
- **Multi-session time travel / replay.** No way to "rewind" the canvas.
- **Tile-level collision re-validation on mobile.** Position is trusted; no map re-checking.

## Architecture

Desktop is authoritative; mobile is a pure viewer. `OfficeScene` continues to simulate locally at 60 Hz. A new `PositionStreamer` samples visible character state every 100 ms (10 Hz) and pushes the snapshot through the existing `mobileBridge` fan-out. Mobile receives the frame, stores it in a new store slice, and interpolates each character's rendered position toward the latest target each frame.

```
Desktop (Electron renderer)                              Mobile (Expo + WebView)
┌──────────────────────┐                                 ┌────────────────────────┐
│  OfficeScene (60Hz)  │                                 │  MobileScene (60Hz)    │
│  owns positions /    │                                 │  viewer only           │
│  wander / choreog.   │                                 │  lerp to target        │
└──────────┬───────────┘                                 └───────────▲────────────┘
           │ getCharacterStates()                                    │ applyDrivenState(dt)
           │ every 100ms                                             │
           ▼                                                         │
┌──────────────────────┐                                 ┌───────────┴────────────┐
│  useCharStream hook  │                                 │  session.store         │
│  renderer-side       │                                 │  characterStates: Map  │
└──────────┬───────────┘                                 └───────────▲────────────┘
           │ IPC: OFFICE_CHAR_STATES                                 │ applyCharState(ts, states)
           ▼                                                         │
┌──────────────────────┐    wire: encrypted WSS / LAN    ┌───────────┴────────────┐
│  mobileBridge (main) │ ──────────────────────────────▶ │  useSession (RN)       │
│  onCharStates(...)   │    { type:'charState', v:2,     │  → WebViewHost forward │
└──────────────────────┘      ts, characters:[...] }     └────────────────────────┘
```

### Key decisions

1. **Authority model: desktop-only.** No seeded-RNG replay, no intent-based event stream, no shared scene module. Mobile stops simulating entirely and becomes a view layer. Drift is impossible by construction.
2. **Broadcast rate: 10 Hz fixed.** One frame per 100 ms. Bandwidth is ~5 KB/s typical, ~18 KB/s peak — trivial over LAN, acceptable over mobile data.
3. **Interpolation smooths 10 Hz → 60 Hz render.** Mobile lerps `position` and `alpha` toward the latest target over ~100 ms. `direction` / `animation` / `visibility` / `toolBubble` snap immediately.
4. **Frame coalescing.** `PerConnectionQueue` on the bridge treats `charState` as a bounded buffered type — if the peer is slow, stale frames drop and only the latest is delivered. No stale-snowball.
5. **Hook-gated broadcast.** The `useCharStream` hook starts its interval only when (scene is initialized) AND (≥ 1 mobile peer is connected). No burning CPU broadcasting into the void.

## Protocol

### New `CharacterState` interface

```ts
// shared/types/mobile.ts
export interface CharacterState {
  agentId: string;

  // Position — pixel coordinates, float OK
  x: number;
  y: number;

  // Visual state
  direction: 'up' | 'down' | 'left' | 'right';
  animation: 'idle' | 'walk' | 'read' | 'type';

  // Lifecycle
  visible: boolean;
  alpha: number;  // 0..1

  // Tool bubble — replaces today's crude "..." on activity='waiting'
  toolBubble: { toolName: string; target?: string } | null;
}
```

### New `charState` message variant

```ts
// shared/types/mobile.ts — extends MobileMessageV2
| {
    type: 'charState';
    v: 2;
    ts: number;               // desktop monotonic ms — for ordering + debug
    characters: CharacterState[];  // only visible characters
  }
```

Travels through the same encrypted envelope as `snapshot` / `event` / `chatFeed` / `state` / `chatAck` / `tokenRefresh`. No relay worker changes needed.

### Frequency + bandwidth

- **10 Hz** broadcast. 100 ms period.
- Only `visible: true` characters included.
- Typical: 3–5 visible × ~120 B JSON = ~500 B × 10 = **~5 KB/s**.
- Peak: 15 visible × ~120 B = ~1.8 KB/frame × 10 = **~18 KB/s**.
- Hourly: ~20–65 MB wire traffic. Acceptable.

### Interaction with `SessionSnapshot.characters` (existing)

`SessionSnapshot.characters[]` stays at its coarse shape (`agentId, agentRole, activity`) for:
- Initial hydrate before any `charState` arrives
- Cache persistence (`saveLastKnown`)
- Chat-tab rendering (doesn't need live positions)

The `x` / `y` fields on `CharacterSnapshot` (currently dead code on mobile) are **removed** — they conveyed nothing useful.

### Ordering + edge cases

- `ts` is desktop monotonic ms. Mobile tracks `lastCharStateTs` and drops any frame with `ts <= lastCharStateTs`.
- **Network gap** — last-known state stays intact; characters freeze at last target. No extrapolation.
- **Reconnect after long drop** — first frame after gap triggers snap (no lerp) if delta > 100 px; subsequent frames interpolate.
- **Character first appears** — mobile spawns Character instance with target's x/y, alpha: 0; lerps alpha up over subsequent frames as desktop fades in.
- **Character disappears** — desktop stops including `agentId` once alpha reaches 0. Mobile keeps one "grace" frame, then removes from scene graph.

## Desktop Changes

### Files

**`shared/types/mobile.ts`**
- Add `CharacterState` interface
- Add `charState` variant to `MobileMessageV2`
- Remove `x` and `y` from `CharacterSnapshot`

**`shared/types/ipc.ts`**
- Add `OFFICE_CHAR_STATES: 'office:char-states'` channel constant

**`src/renderer/src/office/characters/Character.ts`**
- New method `getState(): CharacterState` reading `agentId`, `px`, `py`, `direction`, `currentAnim`, `isVisible`, `container.alpha`, `toolBubble.getPublicState()`
- New method `applyDrivenState(target: CharacterState, dt: number): void` — used on mobile only, left unused on desktop
- Lerp helper: `lerp(a, b, t) = a + (b - a) * clamp(t, 0, 1)`
- In `applyDrivenState`:
  - If `|target.x - this.px| > 100` OR `|target.y - this.py| > 100` → snap (assign directly). Else lerp both with `t = min(1, dt / 0.1)`.
  - `container.alpha` → lerp toward `target.alpha` with same `t`
  - `direction`, `animation` (via `setAnimation`), `visible`, `toolBubble` → snap immediately

**`src/renderer/src/office/characters/ToolBubble.ts`**
- Add `getPublicState(): { toolName: string; target?: string } | null`
- Add `setTarget(state: { toolName: string; target?: string } | null): void` — for mobile driving

**`src/renderer/src/office/OfficeScene.ts`**
- New method `getCharacterStates(): CharacterState[]` — iterates `characters` Map, filters by `isVisible`, returns `c.getState()` for each

**`src/renderer/src/hooks/useCharStream.ts`** (new)
- Hook parameters: `sceneRef: RefObject<OfficeScene | null>`, `mobileConnectedCount: number`
- When both conditions are met, sets a `setInterval(() => sceneRef.current?.getCharacterStates() |> window.office.broadcastCharStates, 100)`
- Returns nothing; cleanup clears the interval on effect teardown or condition change

**`electron/preload.ts`**
- Expose `broadcastCharStates: (states: CharacterState[]) => ipcRenderer.send(IPC_CHANNELS.OFFICE_CHAR_STATES, states)`

**`electron/ipc/state.ts` (or a new `char-state-handlers.ts` in `electron/ipc/`)**
- One `ipcMain.on(IPC_CHANNELS.OFFICE_CHAR_STATES, (_e, states) => mobileBridgeRef?.onCharStates(states))` registration

**`electron/mobile-bridge/index.ts`**
- Add to the `MobileBridge` interface: `onCharStates(states: CharacterState[]): void`
- Implementation: builds `{ type: 'charState', v: 2, ts: Date.now(), characters: states }` and broadcasts through:
  - LAN path: `wsServer.broadcast(frame)` (existing fan-out)
  - Relay path: each `relayConnection.sendMessage(frame)`

**`electron/mobile-bridge/snapshot-builder.ts`**
- Remove `x` and `y` from the built `CharacterSnapshot` (no replacement — they were dead code)
- Keep `classifyActivity`, the coarse `activity` field, the rest of `SessionSnapshot`

**`electron/mobile-bridge/per-connection-queue.ts`**
- Add `charState` to the set of buffered types (coalescing queue)
- If queue is full and a new `charState` arrives, drop the oldest `charState` (bounded staleness)

**`electron/mobile-bridge/ws-server.ts`**
- Wire `charState` through the same `sendEncrypted(conn, frame)` path used by `snapshot` / `event` / `chatFeed`

## Mobile Changes

### Files

**`shared/stores/session.store.ts`** — new slice
- `characterStates: Map<string, CharacterState>` (keyed by agentId)
- `lastCharStateTs: number`
- `applyCharState(ts: number, states: CharacterState[]): void` — drops if `ts <= lastCharStateTs`; otherwise replaces Map and updates ts
- `clearCharStates(): void` — called on pairing lost / disconnect

**`mobile/src/session/useSession.ts`**
- Extend the `transport.on('message', m => {...})` switch with one case:
  ```ts
  case 'charState':
    store.applyCharState(m.ts, m.characters);
    break;
  ```

**`mobile/src/webview-host/WebViewHost.tsx`**
- Subscribe to `useSessionStore` selector for `characterStates`
- On change, forward to the WebView via `webViewRef.current?.postMessage(JSON.stringify({ type: 'charState', v: 2, ts, characters: [...states.values()] }))`

**`src/mobile-renderer/bridge.ts`**
- Handle incoming `charState` messages from the host: `case 'charState': useSessionStore.getState().applyCharState(m.ts, m.characters); break;`

**`src/mobile-renderer/MobileScene.ts`** — big refactor
- Keep: tileset loading, map rendering, character sprite creation (`new Character(...)` per agent), tool-bubble container setup.
- **Remove:** `wanderBounds` on Character (no more local wander), any internal `moveTo` / `walkToAndThen` path driving. Wander timer tick is skipped entirely on mobile.
- **Replace** the existing `app.ticker.add(() => ...)` tick with:
  ```ts
  this.app.ticker.add(() => {
    const states = useSessionStore.getState().characterStates;
    const dt = this.app.ticker.deltaMS / 1000;
    for (const [agentId, target] of states) {
      const character = this.characters.get(target.agentId);
      if (character) character.applyDrivenState(target, dt);
    }
    // spawn new characters that appear in states but aren't yet on scene
    for (const [agentId, target] of states) {
      const character = this.characters.get(target.agentId);
      if (character && !character.isVisible && target.visible) {
        character.repositionTo(target.x, target.y);
        character.show(this.characterLayer);
      }
    }
    // fade out + remove characters no longer in states
    for (const [role, character] of this.characters) {
      if (!states.has(role) && character.isVisible) {
        character.hide(500);  // existing fade-out path
      }
    }
  });
  ```
- **Keep** `getEntrancePosition()` and initial Character construction, but wander-bound constraints become irrelevant (positions come from the wire).

## Error handling

- **Malformed `charState` frame** — `applyCharState` validates `ts` is a number and `characters` is an array; else silent drop + one warning log per session.
- **IPC failure (renderer → main)** — `ipcRenderer.send` is fire-and-forget; dropped frames are tolerated (10 Hz means the next one arrives in 100 ms).
- **Mobile bridge is stopped** — `mobileBridge.onCharStates` no-ops (defensive, matches `onAgentEvent` pattern).
- **Interpolation divergence** — `lerp` clamp prevents oscillation; large deltas snap.
- **Store state on disconnect** — `useSession` teardown calls `clearCharStates()` so mobile doesn't render stale ghosts during reconnect attempts.

## Testing Strategy

### Automated

**`shared/stores/__tests__/session.store.test.ts`** (new)
- `applyCharState` replaces Map with keyed states
- Drops frames where `ts <= lastCharStateTs`
- Updates `lastCharStateTs` on accept
- `clearCharStates` empties Map and resets ts

**`mobile/src/__tests__/useSession.test.ts`** (extend)
- One test: `charState` message applies via `applyCharState(ts, characters)`

**`src/renderer/src/office/characters/__tests__/Character.test.ts`** (new)
- `getState()` returns correct shape
- `applyDrivenState` with delta > 100 px → snap
- `applyDrivenState` with small delta → interpolates with `t = dt/0.1`
- `applyDrivenState` direction change → immediate
- `applyDrivenState` toolBubble null ↔ populated

**`src/renderer/src/office/__tests__/OfficeScene.test.ts`** (extend or new)
- `getCharacterStates()` returns only visible characters
- Empty array when no visible characters
- Each state has correct `agentId`

**`electron/mobile-bridge/__tests__/ws-server.integration.test.ts`** (extend)
- `onCharStates([...])` broadcasts encrypted `{ type: 'charState', v: 2, ts, characters }` to all peers
- Coalescing: if two `charState` frames queue up faster than the peer drains, the older is dropped

### Manual QA (runs once at end of implementation)

1. **CEO walks** — start `/imagine`; on mobile, CEO's sprite is at the same tile as desktop within ~200 ms; walk animation matches.
2. **Agent spawning** — new agent appears; same fade-in duration on both.
3. **Tool bubble text** — desktop shows `Read → src/foo.ts`; mobile shows the same text.
4. **Activity transitions** — agent transitions `walk` → `type` at desk; mobile reflects within ~300 ms.
5. **Network drop mid-walk** — mobile sprite freezes; no off-screen drift.
6. **Long reconnect (15 s)** — first frame after reconnect snaps sprites to desktop-current positions (no slow glide).
7. **Phase transition** — `/warroom` → mobile sees gap, then resumes with correct positions.
8. **Character exit** — sprite fades out simultaneously on desktop and mobile.
9. **Two phones paired at once** — both see identical positions. (Skip if single device.)
10. **Mobile backgrounded 30 s** — return; sprites are at current desktop positions, not 30 s behind.

### Not tested

- Frame-perfect timing — mobile is always ~50-200 ms behind desktop by design.
- Visual smoothness of interpolation — subjective, covered by manual QA.

## Implementation Order (preview for writing-plans)

1. Shared types (`CharacterState`, `charState` message variant, `OFFICE_CHAR_STATES` IPC channel; remove `x`/`y` from `CharacterSnapshot`).
2. Session store slice (`characterStates` + `applyCharState` + `clearCharStates` + tests).
3. `Character.getState()` + `ToolBubble.getPublicState()` + tests.
4. `Character.applyDrivenState()` + tests (snap/lerp/direction/animation/toolBubble).
5. `OfficeScene.getCharacterStates()` + test.
6. Renderer `useCharStream` hook + preload `broadcastCharStates` + main IPC handler.
7. `mobileBridge.onCharStates` + `per-connection-queue` coalescing for `charState` + `ws-server` wire-up + test.
8. `useSession` charState case + test.
9. `WebViewHost` forwarding subscription.
10. `src/mobile-renderer/bridge.ts` charState dispatch.
11. `MobileScene` refactor — strip wander, drive from store, handle spawn/despawn.
12. Manual QA checklist.

Writing-plans will turn this into bite-sized tasks with exact code and TDD steps.
