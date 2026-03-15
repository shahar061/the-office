# Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings menu with terminal management, accessible from both Lobby and Office screens, with per-session terminal override in the session creation flow.

**Architecture:** New Zustand store (`settings.store.ts`) manages terminal state and modal visibility, persisted via IPC to `settings.json` in Electron's userData. Main process (`electron/settings.ts`) handles disk I/O and terminal detection. UI consists of a gear icon component, a modal with terminal panel, and a terminal selector row added to LobbyFAB.

**Tech Stack:** React 19, Zustand 5, Electron 41 (ipcMain/ipcRenderer), Vitest, TypeScript

---

## Chunk 1: Foundation (Types, Main Process, IPC)

### Task 1: Add shared types and IPC channels

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add TerminalConfig and AppSettings interfaces**

In `shared/types.ts`, add after the `SessionListItem` interface (after line 94):

```typescript
export interface TerminalConfig {
  id: string;
  name: string;
  path: string;
  isBuiltIn: boolean;
}

export interface AppSettings {
  terminals: TerminalConfig[];
  defaultTerminalId: string;
}
```

- [ ] **Step 2: Add settings IPC channels**

In the `IPC_CHANNELS` object (after `CANCEL_SESSION` on line 111), add:

```typescript
  GET_SETTINGS: 'office:get-settings',
  SAVE_SETTINGS: 'office:save-settings',
  DETECT_TERMINALS: 'office:detect-terminals',
  BROWSE_TERMINAL_APP: 'office:browse-terminal-app',
```

- [ ] **Step 3: Update OfficeAPI interface**

In the `OfficeAPI` interface, update `createSession` and add new methods. Replace line 124:

```typescript
  createSession(tool: string, directory: string, terminalId?: string): Promise<{ ok: true }>;
```

Add before the closing `}` of `OfficeAPI`:

```typescript
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  detectTerminals(): Promise<TerminalConfig[]>;
  browseTerminalApp(): Promise<TerminalConfig | null>;
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

> **Note:** `main.ts` has a pre-existing bug referencing undeclared `activeClaudeProcess` (lines 275-277). This will cause a tsc error. It will be fixed in Task 3. For now, verify that only this pre-existing error appears (no new errors from our type additions).

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts
git commit -m "feat(settings): add TerminalConfig, AppSettings types and IPC channels"
```

---

### Task 2: Create main process settings module

**Files:**
- Create: `electron/settings.ts`
- Test: `tests/electron/settings.test.ts`

- [ ] **Step 1: Write tests for settings module**

Create `tests/electron/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { loadSettingsFromPath, saveSettingsToPath, slugify, detectTerminals } from '../../electron/settings';
import type { TerminalConfig } from '../../shared/types';

describe('slugify', () => {
  it('converts app names to slugs', () => {
    expect(slugify('iTerm.app')).toBe('iterm');
    expect(slugify('Terminal.app')).toBe('terminal');
    expect(slugify('Warp.app')).toBe('warp');
    expect(slugify('My Custom Terminal.app')).toBe('my-custom-terminal');
  });
});

describe('detectTerminals', () => {
  it('excludes already-configured terminals', () => {
    const current: TerminalConfig[] = [
      { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
    ];
    const found = detectTerminals(current);
    // Result depends on what's installed on the machine,
    // but 'terminal' should never appear in the results
    expect(found.every(t => t.id !== 'terminal')).toBe(true);
    // All found entries should have valid fields
    for (const t of found) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.path).toMatch(/^\/Applications\//);
      expect(t.isBuiltIn).toBe(false);
    }
  });
});

describe('settings persistence', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns default settings when file does not exist', () => {
    const data = loadSettingsFromPath(settingsPath);
    expect(data.terminals).toHaveLength(1);
    expect(data.terminals[0].id).toBe('terminal');
    expect(data.terminals[0].name).toBe('Terminal');
    expect(data.terminals[0].isBuiltIn).toBe(true);
    expect(data.defaultTerminalId).toBe('terminal');
  });

  it('reads settings from disk', () => {
    const saved = {
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'iterm',
    };
    fs.writeFileSync(settingsPath, JSON.stringify(saved));
    const data = loadSettingsFromPath(settingsPath);
    expect(data.terminals).toHaveLength(2);
    expect(data.defaultTerminalId).toBe('iterm');
  });

  it('writes settings to disk', () => {
    const settings = {
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
      ],
      defaultTerminalId: 'terminal',
    };
    saveSettingsToPath(settingsPath, settings);
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(raw.defaultTerminalId).toBe('terminal');
  });

  it('returns defaults for corrupted JSON', () => {
    fs.writeFileSync(settingsPath, 'not-json!!!');
    const data = loadSettingsFromPath(settingsPath);
    expect(data.terminals).toHaveLength(1);
    expect(data.terminals[0].id).toBe('terminal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/electron/settings.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement settings module**

Create `electron/settings.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { app, dialog, BrowserWindow } from 'electron';
import type { TerminalConfig, AppSettings } from '../shared/types';

const DEFAULT_TERMINAL: TerminalConfig = {
  id: 'terminal',
  name: 'Terminal',
  path: '/System/Applications/Utilities/Terminal.app',
  isBuiltIn: true,
};

const DEFAULT_SETTINGS: AppSettings = {
  terminals: [DEFAULT_TERMINAL],
  defaultTerminalId: 'terminal',
};

const KNOWN_TERMINALS: { name: string; appName: string }[] = [
  { name: 'iTerm2', appName: 'iTerm.app' },
  { name: 'Warp', appName: 'Warp.app' },
  { name: 'Kitty', appName: 'kitty.app' },
  { name: 'Alacritty', appName: 'Alacritty.app' },
  { name: 'Hyper', appName: 'Hyper.app' },
  { name: 'WezTerm', appName: 'WezTerm.app' },
];

export function slugify(name: string): string {
  return name
    .replace(/\.app$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettingsFromPath(filePath: string): AppSettings {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as AppSettings;
    if (!Array.isArray(data.terminals) || !data.defaultTerminalId) {
      return { ...DEFAULT_SETTINGS };
    }
    return data;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettingsToPath(filePath: string, settings: AppSettings): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
}

export function loadSettings(): AppSettings {
  return loadSettingsFromPath(getSettingsPath());
}

export function saveSettings(settings: AppSettings): void {
  saveSettingsToPath(getSettingsPath(), settings);
}

export function detectTerminals(currentTerminals: TerminalConfig[]): TerminalConfig[] {
  const existingIds = new Set(currentTerminals.map(t => t.id));
  const found: TerminalConfig[] = [];

  for (const known of KNOWN_TERMINALS) {
    const appPath = path.join('/Applications', known.appName);
    const id = slugify(known.appName);
    if (existingIds.has(id)) continue;
    if (fs.existsSync(appPath)) {
      found.push({
        id,
        name: known.name,
        path: appPath,
        isBuiltIn: false,
      });
    }
  }

  return found;
}

export async function browseTerminalApp(parentWindow: BrowserWindow): Promise<TerminalConfig | null> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Select Terminal Application',
    defaultPath: '/Applications',
    filters: [{ name: 'Applications', extensions: ['app'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const appPath = result.filePaths[0];
  const appName = path.basename(appPath);
  const id = slugify(appName);
  const name = appName.replace(/\.app$/i, '');

  return { id, name, path: appPath, isBuiltIn: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/electron/settings.test.ts 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/settings.ts tests/electron/settings.test.ts
git commit -m "feat(settings): add settings persistence and terminal detection module"
```

---

### Task 3: Wire IPC handlers and update preload

**Files:**
- Modify: `electron/main.ts:245-252`
- Modify: `electron/preload.ts:48-50`

- [ ] **Step 1: Fix pre-existing `activeClaudeProcess` bug in main.ts**

In `electron/main.ts`, the `window-all-closed` handler (lines 275-278) references an undeclared `activeClaudeProcess` variable. Remove these stale lines:

```typescript
  // DELETE these lines (275-278):
  if (activeClaudeProcess) {
    activeClaudeProcess.kill();
    activeClaudeProcess = null;
  }
```

The `activeProcesses` Set already handles cleanup of all spawned processes.

- [ ] **Step 2: Add settings IPC handlers to main.ts**

In `electron/main.ts`, add the import at the top (after line 8):

```typescript
import { loadSettings, saveSettings, detectTerminals, browseTerminalApp } from './settings';
import type { AppSettings } from '../shared/types';
```

Add `terminalId` to the `pendingSession` type on line 14. Replace:
```typescript
let pendingSession: { tool: string; directory: string; createdAt: number } | null = null;
```
with:
```typescript
let pendingSession: { tool: string; directory: string; terminalId?: string; createdAt: number } | null = null;
```

Update the `CREATE_SESSION` handler (line 245-252). Replace:
```typescript
  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, tool: string, directory: string) => {
    pendingSession = { tool, directory, createdAt: Date.now() };
```
with:
```typescript
  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_event, tool: string, directory: string, terminalId?: string) => {
    pendingSession = { tool, directory, terminalId, createdAt: Date.now() };
```

Add new settings handlers inside `setupIPC()`, before the closing `}` of that function (before the `CANCEL_SESSION` handler):

```typescript
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return loadSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, settings: AppSettings) => {
    saveSettings(settings);
  });

  ipcMain.handle(IPC_CHANNELS.DETECT_TERMINALS, async () => {
    const current = loadSettings();
    return detectTerminals(current.terminals);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSE_TERMINAL_APP, async () => {
    if (!mainWindow) return null;
    return browseTerminalApp(mainWindow);
  });
```

- [ ] **Step 3: Update preload.ts**

In `electron/preload.ts`, add the import for `AppSettings` on line 3:

```typescript
import type { AgentEvent, ConnectionStatus, KanbanState, AgentRole, SessionInfo, SessionListItem, AppSettings, TerminalConfig } from '../shared/types';
```

Update `createSession` (line 48-50). Replace:
```typescript
  createSession(tool: string, directory: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, tool, directory);
  },
```
with:
```typescript
  createSession(tool: string, directory: string, terminalId?: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, tool, directory, terminalId);
  },
```

Add the four new methods after the `getKanbanState` method (after line 78):

```typescript
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS);
  },

  saveSettings(settings: AppSettings): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings);
  },

  detectTerminals(): Promise<TerminalConfig[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.DETECT_TERMINALS);
  },

  browseTerminalApp(): Promise<TerminalConfig | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.BROWSE_TERMINAL_APP);
  },
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors (the pre-existing `activeClaudeProcess` bug was fixed in Step 1)

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat(settings): wire IPC handlers for settings CRUD and terminal detection"
```

---

## Chunk 2: Settings Store and UI Components

### Task 4: Create settings Zustand store

**Files:**
- Create: `src/renderer/src/stores/settings.store.ts`
- Test: `tests/src/stores/settings.store.test.ts`

- [ ] **Step 1: Write tests for settings store**

Create `tests/src/stores/settings.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window.office before importing the store
const mockGetSettings = vi.fn();
const mockSaveSettings = vi.fn();
const mockDetectTerminals = vi.fn();
const mockBrowseTerminalApp = vi.fn();

vi.stubGlobal('window', {
  office: {
    getSettings: mockGetSettings,
    saveSettings: mockSaveSettings,
    detectTerminals: mockDetectTerminals,
    browseTerminalApp: mockBrowseTerminalApp,
  },
});

import { useSettingsStore } from '../../../src/renderer/src/stores/settings.store';

describe('SettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    useSettingsStore.setState({
      terminals: [],
      defaultTerminalId: '',
      isLoaded: false,
      isOpen: false,
    });
  });

  it('starts with empty state', () => {
    const state = useSettingsStore.getState();
    expect(state.terminals).toEqual([]);
    expect(state.defaultTerminalId).toBe('');
    expect(state.isLoaded).toBe(false);
    expect(state.isOpen).toBe(false);
  });

  it('loads settings from main process', async () => {
    mockGetSettings.mockResolvedValue({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/System/Applications/Utilities/Terminal.app', isBuiltIn: true },
      ],
      defaultTerminalId: 'terminal',
    });

    await useSettingsStore.getState().load();
    const state = useSettingsStore.getState();
    expect(state.terminals).toHaveLength(1);
    expect(state.defaultTerminalId).toBe('terminal');
    expect(state.isLoaded).toBe(true);
  });

  it('adds a terminal and persists', async () => {
    useSettingsStore.setState({
      terminals: [{ id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true }],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().addTerminal({
      id: 'iterm',
      name: 'iTerm',
      path: '/Applications/iTerm.app',
      isBuiltIn: false,
    });

    const state = useSettingsStore.getState();
    expect(state.terminals).toHaveLength(2);
    expect(state.terminals[1].id).toBe('iterm');
    expect(mockSaveSettings).toHaveBeenCalledWith({
      terminals: state.terminals,
      defaultTerminalId: 'terminal',
    });
  });

  it('does not add duplicate terminal', async () => {
    useSettingsStore.setState({
      terminals: [{ id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true }],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().addTerminal({
      id: 'terminal',
      name: 'Terminal',
      path: '/path',
      isBuiltIn: true,
    });

    expect(useSettingsStore.getState().terminals).toHaveLength(1);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('removes a terminal and persists', async () => {
    useSettingsStore.setState({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().removeTerminal('iterm');
    expect(useSettingsStore.getState().terminals).toHaveLength(1);
    expect(mockSaveSettings).toHaveBeenCalled();
  });

  it('cannot remove built-in terminal', async () => {
    useSettingsStore.setState({
      terminals: [{ id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true }],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().removeTerminal('terminal');
    expect(useSettingsStore.getState().terminals).toHaveLength(1);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('resets default to terminal when removing the current default', async () => {
    useSettingsStore.setState({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'iterm',
      isLoaded: true,
    });

    await useSettingsStore.getState().removeTerminal('iterm');
    expect(useSettingsStore.getState().defaultTerminalId).toBe('terminal');
  });

  it('sets default terminal and persists', async () => {
    useSettingsStore.setState({
      terminals: [
        { id: 'terminal', name: 'Terminal', path: '/path', isBuiltIn: true },
        { id: 'iterm', name: 'iTerm', path: '/Applications/iTerm.app', isBuiltIn: false },
      ],
      defaultTerminalId: 'terminal',
      isLoaded: true,
    });

    await useSettingsStore.getState().setDefault('iterm');
    expect(useSettingsStore.getState().defaultTerminalId).toBe('iterm');
    expect(mockSaveSettings).toHaveBeenCalled();
  });

  it('opens and closes modal', () => {
    useSettingsStore.getState().open();
    expect(useSettingsStore.getState().isOpen).toBe(true);
    useSettingsStore.getState().close();
    expect(useSettingsStore.getState().isOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/src/stores/settings.store.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement settings store**

Create `src/renderer/src/stores/settings.store.ts`:

```typescript
import { create } from 'zustand';
import type { TerminalConfig, AppSettings } from '../../../../shared/types';

interface SettingsState {
  terminals: TerminalConfig[];
  defaultTerminalId: string;
  isLoaded: boolean;
  isOpen: boolean;
  load: () => Promise<void>;
  addTerminal: (config: TerminalConfig) => Promise<void>;
  removeTerminal: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  detectTerminals: () => Promise<TerminalConfig[]>;
  browseAndAdd: () => Promise<void>;
  open: () => void;
  close: () => void;
}

function persist(state: { terminals: TerminalConfig[]; defaultTerminalId: string }) {
  const settings: AppSettings = {
    terminals: state.terminals,
    defaultTerminalId: state.defaultTerminalId,
  };
  window.office?.saveSettings(settings).catch((err: unknown) => {
    console.error('[Settings] Failed to persist:', err);
  });
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  terminals: [],
  defaultTerminalId: '',
  isLoaded: false,
  isOpen: false,

  load: async () => {
    const settings = await window.office.getSettings();
    set({
      terminals: settings.terminals,
      defaultTerminalId: settings.defaultTerminalId,
      isLoaded: true,
    });
  },

  addTerminal: async (config) => {
    const { terminals } = get();
    if (terminals.some(t => t.id === config.id)) return;
    const updated = [...terminals, config];
    set({ terminals: updated });
    persist({ terminals: updated, defaultTerminalId: get().defaultTerminalId });
  },

  removeTerminal: async (id) => {
    const { terminals, defaultTerminalId } = get();
    const target = terminals.find(t => t.id === id);
    if (!target || target.isBuiltIn) return;
    const updated = terminals.filter(t => t.id !== id);
    const newDefault = defaultTerminalId === id ? 'terminal' : defaultTerminalId;
    set({ terminals: updated, defaultTerminalId: newDefault });
    persist({ terminals: updated, defaultTerminalId: newDefault });
  },

  setDefault: async (id) => {
    set({ defaultTerminalId: id });
    persist({ terminals: get().terminals, defaultTerminalId: id });
  },

  detectTerminals: async () => {
    const detected = await window.office.detectTerminals();
    for (const t of detected) {
      await get().addTerminal(t);
    }
    return detected;
  },

  browseAndAdd: async () => {
    const result = await window.office.browseTerminalApp();
    if (result) {
      await get().addTerminal(result);
    }
  },

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/src/stores/settings.store.test.ts 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/settings.store.ts tests/src/stores/settings.store.test.ts
git commit -m "feat(settings): add settings Zustand store with terminal management"
```

---

### Task 5: Create SettingsGear component

**Files:**
- Create: `src/renderer/src/components/SettingsGear.tsx`

- [ ] **Step 1: Create the gear icon button component**

Create `src/renderer/src/components/SettingsGear.tsx`:

```typescript
import React from 'react';
import { useSettingsStore } from '../stores/settings.store';

export function SettingsGear() {
  const open = useSettingsStore((s) => s.open);

  return (
    <button
      onClick={open}
      title="Settings"
      style={{
        background: 'none',
        border: '1px solid #2a2a4a',
        borderRadius: 2,
        color: '#9ca3af',
        cursor: 'pointer',
        padding: '2px 6px',
        fontSize: 14,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ⚙
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/SettingsGear.tsx
git commit -m "feat(settings): add SettingsGear icon button component"
```

---

### Task 6: Create TerminalPanel component

**Files:**
- Create: `src/renderer/src/components/SettingsModal/TerminalPanel.tsx`

- [ ] **Step 1: Create the terminal panel**

Create `src/renderer/src/components/SettingsModal/TerminalPanel.tsx`:

```typescript
import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settings.store';

export function TerminalPanel() {
  const terminals = useSettingsStore((s) => s.terminals);
  const defaultTerminalId = useSettingsStore((s) => s.defaultTerminalId);
  const removeTerminal = useSettingsStore((s) => s.removeTerminal);
  const setDefault = useSettingsStore((s) => s.setDefault);
  const detectTerminals = useSettingsStore((s) => s.detectTerminals);
  const browseAndAdd = useSettingsStore((s) => s.browseAndAdd);

  const [detectLabel, setDetectLabel] = useState('+ DETECT TERMINALS');

  const handleDetect = async () => {
    const found = await detectTerminals();
    if (found.length === 0) {
      setDetectLabel('None found');
      setTimeout(() => setDetectLabel('+ DETECT TERMINALS'), 1500);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: 8,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(42, 42, 74, 0.3)',
    border: '1px solid #2a2a4a',
    borderRadius: 2,
    marginBottom: 6,
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Default Terminal highlight */}
      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>Default Terminal</div>
        {(() => {
          const def = terminals.find(t => t.id === defaultTerminalId);
          if (!def) return null;
          return (
            <div style={{
              ...rowStyle,
              border: '1px solid rgba(74, 222, 128, 0.3)',
              background: 'rgba(74, 222, 128, 0.05)',
              marginBottom: 0,
            }}>
              <span style={{ fontSize: 14 }}>🖥</span>
              <span style={{ fontSize: 12, color: '#e5e5e5', flex: 1 }}>{def.name}</span>
              <span style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#4ade80',
              }}>● DEFAULT</span>
            </div>
          );
        })()}
      </div>

      {/* Terminal list */}
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Available Terminals</div>
        {terminals.map((t) => (
          <div key={t.id} style={rowStyle}>
            <span style={{ fontSize: 14 }}>🖥</span>
            <span style={{ fontSize: 12, color: '#e5e5e5', flex: 1 }}>{t.name}</span>
            {t.id === defaultTerminalId ? (
              <span style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#4ade80',
                background: 'rgba(74, 222, 128, 0.1)',
                padding: '2px 6px',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 2,
              }}>DEFAULT</span>
            ) : (
              <button
                onClick={() => setDefault(t.id)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  border: '1px solid #2a2a4a',
                  borderRadius: 2,
                  background: 'none',
                }}
              >
                SET DEFAULT
              </button>
            )}
            {!t.isBuiltIn && (
              <button
                onClick={() => removeTerminal(t.id)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: '#6b7280',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleDetect}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'rgba(59, 130, 246, 0.12)',
            border: '2px solid #3b82f6',
            borderRadius: 2,
            color: '#3b82f6',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          [ {detectLabel} ]
        </button>
        <button
          onClick={browseAndAdd}
          style={{
            padding: '8px 12px',
            background: 'rgba(42, 42, 74, 0.3)',
            border: '2px solid #2a2a4a',
            borderRadius: 2,
            color: '#9ca3af',
            fontFamily: 'monospace',
            fontSize: 11,
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
        >
          [ BROWSE... ]
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/SettingsModal/TerminalPanel.tsx
git commit -m "feat(settings): add TerminalPanel component with detect and browse"
```

---

### Task 7: Create SettingsModal component

**Files:**
- Create: `src/renderer/src/components/SettingsModal/SettingsModal.tsx`

- [ ] **Step 1: Create the modal container**

Create `src/renderer/src/components/SettingsModal/SettingsModal.tsx`:

```typescript
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings.store';
import { TerminalPanel } from './TerminalPanel';

export function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const close = useSettingsStore((s) => s.close);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      close();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: 480,
          maxHeight: '80vh',
          background: 'rgba(15, 15, 26, 0.97)',
          border: '2px solid #3b82f6',
          borderRadius: 2,
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.15), 0 8px 32px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Title bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '2px solid #2a2a4a',
          background: 'rgba(59, 130, 246, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚙</span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: 700,
              color: '#e5e5e5',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}>Settings</span>
          </div>
          <button
            onClick={close}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              color: '#6b7280',
              cursor: 'pointer',
              padding: '0 4px',
              border: '1px solid #2a2a4a',
              borderRadius: 2,
              background: 'none',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '2px solid #2a2a4a' }}>
          <div style={{
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#3b82f6',
            borderBottom: '2px solid #3b82f6',
            marginBottom: -2,
            letterSpacing: '0.5px',
          }}>
            TERMINAL
          </div>
          <div style={{
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#4a4a6a',
            letterSpacing: '0.5px',
          }}>
            GENERAL
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TerminalPanel />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/SettingsModal/SettingsModal.tsx
git commit -m "feat(settings): add SettingsModal with pixel-accented chrome and tab bar"
```

---

## Chunk 3: Integration (Wire into screens, update LobbyFAB)

### Task 8: Integrate settings into App, Lobby, and Office screens

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/screens/LobbyScreen.tsx`
- Modify: `src/renderer/src/components/TopBar/TopBar.tsx`

- [ ] **Step 1: Add settings load and modal to App.tsx**

Replace the contents of `src/renderer/src/App.tsx`:

```typescript
import React, { useEffect } from 'react';
import { useAppStore } from './stores/app.store';
import { useSettingsStore } from './stores/settings.store';
import { LobbyScreen } from './screens/LobbyScreen';
import { OfficeScreen } from './screens/OfficeScreen';
import { SettingsModal } from './components/SettingsModal/SettingsModal';

export function App() {
  const screen = useAppStore((s) => s.screen);

  useEffect(() => {
    useSettingsStore.getState().load();
  }, []);

  return (
    <>
      {screen === 'office' ? <OfficeScreen /> : <LobbyScreen />}
      <SettingsModal />
    </>
  );
}
```

- [ ] **Step 2: Add SettingsGear to LobbyScreen**

Replace the contents of `src/renderer/src/screens/LobbyScreen.tsx`:

```typescript
import React from 'react';
import { SessionPanel } from '../components/SessionPanel/SessionPanel';
import { LobbyCanvas } from '../lobby/LobbyCanvas';
import { LobbyFAB } from '../components/LobbyFAB/LobbyFAB';
import { SettingsGear } from '../components/SettingsGear';

export function LobbyScreen() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5', position: 'relative' }}>
      <SessionPanel />
      <LobbyCanvas />
      <LobbyFAB />
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 20 }}>
        <SettingsGear />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add SettingsGear to TopBar**

In `src/renderer/src/components/TopBar/TopBar.tsx`, add the import at the top:

```typescript
import { SettingsGear } from '../SettingsGear';
```

Add the gear icon before the cost display. Replace the line (line 81):
```typescript
      <span style={{ marginLeft: 'auto' }}>${totalCost.toFixed(2)}</span>
```
with:
```typescript
      <span style={{ marginLeft: 'auto' }}><SettingsGear /></span>
      <span>${totalCost.toFixed(2)}</span>
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/screens/LobbyScreen.tsx src/renderer/src/components/TopBar/TopBar.tsx
git commit -m "feat(settings): integrate gear icon and modal into Lobby and Office screens"
```

---

### Task 9: Add terminal selector to LobbyFAB and update app store

**Files:**
- Modify: `src/renderer/src/stores/app.store.ts:8-12,23,57-68`
- Modify: `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx`

- [ ] **Step 1: Update PendingSession and createSession in app.store.ts**

In `src/renderer/src/stores/app.store.ts`, update `PendingSession` interface (lines 8-12). Replace:

```typescript
interface PendingSession {
  tool: string;
  directory: string;
  createdAt: number;
}
```

with:

```typescript
interface PendingSession {
  tool: string;
  directory: string;
  terminalId?: string;
  createdAt: number;
}
```

Update the `createSession` type in `AppState` (line 23). Replace:

```typescript
  createSession: (tool: string, directory: string) => void;
```

with:

```typescript
  createSession: (tool: string, directory: string, terminalId?: string) => void;
```

Update the `createSession` implementation (lines 57-68). Replace:

```typescript
  createSession: (tool, directory) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'office',
      selectedSessionId: null,
      selectedSessionTitle: null,
      pendingSession: { tool, directory, createdAt: Date.now() },
      dispatchInFlight: false,
    });
  },
```

with:

```typescript
  createSession: (tool, directory, terminalId?) => {
    useOfficeStore.getState().reset();
    useChatStore.getState().reset();
    useKanbanStore.getState().reset();
    set({
      screen: 'office',
      selectedSessionId: null,
      selectedSessionTitle: null,
      pendingSession: { tool, directory, ...(terminalId ? { terminalId } : {}), createdAt: Date.now() },
      dispatchInFlight: false,
    });
  },
```

> **Note:** Using conditional spread `...(terminalId ? { terminalId } : {})` prevents `terminalId: undefined` from being added to the object, which would break existing `toEqual` assertions in `tests/src/stores/app.store.session-creation.test.ts`.

- [ ] **Step 2: Update LobbyFAB with terminal selector row**

In `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx`, add the import at the top (after line 2):

```typescript
import { useSettingsStore } from '../../stores/settings.store';
```

Add terminal state inside the `LobbyFAB` component (after line 15 — the `popoverRef` line):

```typescript
  const terminals = useSettingsStore((s) => s.terminals);
  const defaultTerminalId = useSettingsStore((s) => s.defaultTerminalId);
  const [selectedTerminal, setSelectedTerminal] = useState<string>(defaultTerminalId);
```

Add a `useEffect` to sync the selected terminal when the default changes (after the existing `useEffect` on line 35):

```typescript
  useEffect(() => {
    if (defaultTerminalId) setSelectedTerminal(defaultTerminalId);
  }, [defaultTerminalId]);
```

Update `handleStart` to pass `terminalId`. Replace lines 43-51:

```typescript
  const handleStart = async () => {
    if (!selectedDir) return;
    if (window.office?.createSession) {
      await window.office.createSession(selectedTool, selectedDir, selectedTerminal || undefined);
    }
    createSession(selectedTool, selectedDir, selectedTerminal || undefined);
    setOpen(false);
    setSelectedDir(null);
  };
```

Add the terminal selector row in the popover JSX, after the Tool buttons `</div>` (after line 96) and before the "Choose Folder..." button:

```typescript
          {terminals.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Terminal
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {terminals.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTerminal(t.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: selectedTerminal === t.id ? '1px solid #3b82f6' : '1px solid #2a2a4a',
                      background: selectedTerminal === t.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(42, 42, 74, 0.3)',
                      color: selectedTerminal === t.id ? '#3b82f6' : '#9ca3af',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {t.name}{t.id === defaultTerminalId ? ' ●' : ''}
                  </button>
                ))}
              </div>
            </>
          )}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/app.store.ts src/renderer/src/components/LobbyFAB/LobbyFAB.tsx
git commit -m "feat(settings): add terminal selector to LobbyFAB with per-session override"
```

---

### Task 10: Run full test suite and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Verify dev build starts**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds
