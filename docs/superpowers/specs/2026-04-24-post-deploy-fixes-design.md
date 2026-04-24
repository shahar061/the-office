# Post-Deploy Fixes — Design

**Date:** 2026-04-24
**Status:** Approved for planning

## Problem

Three unrelated issues surfaced after the relay stateless-nonces deploy:

1. **Mobile `PhaseTabs` covered by the phone's status bar.** The tabs bar (`.phase-tabs` in `src/mobile-renderer/style.css`) is the topmost element inside the webview but doesn't apply the `--rn-safe-top` CSS var that `WebViewHost` injects. On iOS with a notch and Android with a tall status bar, the tab labels sit behind the clock, battery, and app icons.

2. **SessionDO state is wiped by worker redeploys.** `relay/src/session-do.ts:25-26` holds `pairSignPub: Uint8Array | null` and `epoch: number` as in-memory class fields only. When `wrangler deploy` rolls out new code, the DO isolate restarts and both fields reset to their defaults (`null`, `1`). The auth path at `relay/src/session-do.ts:68-80` requires the first connect after a reset to come from the desktop (to supply `X-PairSign-Pub`). Any phone that reconnects before the desktop does gets rejected with `401 Unauthorized: first connect must be desktop` and loops on reconnect backoff. This happened immediately after the stateless-nonces deploy.

3. **Mobile shows chat from a deleted project after app launch.** `mobile/src/state/cache.ts` persists the last `SessionSnapshot` (including `chatTail`) to AsyncStorage under `'the-office.lastKnownState'`, and `mobile/src/session/useSession.ts:54-56` hydrates from it before the transport connects. If the desktop deleted the project and opened a new one while the phone was offline (or if the phone couldn't reach the relay — see issue 2), the cache still contains the previous project's chat, and the user sees ghost messages until the transport delivers a fresh snapshot.

## Goals

1. The mobile phase tabs sit below the status bar / notch on both iOS and Android.
2. Worker redeploys no longer kick paired phones with 401 errors; the desktop no longer needs to reconnect first to re-warm the DO.
3. After the desktop deletes or switches projects, the phone never shows stale chat from the prior project — even if the phone was offline during the transition.

## Non-Goals

- No mobile UI redesign. `IdleScreen` already renders correctly for `sessionActive: false` snapshots; we only need it to render on cold launch too.
- No wire-protocol change. `sessionActive`, `sessionId`, `projectRoot` are already in `SessionSnapshot` (`shared/types/session.ts:113-120`).
- No `wrangler.toml` migration — the existing `new_sqlite_classes = ["SessionDO"]` already provisions SQLite-backed storage for the DO.
- No replacement "resume chat on cold launch" UX. The phone already requests past-phase history via `getPhaseHistory` after connecting (`shared/types/session.ts` phase-history protocol).

## Fix 1 — Mobile safe-area on PhaseTabs

**Files:** `src/mobile-renderer/style.css`, `mobile/assets/webview/index.html` (rebuilt bundle).

Add `padding-top: var(--rn-safe-top, 0px);` to `.phase-tabs`. `WebViewHost` already injects the safe-area inset as a CSS custom property (`mobile/src/webview-host/WebViewHost.tsx:144-157`).

Remove the now-redundant safe-area-top from `.chat-list`, which previously was the topmost scrolling container. With `PhaseTabs` above it in the layout, `.chat-list` only needs 12px breathing room from the tabs bar and the bottom safe-area inset it already applies for the home-indicator area.

Rebuild the mobile-renderer bundle via `npm run build:mobile-all` and commit both the source CSS and the regenerated `mobile/assets/webview/index.html`.

## Fix 2 — SessionDO persistence

**File:** `relay/src/session-do.ts`.

Move `pairSignPub` and `epoch` from in-memory-only fields to DO storage, hydrated lazily on the first `fetch()` call and persisted at the two mutation points.

### API choice

Durable Object storage KV-style async API (`state.storage.get/put`) — not the synchronous SQLite API. Two scalars don't warrant a table. `Uint8Array` values are supported natively; no base64 encoding needed.

### Load

```ts
private hydrated = false;

private async hydrate(): Promise<void> {
  if (this.hydrated) return;
  const [pub, ep] = await Promise.all([
    this.state.storage.get<Uint8Array>('pairSignPub'),
    this.state.storage.get<number>('epoch'),
  ]);
  if (pub) this.pairSignPub = pub;
  if (typeof ep === 'number') this.epoch = ep;
  this.hydrated = true;
}
```

Called from the top of `fetch(req)` before any auth logic. Idempotent.

### Save

Two mutation points:

- **First-connect** (`relay/src/session-do.ts:81-83`): after `this.pairSignPub = pub;` and `this.cachedSid = sid;`, persist both `pairSignPub` and `epoch`:
  ```ts
  await this.state.storage.put('pairSignPub', pub);
  await this.state.storage.put('epoch', this.epoch);
  ```
- **Revoke** (`relay/src/session-do.ts:210`): after `this.epoch++`, persist the new value:
  ```ts
  await this.state.storage.put('epoch', this.epoch);
  ```

### Migration

No migration. Existing deployed DOs have empty storage; `hydrate()` keeps the in-memory defaults, first desktop connect populates them. This is equivalent to the current fresh-isolate behavior, just with a one-time warm-up per DO instead of a warm-up on every redeploy.

### Tests

`relay/src/__tests__/session-do.test.ts` (vitest-pool-workers environment). Add:

1. **Survive-restart: pairSignPub** — first-connect as desktop, verify `state.storage.get('pairSignPub')` matches; construct a new SessionDO instance against the same storage and verify it authenticates a phone connection without demanding another first-desktop-connect.
2. **Survive-restart: epoch** — call `handleRevoke` to bump epoch, verify `state.storage.get('epoch')` reflects the bump; reconstruct and confirm the next token verification uses the bumped epoch (old-epoch tokens rejected).
3. **First-connect persists** — after a desktop-first-connect succeeds, both storage keys are set.
4. **Revoke persists epoch** — after `handleRevoke`, storage epoch is the new value.

## Fix 3 — Mobile cache removal

**Files:** `mobile/src/state/cache.ts` (delete), `mobile/src/session/useSession.ts` (remove calls), `mobile/src/__tests__/useSession.test.ts` + `mobile/src/__tests__/SessionScreen.test.tsx` (remove mocks / assertions).

Delete the cache entirely. On cold launch, the phone renders `IdleScreen` ("Waiting for [desktopName]" with a connection badge — `mobile/src/session/IdleScreen.tsx`) until the transport delivers the first real snapshot. Typical wait on relay-only is 1–2 seconds; with LAN attempted first, up to the 10-second `LAN_FIRST_TIMEOUT_MS` fallback.

### Removed

- `mobile/src/state/cache.ts` — file deleted. `saveLastKnown` and `loadLastKnown` go with it.
- `mobile/src/session/useSession.ts`:
  - Remove the `import { loadLastKnown, saveLastKnown } from '../state/cache';` line.
  - Remove the hydrate-on-mount effect that calls `loadLastKnown()` (`mobile/src/session/useSession.ts:52-56`).
  - Remove the three `saveLastKnown(...)` calls on the `snapshot`, `chatFeed`, and `state` branches (`mobile/src/session/useSession.ts:76, 87, 94`).

### Tests

- `mobile/src/__tests__/useSession.test.ts`: remove the `jest.mock('../state/cache', ...)` block, the `loadLastKnown` / `saveLastKnown` imports, and the assertions that `saveLastKnown` was called. The existing snapshot-population tests still verify the store updates; they just no longer assert the persistence side-effect (because there is none).
- `mobile/src/__tests__/SessionScreen.test.tsx`: remove the same `jest.mock('../state/cache', ...)` block. The component renders identically.

### UX note

`IdleScreen`'s existing copy ("Waiting for [desktopName]" plus connection status) is appropriate for the pre-transport moment. No banner or loading spinner added.

## Testing Posture

- Desktop vitest (97 suites, 795 tests): no change expected — no desktop source touched.
- Mobile jest (9 suites, 51 tests): cache-related assertions removed; test count may drop by 2–3. All remaining tests green.
- Worker vitest (`relay/` package): gains 4 new storage tests, existing tests continue to pass.

## Scope

**In scope:**
- `src/mobile-renderer/style.css` — phase-tabs safe-area top, chat-list top-padding simplification.
- `mobile/assets/webview/index.html` — regenerated bundle.
- `relay/src/session-do.ts` — hydrate + persist `pairSignPub` / `epoch`.
- `relay/src/__tests__/session-do.test.ts` — 4 new tests.
- `mobile/src/state/cache.ts` — delete.
- `mobile/src/session/useSession.ts` — remove cache calls.
- `mobile/src/__tests__/useSession.test.ts` — remove cache mocks + assertions.
- `mobile/src/__tests__/SessionScreen.test.tsx` — remove cache mock.

**Out of scope:**
- Any change to `LanWsTransport`, `RelayWsTransport`, `CompositeTransport`.
- Desktop-side project lifecycle / snapshot-building code.
- Any replacement for the deleted cache (no new localStorage, SQLite, or filesystem cache).
- Any worker code beyond `session-do.ts` (PairingRoomDO keeps its in-memory-only model).
- Any `wrangler.toml` edits.

## Risks & Open Questions

- **Storage write latency on hot paths.** `state.storage.put('pairSignPub', ...)` on the first-connect path adds one round-trip inside the DO, blocking the WS upgrade response briefly. DO storage writes are typically sub-millisecond and the path only fires on the very first desktop connect per DO. Acceptable.
- **Concurrent hydrate calls.** If two fetches arrive near-simultaneously on a cold DO isolate, `hydrate()` may be called twice. Both will resolve against the same storage reads; the `this.hydrated = true` at the end is set idempotently. Harmless.
- **Cache-removal regression test gap.** No test covers "cold app launch with null snapshot". Adding one is possible but not required; the existing `IdleScreen` component tests already verify the null-snapshot path, and `useSession` tests cover the snapshot-arrival path. The removal is subtractive; coverage of the happy path is unchanged.
- **Existing deployed DOs without stored state.** On the first phone connect after the storage-persistence deploy, the DO will still have empty storage. The existing behavior — require desktop first — applies one last time. Subsequent desktop connects populate storage, and the fix kicks in from there. Not a regression; just means the production and staging workers need one desktop connect each after this deploy, same as today.
