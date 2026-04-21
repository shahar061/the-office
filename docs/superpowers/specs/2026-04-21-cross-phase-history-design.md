# Cross-Phase Chat History — Design

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

Today both the desktop renderer and mobile companion show only the **current phase**'s chat history. The desktop `ChatPanel` calls `window.office.getChatHistory(currentPhase)` on project open and has no tab to switch between phases; the mobile snapshot only carries the current phase's `archivedRuns` and `chatTail`. There is no way for a user on either platform to scroll back to, e.g., the Imagine phase's conversation while the project has progressed to War Room or Build.

The chat history exists on disk already — `chat-history-store.ts` writes per-phase per-agent per-run files, and `getChatHistory(phase)` returns `PhaseHistory[]` for any phase — it's just not surfaced in the UI.

## Goals

1. On both desktop and mobile, let the user switch between the four workflow phases (Imagine, War Room, Build, Complete) to view each phase's chat history.
2. Preserve the live experience: when the user is on the current phase's tab, everything behaves as it does today.
3. Treat past phases as read-only: input is disabled with a clear "return to current phase" affordance.
4. Respect user intent on phase transitions: if the user is following the live phase, auto-advance; if they're browsing a past phase, stay put.
5. Surface unread activity on the current-phase tab while the user is browsing elsewhere.

## Non-Goals

- Changing how runs are archived within a phase. `archivedRuns` behavior (collapsed prior runs of the same phase) is unchanged and composes cleanly with the new tab strip.
- Pagination of long phase histories. One-shot response for now; if volume becomes a real problem, pagination is a follow-up spec.
- Replaying live updates into past-phase history while viewing it. Past phases are frozen by definition.
- Workshop-mode phase re-opening edge cases beyond the auto-follow rule.
- Changes to the on-disk chat-history format or storage directory.

## Mental Model

Two pieces of state drive the chat view:
- **`currentPhase`** — where the project actually is, determined by `projectState.currentPhase`.
- **`viewedPhase`** — which tab the user has open. Defaults to `currentPhase`, updates on tap, auto-advances per the rule in Q6.

Rendering branches on whether the viewed phase matches the current one:

- `viewedPhase === currentPhase` → live view (snapshot on mobile, live chat store on desktop). Input enabled. No network/IPC fetch needed.
- `viewedPhase !== currentPhase` → read-only historical view. Past-phase `PhaseHistory[]` is fetched once per session (via IPC on desktop, via a new relay/LAN message on mobile) and cached in memory. Input is disabled with a "Return to <current>" action.

## UI

Both platforms get a four-tab strip at the top of their chat column / screen.

- Tabs: **Imagine**, **War Room**, **Build**, **Complete**. Order matches the workflow.
- Any phase not yet reached (not in `completedPhases` and not `currentPhase`) is disabled with a greyed-out treatment. No click action.
- The tab matching `viewedPhase` is highlighted as active.
- Any phase other than `viewedPhase` shows a small badge dot when it has messages newer than the user's last visit to that tab. The current-phase tab gets the badge when the user is browsing elsewhere and new live messages arrive.

Input region (below the message list) is visible on both live and past-phase views but:
- Live view: input is enabled as today.
- Past-phase view: input is disabled, and a hint / banner is rendered along with a one-tap "Return to <current phase>" button that sets `viewedPhase = currentPhase`.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Desktop renderer                                               │
│                                                                │
│  chat.store                                                    │
│    .viewedPhase : Phase                                        │
│    .lastVisitedAtByPhase : Record<Phase, number>               │
│    .pastPhaseHistoryCache : Map<Phase, PhaseHistory[]>         │
│    .setViewedPhase(p)                                          │
│                                                                │
│  PhaseTabs ◄── renders strip, clicks → setViewedPhase          │
│  ChatPanel ◄── branches on viewedPhase === currentPhase        │
│              ↳ live: existing messages/archivedRuns            │
│              ↳ past: cache[phase] or IPC fetch                 │
│              ↳ input: enabled / disabled + return banner       │
│                                                                │
│  IPC: window.office.getChatHistory(phase) — UNCHANGED          │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Mobile (Expo shell + webview renderer)                         │
│                                                                │
│  Shell: mobile/src/session/useSession.ts                       │
│    .requestPhaseHistory(phase) : Promise<PhaseHistory[]>       │
│    Tracks pending requests by requestId                        │
│                                                                │
│  Webview (mobile-renderer) → Shell message:                    │
│    {type:'requestPhaseHistory', phase, requestId}              │
│                                                                │
│  Shell → Desktop (via transport):                              │
│    {type:'getPhaseHistory', v:2, phase, requestId}             │
│                                                                │
│  Desktop → Shell (via transport):                              │
│    {type:'phaseHistory', v:2, requestId, phase, history}       │
│                                                                │
│  Shell → Webview:                                              │
│    forwarded via existing WebViewHost.post(...) pattern,       │
│    populates shared/stores/session.store.phaseHistoryCache     │
│                                                                │
│  Webview ChatView renders based on viewedPhase like desktop    │
│    PhaseTabs → setViewedPhase                                  │
│    branches live vs past same as desktop                       │
└────────────────────────────────────────────────────────────────┘
```

## Protocol

Additions to `MobileMessageV2` (union in `shared/types/mobile.ts`), plus entries added to `VALID_V2_TYPES` in `shared/protocol/mobile.ts`:

```ts
// Phone → Desktop
| { type: 'getPhaseHistory'; v: 2; phase: Phase; requestId: string }

// Desktop → Phone
| { type: 'phaseHistory'; v: 2; requestId: string; phase: Phase; history: PhaseHistory[] }
```

- `requestId` is a client-generated opaque string so the phone can match a response to its request. Prevents race conditions when the user toggles tabs fast.
- No protocol version bump. The additions are purely additive. Older peers without the new types ignore them via the existing default branches in `handleRaw` / `onRawFrame`.

## Auto-Follow Rule

One-line invariant, applied whenever `projectState.currentPhase` changes:

> If `viewedPhase === oldCurrentPhase`, then `viewedPhase = newCurrentPhase`. Otherwise, `viewedPhase` is left alone.

This captures the two intended behaviors:
- A user watching the live phase automatically advances when the workflow advances.
- A user intentionally browsing a past phase keeps their position when the workflow advances.

## Desktop Changes

1. **`src/renderer/src/stores/chat.store.ts`** — add:
   - `viewedPhase: Phase`, default derived from `projectState.currentPhase`.
   - `lastVisitedAtByPhase: Record<Phase, number>`, updated on tab switch.
   - `pastPhaseHistoryCache: Map<Phase, PhaseHistory[]>`, populated on first past-phase fetch, cleared on project close.
   - `setViewedPhase(p: Phase): void` — updates state + records `lastVisitedAtByPhase[p] = Date.now()`.
   - `handleCurrentPhaseChange(old: Phase, next: Phase): void` — applies the auto-follow rule.
   - `isUnread(phase: Phase): boolean` — given the current messages / cached-phase-history, compare against `lastVisitedAtByPhase[phase]`.

2. **`src/renderer/src/components/OfficeView/ChatPanel.tsx`** — branches:
   - Render a new `<PhaseTabs>` above the message list.
   - When `viewedPhase === projectState.currentPhase`, render the existing live path (current `messages` + `archivedRuns` from `chat.store`). Input enabled.
   - When `viewedPhase !== projectState.currentPhase`, call `setPastPhaseHistory(viewedPhase)` on the store (which resolves from cache or fires `getChatHistory(viewedPhase)`), render the resulting `PhaseHistory[]` using the same `MessageBubble` + `ArchivedRunsList` components, and render a read-only banner with "Return to <current>" action that calls `setViewedPhase(currentPhase)`.

3. **`src/renderer/src/components/OfficeView/PhaseTabs.tsx`** (new) — pure presentational:
   ```ts
   interface Props {
     currentPhase: Phase;
     viewedPhase: Phase;
     completedPhases: Phase[];
     unreadByPhase: Record<Phase, boolean>;
     onSelect: (phase: Phase) => void;
   }
   ```
   Four tabs. Disabled styling for phases not in `completedPhases` and not `currentPhase`. Active styling for `viewedPhase`. Badge dot when `unreadByPhase[tab]` is true.

4. **`project.store.ts`** — no change; `ChatPanel` already consumes `currentPhase` and `completedPhases`.

## Mobile Changes

### Protocol wire-up

1. **`shared/types/mobile.ts`** — add the two new message types to `MobileMessageV2`.
2. **`shared/protocol/mobile.ts`** — add `'getPhaseHistory'` and `'phaseHistory'` to `VALID_V2_TYPES`.

### Desktop bridge (main process)

3. **`electron/ipc/state.ts`** — new exported helper `getPhaseHistoryForMobile(phase: Phase): PhaseHistory[]` (reads from `chatHistoryStore`). Returns `[]` when the store isn't initialized yet (no project open).

4. **`electron/mobile-bridge/index.ts`** — inside both the LAN path (`onPhoneChat`-equivalent message routing) and the relay `'message'` handler, add a branch for `getPhaseHistory`:
   - Look up the desktop-side chat-history response via the helper.
   - Encrypt + send `{type:'phaseHistory', v:2, requestId, phase, history}` back to the same peer on the same channel.
   - Missing request: log warning, respond with empty history (don't drop silently — phone might still be waiting).

### Mobile shell

5. **`mobile/src/session/useSession.ts`** — add:
   - `requestPhaseHistory(phase: Phase): Promise<PhaseHistory[]>` — generates a `requestId`, sends the transport message, tracks pending in a `Map<string, Deferred>`, resolves on matching `phaseHistory` response. Times out after 10 s with a rejection.
   - New case in the inbound message switch for `phaseHistory` → resolves the pending promise and stores `history` under `phaseHistoryCache[phase]` via the shared session store.

6. **`shared/stores/session.store.ts`** — add:
   - `phaseHistoryCache: Partial<Record<Phase, PhaseHistory[]>>`.
   - `viewedPhase: Phase | null` — null until first snapshot arrives.
   - `setViewedPhase(p: Phase): void`.
   - `setPhaseHistory(p: Phase, h: PhaseHistory[]): void`.
   - `lastVisitedAtByPhase: Partial<Record<Phase, number>>`.
   - On `setSnapshot` / current-phase-change: apply the auto-follow rule.
   - On scope change (`sessionActive=false`): clear `phaseHistoryCache`, `viewedPhase`, `lastVisitedAtByPhase`.

### Webview (mobile-renderer)

7. **`src/mobile-renderer/ChatView.tsx`** — render the tab strip above the message list, branch live vs past the same way as desktop, disable the composer in past-phase view with a "Return to <current>" button.

8. **`src/mobile-renderer/PhaseTabs.tsx`** (new) — mirror the desktop component, RN Web styling.

9. **`src/mobile-renderer/sendPhaseHistoryRequest.ts`** (new) — one-line helper mirroring `sendAnswer.ts` / `emitActiveTab.ts`. Posts `{type:'requestPhaseHistory', phase, requestId}` via `ReactNativeWebView.postMessage`. Generates `requestId`.

### Shell ↔ webview plumbing

10. **`mobile/src/webview-host/WebViewHost.tsx`** — new `onMessage` branch for the outbound `requestPhaseHistory` webview message; invokes a new shell callback (`onPhaseHistoryRequest?: (phase, requestId) => void`) wired up by `SessionScreen`. Incoming `phaseHistory` cache updates from the shared store are forwarded into the webview via the existing `post(...)` subscription pattern.

11. **`mobile/src/session/SessionScreen.tsx`** — wires the new callback to `useSession.requestPhaseHistory`. When the promise resolves, the shared store already holds the result (the message handler in `useSession` populates the cache) — no further wiring needed in SessionScreen.

### Bundle rebuild

12. The webview code changes in the mobile-renderer require `npm run build:mobile-all` and committing the updated asset under `mobile/assets/webview/`, same convention as prior mobile-renderer features.

## Testing

1. **Desktop unit** — `src/renderer/src/stores/__tests__/chat.store.test.ts`:
   - `viewedPhase` default = `currentPhase`.
   - Auto-follow rule: `handleCurrentPhaseChange('imagine', 'warroom')` with `viewedPhase='imagine'` → `viewedPhase='warroom'`; with `viewedPhase='build'` → `viewedPhase='build'` (unchanged).
   - `setViewedPhase(p)` updates `lastVisitedAtByPhase[p]`.
   - `isUnread(phase)` returns true when messages newer than last-visit exist, false otherwise.

2. **Desktop component** — `tests/renderer/PhaseTabs.test.tsx`:
   - Unreached phases render disabled.
   - Current phase + completed phases render enabled.
   - Badge dot appears for unread tabs.
   - `onSelect` fires with the right phase on click.

3. **Shared store** — extend `shared/stores/__tests__/session.store.test.ts`:
   - `setViewedPhase(p)` sets state.
   - `setPhaseHistory(p, h)` populates cache; reading returns the cached value.
   - Snapshot with new `currentPhase` triggers auto-follow.
   - Scope change (`sessionActive=false`) clears cache + viewedPhase.

4. **Mobile shell** — extend `mobile/src/__tests__/useSession.test.ts`:
   - Fake transport emits a `phaseHistory` message; assert the matching pending `requestPhaseHistory` promise resolves with the history, and the shared store's cache contains it.
   - Two concurrent requests match correctly by `requestId`.
   - Timeout path: no response within 10 s rejects.

5. **Desktop ↔ mobile bridge integration** — `electron/mobile-bridge/__tests__/phase-history.test.ts` (new):
   - Stub `chatHistoryStore` returning a fixed `PhaseHistory[]`.
   - Fire a decrypted `getPhaseHistory` through the bridge's message handler.
   - Assert the bridge sends a `phaseHistory` response with the same `requestId`, the requested `phase`, and the stub's history.

## Scope

**In scope:**
- Protocol additions (`getPhaseHistory`, `phaseHistory`) in shared types and validators.
- Desktop: `chat.store` extensions, `ChatPanel` branching, new `PhaseTabs`.
- Mobile shell: `useSession.requestPhaseHistory`, session-store extensions.
- Mobile renderer: `ChatView` branching, `PhaseTabs`, `sendPhaseHistoryRequest` helper.
- Webview bundle rebuild.
- Tests as above.

**Out of scope:**
- Pagination of phase history.
- Live updates into past-phase views.
- Changes to chat-history file format or storage.
- Workshop-mode re-entry semantics beyond the auto-follow rule.
- Any change to `archivedRuns` behavior within a phase.

## Risks & Open Questions

- **Volume.** A long Build phase could return hundreds of messages in one response. For a Cloudflare relay frame this is still well under the 1 MB payload limit enforced by `session-do.ts:8` (`MAX_PAYLOAD_BYTES`), but worth monitoring. Pagination is a straightforward follow-up if it becomes a practical issue.
- **Desktop–mobile label drift.** Both `PhaseTabs` components share the same tab labels (`'Imagine' | 'War Room' | 'Build' | 'Complete'`). A future rename needs both. Consider extracting a shared `PHASE_LABELS` constant in `shared/types`. Mentioned here so it's not forgotten; not in scope for this spec.
- **Auto-follow corner case.** If a workshop-mode re-entry starts the Build phase over again, the auto-follow rule sees `currentPhase` transition `'complete' → 'build'`. A user who was on `'complete'` gets auto-switched to `'build'`. Acceptable default; reversible in one tap.
- **Stale cache for past phase.** The cache is populated once per session on first visit. If the underlying disk store somehow changes mid-session (shouldn't happen for completed phases, but workshop edge cases), the cached view goes stale. Out of scope; user can refresh by closing + reopening the project.
- **Request timeout path.** 10 s timeout in `requestPhaseHistory` is a guess. If relay latency is higher in practice, bump it. Low risk — past-phase fetches are rare.
