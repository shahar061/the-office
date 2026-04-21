# Mobile Polish Batch — Design

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

Three small but visible mobile-companion issues surfaced in daily use:

1. **Fullscreen button shows on the Chat tab too.** The expand-to-landscape button in the Expo shell's `PortraitOverlays` is always visible, including when the user is on the Chat tab inside the WebView where landscape serves no purpose.
2. **Desktop-typed messages don't appear on the phone.** Only agent responses reach mobile; the user's own desktop input is invisible. Root cause: the desktop `SEND_MESSAGE` IPC handler is an explicit no-op, so desktop user messages never enter the `sendChat()` pipeline that fans out to the mobile bridge.
3. **Connection type is unclear.** Both apps know whether the phone is on LAN vs relay, but the happy-path UI doesn't surface it. The mobile `ConnectionPill` hides entirely when connected; the desktop header pill doesn't show mode text either. The word "Relay" is also borderline jargon for end users.

## Goals

1. Hide the fullscreen (expand-to-landscape) button on the mobile Chat tab; keep it on the Office tab.
2. Desktop-typed user messages appear in the mobile companion's chat tail.
3. Both apps surface a persistent **Local** / **Remote** badge in the happy path so the user always knows which transport they're on.
4. No regressions to existing behavior on either platform.

## Non-Goals

- Protocol field renames. Internal `mode: 'lan' | 'relay'` stays; only user-facing display labels change.
- Changes to pairing, crypto, relay-connection management, or any transport internals.
- Persistence of desktop user messages to `chatHistoryStore` (orthogonal — desktop user input persistence is already ad-hoc and out of scope here).
- A new webview↔shell bridge primitive. We reuse the existing postMessage channel.
- Any change to landscape-mode UI.

## Design

Three independent items, each touching a small set of files.

### Item 1 — Forward desktop-typed messages to mobile

**Change location:** `electron/ipc/phase-handlers.ts:731` (`SEND_MESSAGE` handler).

Replace the current no-op body with a forward-only broadcast:

```ts
ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, message: string) => {
  if (!mobileBridge) return;
  const chatMsg: ChatMessage = {
    id: randomUUID(),
    role: 'user',
    text: message,
    timestamp: Date.now(),
    source: 'desktop',
  };
  mobileBridge.onChat([chatMsg]);
});
```

- Intentionally does **not** go through `sendChat()`. That path also emits `IPC_CHANNELS.CHAT_MESSAGE` back to the renderer, which would double-render the user's message (the desktop `ChatPanel` already does `addMessage()` optimistically).
- `source: 'desktop'` keeps parity with the existing `source: 'mobile'` tagging used by phone-originated messages in `electron/main.ts:213`.
- Renderer path unchanged: the desktop `ChatPanel.tsx:216-227` still adds its own optimistic message and invokes `sendMessage`. The handler's new behavior is pure side-effect toward mobile.

**Persistence note.** Desktop user messages continue to *not* be persisted to `chatHistoryStore`. That's a separate, pre-existing concern and stays out of scope.

### Item 2 — Fullscreen button only on Office tab

**New postMessage type** (webview → shell):

```ts
// Added to the existing webview→shell message union in the mobile renderer protocol.
{ type: 'activeTab'; tab: 'chat' | 'office' }
```

**Webview side** (`src/mobile-renderer/`): emit this message whenever the user switches tabs, and once on mount with the initial tab. Piggybacks on the existing `ReactNativeWebView.postMessage` channel the webview already uses for chat answers.

**Shell side** (`mobile/src/webview-host/WebViewHost.tsx`): add an `onActiveTabChange` callback prop and extend the incoming-message router to recognise `activeTab` and invoke the callback with `tab`.

**Session screen** (`mobile/src/session/SessionScreen.tsx`): local `activeTab` state (default `'office'`), wired to `WebViewHost`'s new callback. Pass `activeTab` into `PortraitOverlays`.

**PortraitOverlays** (`mobile/src/session/PortraitLayout.tsx`): adds `activeTab: 'chat' | 'office'` prop. Renders the expand `<Pressable>` only when `activeTab === 'office'`. The `ConnectionBanner` slot stays visible on both tabs (separate orthogonal concern).

**Landscape mode** (`LandscapeLayout.tsx`): no change. Landscape has no tabs.

**Bundle implication.** The webview code changes in this item require rebuilding the webview bundle (`npm run build:mobile-all`) and committing the rebuilt asset, same convention as prior sub-projects.

### Item 3 — Local / Remote indicator (both apps)

User-facing display rename across both apps:
- **LAN** → **Local**
- **Relay** → **Remote**

Internal `mode: 'lan' | 'relay'` field names and protocol identifiers are unchanged.

**Mobile side** (`mobile/src/webview-host/ConnectionPill.tsx`):

Current behavior: `if (status.state === 'connected') return null;`

New behavior: pill is always rendered. When connected, show a compact mode badge using `status.mode`:

- `mode === 'lan'` → green dot + **"Local"**
- `mode === 'relay'` → indigo dot + **"Remote"**
- `mode === undefined` (pre-first-status) → neutral dot + **"Connected"**

Non-connected states keep their existing copy and colors (warning for connecting, error for disconnected/error, textDim for idle).

Colors match the desktop `PillPopover` convention (green for LAN, indigo for Relay).

**Desktop side:**

1. **`src/renderer/src/components/HeaderStatusPill/HeaderStatusPill.tsx`** (the header pill, not the popover): read `status.devices` from the mobile bridge store. Derive a connected-mode summary:
   - zero connected devices → existing idle/offline rendering (no change).
   - exactly one connected device → show its mode text: **"Local"** or **"Remote"**.
   - multiple connected devices, all same mode → show that mode text.
   - mixed modes → show **"Local + Remote"**.

2. **`src/renderer/src/components/SettingsPanel/sections/mobile/PairingView.tsx`** and **`MobileSection.tsx`**: rename literal "LAN" → "Local" and any remaining "Relay" user-facing strings → "Remote". The `PillPopover.tsx:73` per-device row already renders "LAN"/"Remote" — change "LAN" to "Local".

3. **`MobileSection.tsx` relay-status line** (currently `● Relay ready` / `○ Relay unreachable` / `● Relay disabled` / `⏸ Relay paused`): rename each to use **Remote** (e.g. `● Remote ready`). Color map unchanged.

**Mixed-mode rule rationale.** Showing "Local + Remote" in the rare multi-device split case is cheaper than a nuanced dropdown on the header pill. Users who need per-device detail already click into the popover.

## Testing

Small unit tests, reusing existing harnesses. No new test infrastructure.

- **Item 1:** vitest test in `tests/electron/ipc/` — stub `mobileBridge` on `state.ts`, fire `SEND_MESSAGE` IPC with a message string, assert `bridge.onChat` was called once with a single `ChatMessage` whose `role === 'user'`, `source === 'desktop'`, and `text === <input>`. Assert the renderer does *not* receive a CHAT_MESSAGE echo from this path.
- **Item 2:**
  - jest: `PortraitOverlays` renders the expand `<Pressable>` when `activeTab='office'`; does not when `activeTab='chat'`.
  - jest: `WebViewHost` — incoming `{type:'activeTab', tab:'chat'}` message invokes `onActiveTabChange('chat')`; same for `'office'`.
  - Optional: webview-side emit test — when the tab switcher is clicked, `postMessage` is called with `{type:'activeTab', tab:<new>}`. Guard if the tab switcher has existing test coverage.
- **Item 3:**
  - jest: `ConnectionPill` snapshot / render cases:
    - `{state:'connected', mode:'lan'}` renders "Local".
    - `{state:'connected', mode:'relay'}` renders "Remote".
    - `{state:'connected', mode:undefined}` renders "Connected".
    - `{state:'connecting'}` renders "Connecting" (regression guard).
    - `{state:'disconnected', reason:'x'}` renders "Offline — x" (regression guard).
  - vitest (renderer): `HeaderStatusPill` tests for the 4 mode-summary cases (zero / single-Local / single-Remote / mixed).
  - Copy rename across `MobileSection.tsx` / `PillPopover.tsx` / `PairingView.tsx` validated by code review, not a separate snapshot test.

## Scope

**In scope:**
- The files listed per item above.
- One new postMessage type (`activeTab`).
- A rebuilt mobile-renderer webview bundle + its committed asset.
- Test additions as listed.
- User-facing copy rename **LAN → Local** and **Relay → Remote** across desktop renderer.

**Out of scope:**
- Protocol field renames (`mode: 'lan' | 'relay'` stays).
- Any change to transport selection logic, relay pausing, or crypto paths.
- Desktop user-message persistence to `chatHistoryStore`.
- Per-device mode detail on the desktop header pill beyond the "Local + Remote" mixed string.
- Webview↔shell bridge refactoring.
- Any change to Chat tab rendering inside the webview beyond the new tab-change emit.

## Risks & Open Questions

- **Webview bundle rebuild discipline.** Item 2's webview change must ship with a rebuilt bundle; otherwise the shell receives no `activeTab` messages and the button remains always visible (no regression, but the fix doesn't apply until rebuild + commit).
- **Mobile ConnectionPill always-visible.** Slight visual change in the happy path (new small always-on chrome). Not a functional regression; acceptable per Design Item 3.
- **Desktop SEND_MESSAGE handler's receiver.** Today the handler body comment says "for future use (routing messages to active SDK sessions)". Once Item 1 lands, it will have a real body. If someone later adds SDK routing to this handler, they should chain — don't replace the mobile forward.
