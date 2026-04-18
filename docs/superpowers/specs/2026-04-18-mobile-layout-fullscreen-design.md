# Mobile Layout Overhaul + Fullscreen Landscape Mode — Design

**Status:** design approved, pending user review
**Target:** `mobile/` (Expo / React Native companion app)
**Related:** future brainstorm — "Desktop/mobile canvas state parity" (separate spec)

---

## Problem

The mobile companion's session screen has accumulated layout issues that hurt both polish and future extensibility:

- `SafeAreaView` in `SessionScreen.tsx:173` wraps the whole screen without an `edges` prop, padding all four sides including the canvas. Content gets cut at the edges and the WebView is letterboxed.
- Spacing and color literals are duplicated across 4+ files (`#0a0a0a`, `#6366f1`, `rgba(255,255,255,0.08)`, various paddings). Pairing screens and the session screen feel disjointed.
- The Send button and TextInput are below the 44pt HIG minimum touch target.
- `app.json` hard-locks orientation to portrait at build time, so the canvas can't be expanded to a wider view on demand.
- `softwareKeyboardLayoutMode: "resize"` (Android) conflicts with `KeyboardAvoidingView behavior="height"` — both try to reclaim space when the keyboard opens.

The user wants:

1. Consistent layout with no edge cutoffs across all mobile screens.
2. A fullscreen **landscape** canvas mode, entered by an "expand" button in portrait.
3. From landscape, a small "chat" button that returns to portrait and opens the chat composer.

## Goals

- Fix the cutoff/spacing/touch-target issues structurally, not with patches.
- Add the landscape canvas mode with clean portrait↔landscape transitions.
- Introduce a theme module (`colors`, `spacing`, `typography`, `radius`) so future screens stay consistent.
- Keep transport/state layers untouched — this is a layout refactor only.

## Non-Goals

- **Canvas state parity** between desktop and mobile. Mobile renders only the subset of state the snapshot exposes today. Full parity (sprite positions, walk paths, camera focus) is a separate brainstorm.
- **Redesigning** pairing screens or settings. They get theme-token swaps only (mechanical literal replacement); no visual redesign.
- **Auto-hide of landscape controls** (YouTube-style fade-out). Controls stay always-visible in v1.
- **Auto-rotation driven by physical device rotation.** Mode changes only via explicit button taps.
- **Proactive indicator when `AskUserQuestion` arrives while in landscape.** Deferred — needs a new signal on the mobile-bridge snapshot.

## Architecture

Three concerns, each with clear ownership:

```
mobile/src/
├── session/
│   ├── useSession.ts            # Hook: transport lifecycle + chat send + ack tracking + store wiring
│   ├── SessionScreen.tsx        # Shell: owns mode state, chooses chrome
│   ├── PortraitLayout.tsx       # Chrome: banner + expand button + chat composer
│   ├── LandscapeLayout.tsx      # Chrome: connection pill + chat FAB
│   └── orientation.ts           # expo-screen-orientation wrapper
├── theme/
│   ├── colors.ts                # bg/border/text/accent/status tokens
│   ├── spacing.ts               # 4-pt scale + radius + hitTarget
│   ├── typography.ts            # caption/label/body/bodyStrong/heading
│   └── index.ts                 # barrel re-export
└── (unchanged)
    ├── webview-host/            # WebViewHost stays as-is
    ├── transport/               # CompositeTransport/LAN/Relay stay as-is
    ├── state/                   # Zustand stores stay as-is
    └── pairing/                 # pairing screens: theme-token swaps only
```

### Key decisions

1. **WebView lives in the shell, not the layouts.** `SessionScreen` renders `<WebViewHost />` as an absolute-fill background, mounted once. Layouts render chrome overlays only — rotating between portrait and landscape just swaps chrome; the WebView stays mounted, no PixiJS re-init, canvas state survives seamlessly.

2. **Mode state is local to `SessionScreen`.** Not a global store — no other component in the app needs to know whether the session view is currently portrait or landscape. A single `useState<'portrait'|'landscape'>` owned by the shell.

3. **`useSession` is pure logic.** Returns `{ status, draft, setDraft, sending, canSend, submit }`. Knows nothing about orientation, layout, or theming. Unit-testable in isolation by stubbing transport factories.

4. **Theme tokens are the only shared UI concept.** No base components, no layout primitives — just token modules that chrome and pairing screens import directly. Keeps the scope mechanical.

5. **Orientation lock is best-effort.** Every `lockAsync` call is wrapped in `try/catch`. The mode state is what drives UI; the OS-level lock is insurance.

### Shell wiring

```tsx
// mobile/src/session/SessionScreen.tsx
export function SessionScreen({ device, onPairingLost }: Props) {
  const session = useSession({ device, onPairingLost });
  const [mode, setMode] = useState<'portrait'|'landscape'>('portrait');

  // Best-effort orientation lock, dismiss keyboard on portrait→landscape.
  useEffect(() => {
    if (mode === 'landscape') Keyboard.dismiss();
    lockOrientation(mode).catch(() => { /* swallowed inside wrapper */ });
  }, [mode]);

  // Restore portrait on unmount (e.g., pairing lost).
  useEffect(() => () => { resetOrientation().catch(() => {}); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <WebViewHost />
      {mode === 'portrait'
        ? <PortraitLayout session={session} onExpand={() => setMode('landscape')} />
        : <LandscapeLayout status={session.status} onOpenChat={() => setMode('portrait')} />}
    </View>
  );
}
```

### `useSession` hook interface

```ts
// mobile/src/session/useSession.ts
export interface UseSessionOpts {
  device: PairedDeviceCredentials;
  onPairingLost: () => void;
}

export interface UseSessionReturn {
  status: TransportStatus;
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  canSend: boolean;
  submit: () => Promise<{ ok: boolean; error?: string }>;
}

export function useSession(opts: UseSessionOpts): UseSessionReturn;
```

Internal responsibilities (moved out of `SessionScreen`):

- `transportRef`, `pendingAcksRef`, `draft`, `sending` state
- Mount effect: `loadLastKnown`, build `LanWsTransport` + `RelayWsTransport` + `CompositeTransport`, wire status + message listeners, `transport.connect()`
- Message routing: `snapshot` → `setSnapshot` + `saveLastKnown`; `event` → `appendEvent`; `chatFeed` → `appendChat` + re-save; `state` → `applyStatePatch`; `chatAck` → resolve the matching pending ack; `tokenRefresh` → `saveDevice({ ...device, relayToken })`
- `submit`: returns a promise resolving `{ ok, error }`. The 5s timeout, pending-ack bookkeeping, and late-ack cleanup all live inside `submit`. The `Alert.alert('Send failed', ...)` call moves into `PortraitLayout` so `useSession` stays JSX-free.
- Unmount: `offStatus()`, `offMessage()`, `transport.disconnect()`, clear pending-ack timers

## Chrome Details

### PortraitLayout

```
┌ ConnectionBanner ───── marginTop: insets.top + spacing.sm (hidden when status === 'connected')
│
│                        ← WebView shows through transparent area
│
│              ┌ Expand button (32×32 visual, 44×44 hit)
│              │  top: banner.height + spacing.md
│              │  right: spacing.md
│              │  bg: colors.bgOverlay, border: colors.border, glyph: ⤢
│
│ ┌ Chat composer ─┴─── paddingBottom: insets.bottom + spacing.md
│ │  TextInput (minHeight: hitTarget.min = 44)
│ │  Send button (minHeight: 44, minWidth: 70, bg: colors.accent)
```

- Keyboard: iOS wraps composer in `KeyboardAvoidingView behavior="padding"`. Android renders a plain `View` and relies on `softwareKeyboardLayoutMode: "resize"` (from `app.json`).
- Chat-send error flow: when `session.submit()` resolves `{ ok: false, error }`, the layout calls `Alert.alert('Send failed', error)`.

### LandscapeLayout

```
┌ ConnectionPill ─── top: insets.top + spacing.sm, left: insets.left + spacing.sm
│  "● <status word>" (hidden when status === 'connected')
│
│              ← WebView full-bleed, edge-to-edge
│
│                                          ┌ Chat FAB (56×56)
│                                          │  bottom: insets.bottom + spacing.lg
│                                          │  right:  insets.right  + spacing.lg
│                                          │  bg: colors.accent, glyph: 💬
```

- `LandscapeLayout` renders its own `<StatusBar hidden />` at the top of its JSX. expo-status-bar merges nested declarations correctly.
- The pill shares the `ConnectionBanner` color/border rules (info/warning variants) for visual consistency.

### Shared overlay rules

- Both chrome components use `useSafeAreaInsets()` to position themselves. Neither wraps anything in `SafeAreaView`.
- `SessionScreen` does not use `SafeAreaView` either. `SafeAreaProvider` at `App.tsx` root is the only provider (already there).
- Loading/pairing screens in `App.tsx` DO use `SafeAreaView`, with `edges={['top','bottom']}` (no sides; they're portrait-only).

## Theme Module Contents

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

  // Accent & status
  accent: '#6366f1',
  accentSecondary: '#0ea5e9',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#93c5fd',
};

// mobile/src/theme/spacing.ts
export const spacing   = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius    = { sm: 4, md: 6, lg: 8, round: 999 };
export const hitTarget = { min: 44 };

// mobile/src/theme/typography.ts
export const typography = {
  caption:    { fontSize: 10, fontWeight: '500' as const },
  label:      { fontSize: 11, fontWeight: '600' as const },
  body:       { fontSize: 14, fontWeight: '400' as const },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const },
  heading:    { fontSize: 18, fontWeight: '700' as const },
};
```

### Migration scope

- **Migrated:** `SessionScreen`, `WebViewHost`, `ConnectionBanner`, new `ConnectionPill`, `PairingView` (both variants), `SasConfirmScreen`, `App.tsx` loading screens.
- **Not migrated in this pass:** camera QR-scanner overlay (native), mobile-renderer (inside the WebView — different codebase).

### Planned normalizations (intentional behavior changes, small)

- `Send` button and `TextInput` minHeight bump from ~36 to 44 (HIG min). Composer grows ~8pt.
- `ConnectionBanner` padding standardizes to `spacing.sm` / `spacing.md` (was 6/12).
- SAS confirm gap standardizes to `spacing.md` (12) after recent thrashing (28 → 12 → 14).

All other token swaps are value-equivalent.

## Orientation Wrapper

```ts
// mobile/src/session/orientation.ts
import * as ScreenOrientation from 'expo-screen-orientation';

export async function lockOrientation(mode: 'portrait' | 'landscape'): Promise<void> {
  const lock = mode === 'portrait'
    ? ScreenOrientation.OrientationLock.PORTRAIT
    : ScreenOrientation.OrientationLock.LANDSCAPE;
  try { await ScreenOrientation.lockAsync(lock); }
  catch (err) { console.warn('[orientation] lock failed:', err); }
}

export async function resetOrientation(): Promise<void> {
  try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT); }
  catch { /* ignore */ }
}
```

### `app.json` changes

- `orientation`: `"portrait"` → `"default"` so Expo allows the runtime lock to target landscape.
- `expo-screen-orientation` added to `plugins`. New dependency: `expo-screen-orientation`.
- `softwareKeyboardLayoutMode: "resize"` stays (resolves conflict by dropping Android `KeyboardAvoidingView`; see below).

## Keyboard Strategy

The current code has `softwareKeyboardLayoutMode: "resize"` in `app.json` AND `KeyboardAvoidingView behavior="height"` on Android — they fight.

**Resolution:**

- **Android:** keep `softwareKeyboardLayoutMode: "resize"`; the composer is a plain `View`.
- **iOS:** wrap composer in `<KeyboardAvoidingView behavior="padding">` (iOS has no `softwareKeyboardLayoutMode` equivalent).
- Implemented via `Platform.OS === 'ios' ? <KeyboardAvoidingView …/> : <View …/>` inside `PortraitLayout`.

## Edge Cases

1. **`lockAsync` throws** (old Android, simulator quirks) — logged and swallowed; `mode` state stays consistent; UI not affected.
2. **Rotation while keyboard is open** — `SessionScreen`'s mode effect calls `Keyboard.dismiss()` before going portrait→landscape.
3. **Return to portrait auto-focuses TextInput** — after the landscape→portrait lock completes, `PortraitLayout` focuses the TextInput via ref so the user can type immediately (they tapped FAB to chat — the keyboard opening is intentional).
4. **WebView viewport on rotation** — WebView is `position: absolute, inset: 0`; React Native fires a layout event; PixiJS's camera already handles `setViewSize`. If a gap surfaces during implementation, add an in-WebView `window.onresize` handler that recomputes dimensions.
5. **Rapid mode toggling** — guard with an `isTransitioning` ref; ignore button taps while a lock is in flight.
6. **App backgrounded in landscape** — `AppState` listener in `SessionScreen`: on `'active'`, re-apply the lock for the current `mode`.
7. **Pairing lost in landscape** — `onPairingLost` fires; `SessionScreen` unmounts; `resetOrientation()` runs in cleanup; pairing screens see portrait.
8. **Connection drops in landscape** — `ConnectionPill` reappears (hidden when connected); no modal, no forced rotation.
9. **`AskUserQuestion` arrives in landscape** — the question surfaces inside the WebView chat tab (via `chatFeed`). User must tap FAB → portrait to see it. Noted limitation; deferred to a future brainstorm for a proactive indicator.
10. **Theme migration regressions** — each file migrated in its own commit; manual visual QA per commit against a pre-migration screenshot; one intentional change (44pt composer) is called out separately.

## Testing Strategy

### Automated (jest, runs in `mobile/`)

**`useSession` hook:**

- Lifecycle: on mount builds transports and connects; on unmount disconnects and clears timers. Verified by stubbing `CompositeTransport`.
- Message routing: one test per message type (`snapshot`, `event`, `chatFeed`, `state`, `chatAck`, `tokenRefresh`) asserting the correct store/secure-store call.
- Submit/ack flow: happy path (ack arrives → `{ ok: true }`), timeout path (no ack in 5s → `{ ok: false, error: 'Timed out…' }`), late-ack after timeout dropped cleanly, `canSend` false while `sending` true.

**`orientation.ts`:**

- `lockOrientation('portrait'|'landscape')` calls `ScreenOrientation.lockAsync` with the correct enum.
- Thrown errors are swallowed; function resolves instead of rejecting.
- `resetOrientation()` locks to portrait.

### Manual QA (run once before merge)

1. Fresh pairing → session — no layout jump as canvas loads. Composer 44pt tall, not under home indicator.
2. Notched device (iPhone 14/15 or Pixel with cutout) — portrait: no chrome under the notch. Landscape: pill + FAB clear of side cutouts and home indicator.
3. Expand button → landscape — smooth rotation, status bar hidden, pill in top-left (if disconnected), FAB in bottom-right.
4. FAB → portrait — keyboard animates up, TextInput already focused.
5. Rapid button hammer — stable, ends in a consistent state.
6. Connection drop in landscape — pill appears; restore — pill disappears.
7. Keyboard open → tap expand — keyboard dismisses before rotation; no half-state.
8. Background → foreground in landscape — orientation lock restored.
9. Pairing + SAS + settings screens — visually compared against a pre-migration screenshot. Token swaps should be imperceptible except the intentional 44pt composer bump.

### Not testing

- Visual regression snapshots — manual QA catches what matters in this scope.
- Landscape canvas internals — inside the WebView, out of scope.
- Theme module internals — pure data tokens; the compiler is the assertion.

## Implementation Order (preview for writing-plans)

Rough ordering to keep the work shippable in small steps:

1. Theme module (colors/spacing/typography/radius/hitTarget) + barrel re-export.
2. Install `expo-screen-orientation`; add `orientation.ts`; `app.json` orientation → `"default"`.
3. Extract `useSession` hook; `SessionScreen` shell uses it; no behavior change yet.
4. Introduce `PortraitLayout` extracted from the current JSX; session behavior identical.
5. Add `LandscapeLayout` + `ConnectionPill` + expand button + FAB + orientation transitions.
6. Fix safe-area strategy: remove the top-level `SafeAreaView`, apply insets via `useSafeAreaInsets` in chrome.
7. Resolve keyboard conflict: drop `KeyboardAvoidingView` on Android.
8. Migrate pairing screens + `SasConfirmScreen` + `App.tsx` to theme tokens, one file per commit.
9. Add `useSession` + `orientation` jest tests.
10. Run manual QA checklist; fix anything that surfaces.

Writing-plans will turn this into discrete bite-sized tasks with exact file paths and code.
