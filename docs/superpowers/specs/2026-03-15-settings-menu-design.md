# Settings Menu — Design Spec

## Overview

Add a settings menu to The Office, accessible from both Lobby and Office screens via a gear icon. The first (and currently only) settings panel manages terminal configuration: the user can add terminals (via auto-detection or file picker), remove them, set a global default, and override the terminal per-session when creating a new session.

The UI uses a **hybrid style**: modern dark-glass base (matching existing panels) with pixel-art accents — 2px solid borders, monospace uppercase headers, retro `[ + ACTION ]` buttons, and sharp corners on interactive elements.

## Requirements

1. **Gear icon** visible on both Lobby and Office screens (top-right area)
2. **Modal overlay** — centered dialog with dimmed backdrop, closes on Escape or clicking outside
3. **Terminal panel** — list configured terminals, add/remove, set default
4. **Auto-detect** — scan `/Applications` for known terminal apps
5. **Browse** — native file picker for custom `.app` selection
6. **Global default** — one terminal is the default for all sessions
7. **Per-session override** — LobbyFAB gains a terminal selector row; default is pre-selected, user can override
8. **Persistence** — settings saved to `settings.json` in Electron's `userData` directory via main process
9. **Built-in fallback** — `Terminal.app` is always present and cannot be removed

## Visual Design

### Style: Hybrid (Modern Base + Pixel Accents)

**Modern base (from existing UI):**
- Background: `rgba(15, 15, 26, 0.97)`
- Borders: `#2a2a4a`
- Text: `#e5e5e5` primary, `#9ca3af` muted, `#6b7280` labels
- Card backgrounds: `rgba(42, 42, 74, 0.3)`

**Pixel accents:**
- Modal border: `2px solid #3b82f6` (sharp corners, `border-radius: 2px`)
- Section headers: `font-family: monospace`, uppercase, `letter-spacing: 1px`
- Action buttons: monospace font, `2px` borders, retro `[ + ACTION ]` style
- Close button: monospace `✕` with border
- Interactive elements use `border-radius: 2px` (not rounded)

### Modal Layout

```
┌──────────────────────────────────────────────┐
│  ⚙ SETTINGS                             [✕] │  ← pixel title bar
├──────────────────────────────────────────────┤
│  TERMINAL │ GENERAL (greyed out)             │  ← tab bar
├──────────────────────────────────────────────┤
│                                              │
│  DEFAULT TERMINAL                            │
│  ┌──────────────────────────────────────┐    │
│  │ 🖥 Terminal.app            ● DEFAULT │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  AVAILABLE TERMINALS                         │
│  ┌──────────────────────────────────────┐    │
│  │ 🖥 Terminal.app        [DEFAULT]     │    │
│  ├──────────────────────────────────────┤    │
│  │ 🖥 iTerm2      [SET DEFAULT]    [✕]  │    │
│  ├──────────────────────────────────────┤    │
│  │ 🖥 Warp        [SET DEFAULT]    [✕]  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [ + DETECT TERMINALS ]    [ BROWSE... ]     │
│                                              │
└──────────────────────────────────────────────┘
```

### Gear Icon Placement

- **Lobby screen**: top-right corner, absolutely positioned (similar z-index to LobbyFAB)
- **Office screen**: right side of TopBar, before the cost/token display

### LobbyFAB Terminal Selector

A new "Terminal" row appears in the LobbyFAB popover between the Tool selector and the folder picker:

```
┌─────────────────────┐
│ TOOL                │
│ [OpenCode] [Claude]  │
│                     │
│ TERMINAL            │
│ [Terminal.app●] [iTerm2] [Warp] │
│                     │
│ Choose Folder...    │
│ [Start]             │
└─────────────────────┘
```

- Global default is pre-selected (shown with `●` dot)
- User can click a different terminal to override for this session only
- Uses the same toggle-button style as the Tool row

## Architecture

### New Types (`shared/types.ts`)

```typescript
interface TerminalConfig {
  id: string;          // slugified from app name (e.g. "iterm2", "warp", "terminal-app")
  name: string;        // display name (e.g. "iTerm2")
  path: string;        // absolute path (e.g. "/Applications/iTerm.app")
  isBuiltIn: boolean;  // true for Terminal.app — cannot be removed
}

interface AppSettings {
  terminals: TerminalConfig[];
  defaultTerminalId: string;
}
```

**ID generation strategy:** IDs are deterministic slugs derived from the app name with the `.app` suffix stripped first — e.g. `"iTerm.app"` → `"iterm"`, `"Terminal.app"` → `"terminal"`. This makes detection idempotent (re-detecting the same app produces the same ID) and keeps IDs human-readable. If a custom `.app` is browsed, the slug is derived from the filename.

New IPC channels:
```typescript
// Add to IPC_CHANNELS
GET_SETTINGS: 'office:get-settings'
SAVE_SETTINGS: 'office:save-settings'
DETECT_TERMINALS: 'office:detect-terminals'
BROWSE_TERMINAL_APP: 'office:browse-terminal-app'
```

Update `OfficeAPI`:
```typescript
// New settings methods
getSettings(): Promise<AppSettings>;
saveSettings(settings: AppSettings): Promise<void>;
detectTerminals(): Promise<TerminalConfig[]>;
browseTerminalApp(): Promise<TerminalConfig | null>;

// Updated existing method — add optional terminalId parameter
createSession(tool: string, directory: string, terminalId?: string): Promise<{ ok: true }>;
```

### Updated Type in `app.store.ts`

`PendingSession` is a local interface in `app.store.ts` (not in `shared/types.ts`). Update it there:

```typescript
interface PendingSession {
  tool: string;
  directory: string;
  terminalId?: string;  // if omitted, uses global default
  createdAt: number;
}
```

### Full `terminalId` Flow Through IPC

The terminal selection must flow from UI through the entire IPC chain:

1. **LobbyFAB** → calls `app.store.createSession(tool, directory, terminalId)`
2. **`app.store.ts`** → stores `terminalId` in `PendingSession`, calls `window.office.createSession(tool, directory, terminalId)`
3. **`preload.ts`** → `ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, tool, directory, terminalId)`
4. **`main.ts` handler** → receives `terminalId`, stores it on the pending session object for use when launching the terminal

### Settings Store (`settings.store.ts`)

Zustand store:
- **State**: `terminals: TerminalConfig[]`, `defaultTerminalId: string`, `isLoaded: boolean`, `isOpen: boolean`
- **Actions**: `load()`, `addTerminal(config)`, `removeTerminal(id)`, `setDefault(id)`, `detectTerminals()`, `browseAndAdd()`, `open()`, `close()`
- On `load()`: calls `window.office.getSettings()` to hydrate from main process
- On any mutation: calls `window.office.saveSettings(...)` to persist

**Modal state (`isOpen`) in Zustand:** This deviates from the existing pattern where UI visibility (e.g. LobbyFAB `open` state) uses local `useState`. The deviation is justified because the gear icon lives in two different component trees (LobbyScreen and TopBar/OfficeScreen), so the modal's open state must be shared across them. The settings store is the natural home for this.

**Load timing:** `settings.store.load()` must be called during app initialization (e.g., in a top-level `useEffect` in `App.tsx`) so that terminal data is available when the LobbyFAB renders its terminal selector row.

### Main Process (`electron/settings.ts`)

- `loadSettings()`: reads `settings.json` from `app.getPath('userData')`, returns defaults if file missing
- `saveSettings(settings)`: writes JSON to disk
- `detectTerminals()`: scans `/Applications` for known terminal apps:
  - iTerm2 (`/Applications/iTerm.app`)
  - Warp (`/Applications/Warp.app`)
  - Kitty (`/Applications/kitty.app`)
  - Alacritty (`/Applications/Alacritty.app`)
  - Hyper (`/Applications/Hyper.app`)
  - WezTerm (`/Applications/WezTerm.app`)
  - Returns only those that exist on disk, excluding already-configured ones
- `browseTerminalApp()`: opens `dialog.showOpenDialog` filtered to `.app` files in `/Applications`. No validation is performed on the selected app — the user is trusted to pick a terminal emulator. The name and ID are derived from the `.app` filename.
- Default settings: `Terminal.app` as the sole terminal, set as default

### IPC Handlers (`electron/main.ts`)

Register four new `ipcMain.handle` calls mapping to `electron/settings.ts` functions.

## New Files

| File | Purpose |
|------|---------|
| `src/renderer/src/stores/settings.store.ts` | Zustand store for terminals + settings |
| `src/renderer/src/components/SettingsModal/SettingsModal.tsx` | Modal container: backdrop, pixel chrome, tab bar, close logic |
| `src/renderer/src/components/SettingsModal/TerminalPanel.tsx` | Terminal list, add/remove/set-default, detect + browse buttons |
| `src/renderer/src/components/SettingsGear.tsx` | Gear icon button reused across screens |
| `electron/settings.ts` | Main process: read/write settings, terminal detection |

## Modified Files

| File | Change |
|------|--------|
| `shared/types.ts` | Add `TerminalConfig`, `AppSettings`, settings IPC channels, update `OfficeAPI` (including `createSession` signature) |
| `electron/preload.ts` | Expose `getSettings`, `saveSettings`, `detectTerminals`, `browseTerminalApp`; update `createSession` to pass `terminalId` |
| `electron/main.ts` | Register settings IPC handlers; update `CREATE_SESSION` handler to accept and store `terminalId` |
| `src/renderer/src/screens/LobbyScreen.tsx` | Add `<SettingsGear />` |
| `src/renderer/src/components/TopBar/TopBar.tsx` | Add `<SettingsGear />` right side |
| `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx` | Add terminal selector row, pass `terminalId` to `createSession` |
| `src/renderer/src/stores/app.store.ts` | Add `terminalId` to `PendingSession`, update `createSession` signature |

## Interaction Details

### Opening/Closing the Modal
- Click gear icon → modal opens with backdrop
- Close via: click `✕`, press `Escape`, or click backdrop
- Modal state managed by `settings.store.ts` (`isOpen` flag)

### Adding a Terminal
1. Click `[ + DETECT TERMINALS ]` → main process scans `/Applications` → returns detected terminals not already configured → each is added to the list. If no new terminals are found, the button briefly shows "None found" (1.5s) then reverts to its default label.
2. Click `[ BROWSE... ]` → native file dialog opens → user picks a `.app` → terminal added to list with name derived from filename. If the user cancels the dialog, nothing happens.

### Removing a Terminal
- Click `✕` on a terminal entry → removed from list
- If the removed terminal was the default, `Terminal.app` becomes the new default
- `Terminal.app` has no `✕` button (cannot be removed)

### Setting Default
- Click `SET DEFAULT` on any terminal → it becomes the new default
- Previous default loses its badge, new default gets green `DEFAULT` badge

### Per-Session Override
- LobbyFAB shows all configured terminals as toggle buttons
- Global default is pre-selected
- Clicking a different terminal sets the override for this session only
- Override is passed as `terminalId` in `createSession(tool, directory, terminalId)`

## Tab Bar Behavior

The "GENERAL" tab is rendered as a disabled button (no click handler, reduced opacity `color: #4a4a6a`). No tab-switching logic is needed at this stage — only the "TERMINAL" tab is active.

## Relationship to Terminal Launch

The existing terminal launch code in `electron/main.ts` (the `osascript` block in the DISPATCH handler) currently hardcodes `Terminal.app`. A follow-up change will read `terminalId` from the pending session, resolve it to the configured terminal's path via `settings.ts`, and launch the appropriate terminal. This spec focuses only on the configuration and selection UI — the plumbing is in place so the launch logic has everything it needs.

## Out of Scope

- "GENERAL" tab content — visual placeholder only, no functionality
- Terminal-specific configuration (font, theme, etc.)
- Windows/Linux terminal detection (macOS only for now)
- Updating the actual terminal launch logic in the DISPATCH handler to use the selected terminal (follow-up change)
