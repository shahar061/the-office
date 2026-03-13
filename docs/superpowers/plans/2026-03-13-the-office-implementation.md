# The Office — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Electron app that visualizes AI agent activity as animated pixel-art characters in a virtual office, with an integrated chat panel for dispatching prompts to Claude Code and OpenCode.

**Architecture:** Three-layer Electron app. Main process owns adapters (Claude Agent SDK, JSONL transcript watcher, OpenCode bridge) that emit unified AgentEvents via IPC. Renderer uses React for UI (chat, overlays) and PixiJS for the pixel office canvas (tilemap, characters, furniture). Three Zustand stores bridge events to visuals.

**Tech Stack:** Electron 33+, React 19, TypeScript, PixiJS 8, Zustand, electron-vite, chokidar, better-sqlite3, @anthropic-ai/claude-agent-sdk

**Spec:** `docs/superpowers/specs/2026-03-13-the-office-electron-app-design.md`

---

## File Structure

```
the-office/
├── electron/
│   ├── main.ts                          # Electron app entry, window creation, IPC handlers
│   ├── preload.ts                       # contextBridge exposing OfficeAPI
│   ├── adapters/
│   │   ├── types.ts                     # ToolAdapter base class, AdapterConfig (main-only)
│   │   ├── claude-sdk.adapter.ts        # Wraps @anthropic-ai/claude-agent-sdk
│   │   ├── claude-transcript.adapter.ts # Watches ~/.claude/projects/ JSONL files
│   │   └── opencode.adapter.ts          # Spawns opencode subprocess, polls SQLite
│   ├── session-manager.ts               # Unifies adapters, routes events to renderer via IPC
│   └── kanban-watcher.ts                # Watches docs/office/tasks.yaml + build status files
├── shared/
│   └── types.ts                         # All shared types: AgentEvent, AgentRole, KanbanState, IPC_CHANNELS, OfficeAPI
├── src/
│   ├── main.tsx                         # React entry point
│   ├── App.tsx                          # Root layout: TopBar + ChatPanel + OfficeCanvas
│   ├── stores/
│   │   ├── office.store.ts              # Agent characters: positions, states, animations
│   │   ├── chat.store.ts                # Messages, prompt history, phase tracking
│   │   └── kanban.store.ts              # Task board state from KanbanWatcher
│   ├── components/
│   │   ├── ChatPanel/
│   │   │   ├── ChatPanel.tsx            # Container: phase indicator + messages + input
│   │   │   ├── MessageThread.tsx        # Scrollable message list
│   │   │   ├── MessageBubble.tsx        # Single message with agent color + role
│   │   │   └── PromptInput.tsx          # Input bar + command chips
│   │   ├── TopBar/
│   │   │   └── TopBar.tsx               # Connection status, cost, tokens
│   │   └── StatsOverlay/
│   │       └── StatsOverlay.tsx         # Floating stats + agent heatmap dots
│   ├── office/
│   │   ├── OfficeCanvas.tsx             # PixiJS Application wrapper, resize handling
│   │   ├── OfficeScene.ts              # Orchestrates tilemap + furniture + characters
│   │   ├── characters/
│   │   │   ├── Character.ts             # State machine: IDLE/WALK/TYPE/READ + update()
│   │   │   ├── CharacterSprite.ts       # PixiJS AnimatedSprite, direction, frame selection
│   │   │   └── agents.config.ts         # 14 agent definitions: role, color, desk tile, group
│   │   ├── furniture/
│   │   │   ├── Whiteboard.ts            # Kanban board PixiJS sprite, reads KanbanStore
│   │   │   ├── PresentationScreen.ts    # Boardroom wall screen, shows doc title
│   │   │   └── furniture.config.ts      # All furniture: type, size, position, sprite key
│   │   ├── ui/
│   │   │   ├── SpeechBubble.ts          # PixiJS bubble above character
│   │   │   └── AgentLabel.ts            # Name + role text below character
│   │   └── engine/
│   │       ├── pathfinding.ts           # BFS on walkability grid
│   │       ├── camera.ts               # Pan, zoom, lerp, phase-driven focus targets
│   │       └── tilemap.ts              # Load layout JSON, tile types, walkability grid
│   └── assets/
│       ├── characters/                  # 14 PNG sprite sheets (112×96 each)
│       ├── tiles/                       # Floor + wall tilesets (16×16 PNGs)
│       ├── furniture/                   # Furniture sprites (various sizes)
│       └── office-layout.json           # Pre-designed 40×24 tile layout
├── tests/
│   ├── smoke.test.ts                    # Validates core types (colors, roles)
│   ├── electron/
│   │   ├── adapters/
│   │   │   ├── claude-transcript.adapter.test.ts
│   │   │   └── opencode.adapter.test.ts
│   │   └── session-manager.test.ts
│   └── src/
│       ├── stores/
│       │   ├── office.store.test.ts
│       │   ├── chat.store.test.ts
│       │   └── kanban.store.test.ts
│       └── office/
│           ├── engine/
│           │   ├── pathfinding.test.ts
│           │   └── tilemap.test.ts
│           └── characters/
│               └── Character.test.ts
├── package.json
├── electron-vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vitest.config.ts
└── index.html
```

---

## Chunk 1: Project Scaffolding & Core Types

### Task 1: Initialize Electron + Vite + React project

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `electron-vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

- [ ] **Step 1: Initialize project and install core dependencies**

```bash
npm init -y
npm install --save-dev electron electron-vite vite @vitejs/plugin-react typescript @types/node
npm install react react-dom
npm install --save-dev @types/react @types/react-dom
```

- [ ] **Step 1b: Create .gitignore**

```
node_modules/
dist/
.superpowers/
*.tsbuildinfo
```

- [ ] **Step 2: Create electron-vite.config.ts**

```typescript
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        external: ['better-sqlite3'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
    },
  },
});
```

- [ ] **Step 3: Create tsconfig.json for renderer**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@electron/*": ["electron/*"]
    }
  },
  "include": ["src/**/*", "electron/**/*"]
}
```

- [ ] **Step 4: Create tsconfig.node.json for main/preload**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": false,
    "outDir": "dist"
  },
  "include": ["electron/**/*"]
}
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
    <title>The Office</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src/main.tsx**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 7: Create minimal src/App.tsx**

```tsx
import React from 'react';

export function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <div style={{ width: 320, borderRight: '1px solid #2a2a4a', padding: 16 }}>
        Chat Panel (placeholder)
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Pixel Office (placeholder)
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create electron/main.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'The Office',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
```

- [ ] **Step 9: Create electron/preload.ts (minimal)**

```typescript
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('office', {
  ping: () => 'pong',
});
```

- [ ] **Step 10: Update package.json scripts**

Ensure these scripts exist:

```json
{
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 11: Verify the app launches**

```bash
npm run dev
```

Expected: Electron window opens showing "Chat Panel (placeholder)" on the left and "Pixel Office (placeholder)" on the right. Dark background (#0f0f1a).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + Vite + React project"
```

---

### Task 2: Define core types (single source of truth in shared/)

**Files:**
- Create: `shared/types.ts`
- Create: `electron/adapters/types.ts`

- [ ] **Step 1: Create shared/types.ts (all shared types, no Node.js deps)**

```typescript
// Single source of truth for types shared between main process and renderer.
// No Node.js imports — this file must be safe for both environments.

// --- Agent Roles ---

export const AGENT_ROLES = [
  'ceo', 'product-manager', 'market-researcher', 'chief-architect',
  'agent-organizer', 'project-manager', 'team-lead',
  'backend-engineer', 'frontend-engineer', 'mobile-developer',
  'ui-ux-expert', 'data-engineer', 'devops', 'automation-developer',
  'freelancer',
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_GROUPS = {
  leadership: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
  coordination: ['agent-organizer', 'project-manager', 'team-lead'],
  engineering: ['backend-engineer', 'frontend-engineer', 'mobile-developer', 'ui-ux-expert', 'data-engineer', 'devops', 'automation-developer'],
} as const;

export const AGENT_COLORS: Record<AgentRole, string> = {
  'ceo': '#3b82f6',
  'product-manager': '#14b8a6',
  'market-researcher': '#22c55e',
  'chief-architect': '#f97316',
  'agent-organizer': '#a855f7',
  'project-manager': '#0ea5e9',
  'team-lead': '#f59e0b',
  'backend-engineer': '#10b981',
  'frontend-engineer': '#6366f1',
  'mobile-developer': '#8b5cf6',
  'ui-ux-expert': '#f43f5e',
  'data-engineer': '#06b6d4',
  'devops': '#ef4444',
  'automation-developer': '#ec4899',
  'freelancer': '#9ca3af',
};

// --- Agent Events ---

export type AgentEventType =
  | 'agent:created'
  | 'agent:tool:start'
  | 'agent:tool:done'
  | 'agent:tool:clear'
  | 'agent:waiting'
  | 'agent:permission'
  | 'agent:message'
  | 'agent:closed'
  | 'session:cost:update';

export interface AgentEvent {
  agentId: string;
  agentRole: AgentRole;
  source: 'sdk' | 'transcript' | 'opencode';
  type: AgentEventType;
  toolName?: string;
  toolId?: string;
  message?: string;
  cost?: number;
  tokens?: number;
  timestamp: number;
}

// --- Connection Status ---

export interface ConnectionStatus {
  claudeCode: 'connected' | 'disconnected' | 'error';
  openCode: 'connected' | 'disconnected' | 'error';
}

// --- Kanban ---

export interface KanbanTask {
  id: string;
  description: string;
  status: 'queued' | 'active' | 'review' | 'done' | 'failed';
  assignedAgent: AgentRole;
  phaseId: string;
}

export interface KanbanState {
  projectName: string;
  currentPhase: string;
  completionPercent: number;
  tasks: KanbanTask[];
}

// --- Session Info ---

export interface SessionInfo {
  sessionId: string;
  agentRole: AgentRole;
  source: 'sdk' | 'transcript' | 'opencode';
  startedAt: number;
}

// --- IPC Channels ---

export const IPC_CHANNELS = {
  AGENT_EVENT: 'office:agent-event',
  CONNECTION_STATUS: 'office:connection-status',
  KANBAN_UPDATE: 'office:kanban-update',
  DISPATCH: 'office:dispatch',
  GET_SESSIONS: 'office:get-sessions',
  APPROVE_PERMISSION: 'office:approve-permission',
  DENY_PERMISSION: 'office:deny-permission',
  GET_KANBAN: 'office:get-kanban',
} as const;

// --- OfficeAPI (renderer window global) ---

export interface OfficeAPI {
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void;
  dispatch(prompt: string, agentRole?: AgentRole): Promise<{ sessionId: string }>;
  getActiveSessions(): Promise<SessionInfo[]>;
  approvePermission(agentId: string, toolId: string): Promise<void>;
  denyPermission(agentId: string, toolId: string): Promise<void>;
  getKanbanState(): Promise<KanbanState>;
  onKanbanUpdate(callback: (state: KanbanState) => void): () => void;
}

declare global {
  interface Window {
    office: OfficeAPI;
  }
}
```

- [ ] **Step 2: Create electron/adapters/types.ts (main-process-only types)**

```typescript
import { EventEmitter } from 'events';
import type { AgentEvent, AgentRole } from '../../shared/types';

// Re-export shared types for convenience
export * from '../../shared/types';

// --- Adapter Interface (Node.js only — uses EventEmitter) ---

export interface AdapterConfig {
  projectDir: string;
}

export abstract class ToolAdapter extends EventEmitter {
  abstract start(config: AdapterConfig): void;
  abstract stop(): void;
  dispatch?(prompt: string, agentRole: AgentRole): Promise<void>;

  protected emitAgentEvent(event: AgentEvent): void {
    this.emit('agentEvent', event);
  }
}
```

- [ ] **Step 3: Update tsconfig.json to include shared/**

Add `"shared/**/*"` to the `"include"` array in `tsconfig.json`.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts electron/adapters/types.ts tsconfig.json
git commit -m "feat: define core types — AgentEvent, ToolAdapter, OfficeAPI, AgentRole"
```

---

### Task 3: Set up IPC bridge (preload.ts)

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Implement full preload bridge**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { AgentEvent, ConnectionStatus, KanbanState, AgentRole, SessionInfo } from '../shared/types';

contextBridge.exposeInMainWorld('office', {
  onAgentEvent(callback: (event: AgentEvent) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, event: AgentEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler);
  },

  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, status: ConnectionStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONNECTION_STATUS, handler);
  },

  onKanbanUpdate(callback: (state: KanbanState) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, state: KanbanState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.KANBAN_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.KANBAN_UPDATE, handler);
  },

  dispatch(prompt: string, agentRole?: AgentRole): Promise<{ sessionId: string }> {
    return ipcRenderer.invoke(IPC_CHANNELS.DISPATCH, prompt, agentRole);
  },

  getActiveSessions(): Promise<SessionInfo[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS);
  },

  approvePermission(agentId: string, toolId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.APPROVE_PERMISSION, agentId, toolId);
  },

  denyPermission(agentId: string, toolId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.DENY_PERMISSION, agentId, toolId);
  },

  getKanbanState(): Promise<KanbanState> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_KANBAN);
  },
});
```

- [ ] **Step 2: Verify app still launches**

```bash
npm run dev
```

Expected: App launches without errors. No console errors about preload.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: implement IPC bridge with typed OfficeAPI"
```

---

### Task 4: Set up test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Install test dependencies**

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
});
```

- [ ] **Step 3: Create a smoke test to verify test infra works**

Create `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AGENT_ROLES, AGENT_COLORS } from '../electron/adapters/types';

describe('Core types', () => {
  it('defines 15 agent roles (14 + freelancer)', () => {
    expect(AGENT_ROLES).toHaveLength(15);
  });

  it('has a unique color for every role', () => {
    const colors = Object.values(AGENT_COLORS);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(colors.length);
  });

  it('has a color defined for every role', () => {
    for (const role of AGENT_ROLES) {
      expect(AGENT_COLORS[role]).toBeDefined();
      expect(AGENT_COLORS[role]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/smoke.test.ts
git commit -m "feat: set up vitest test infrastructure with smoke test"
```

---

### Task 5: Install renderer dependencies (PixiJS, Zustand)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install PixiJS and Zustand**

```bash
npm install pixi.js@^8 @pixi/react zustand
```

- [ ] **Step 2: Install chokidar and better-sqlite3 for main process**

```bash
npm install chokidar better-sqlite3
npm install --save-dev @types/better-sqlite3
```

- [ ] **Step 3: Verify the app still launches**

```bash
npm run dev
```

Expected: App launches. No module resolution errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install PixiJS 8, Zustand, chokidar, better-sqlite3"
```

---

## Chunk 2: Zustand Stores & PixiJS Canvas Shell

### Task 6: Create agent configuration

**Files:**
- Create: `src/office/characters/agents.config.ts`

- [ ] **Step 1: Create agents.config.ts with 14 agent definitions**

```typescript
import { AGENT_COLORS, type AgentRole } from '../../../shared/types';

export interface AgentConfig {
  role: AgentRole;
  displayName: string;
  color: string;
  group: 'leadership' | 'coordination' | 'engineering';
  deskTile: { x: number; y: number };
  idleZone: 'boardroom' | 'coordination' | 'bullpen' | 'common';
}

export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  'ceo': {
    role: 'ceo', displayName: 'CEO', color: AGENT_COLORS['ceo'],
    group: 'leadership', deskTile: { x: 5, y: 8 }, idleZone: 'boardroom',
  },
  'product-manager': {
    role: 'product-manager', displayName: 'Product Manager', color: AGENT_COLORS['product-manager'],
    group: 'leadership', deskTile: { x: 5, y: 10 }, idleZone: 'boardroom',
  },
  'market-researcher': {
    role: 'market-researcher', displayName: 'Market Researcher', color: AGENT_COLORS['market-researcher'],
    group: 'leadership', deskTile: { x: 7, y: 8 }, idleZone: 'boardroom',
  },
  'chief-architect': {
    role: 'chief-architect', displayName: 'Chief Architect', color: AGENT_COLORS['chief-architect'],
    group: 'leadership', deskTile: { x: 7, y: 10 }, idleZone: 'boardroom',
  },
  'agent-organizer': {
    role: 'agent-organizer', displayName: 'Agent Organizer', color: AGENT_COLORS['agent-organizer'],
    group: 'coordination', deskTile: { x: 14, y: 8 }, idleZone: 'coordination',
  },
  'project-manager': {
    role: 'project-manager', displayName: 'Project Manager', color: AGENT_COLORS['project-manager'],
    group: 'coordination', deskTile: { x: 14, y: 10 }, idleZone: 'coordination',
  },
  'team-lead': {
    role: 'team-lead', displayName: 'Team Lead', color: AGENT_COLORS['team-lead'],
    group: 'coordination', deskTile: { x: 14, y: 12 }, idleZone: 'coordination',
  },
  'backend-engineer': {
    role: 'backend-engineer', displayName: 'Backend Engineer', color: AGENT_COLORS['backend-engineer'],
    group: 'engineering', deskTile: { x: 24, y: 6 }, idleZone: 'bullpen',
  },
  'frontend-engineer': {
    role: 'frontend-engineer', displayName: 'Frontend Engineer', color: AGENT_COLORS['frontend-engineer'],
    group: 'engineering', deskTile: { x: 27, y: 6 }, idleZone: 'bullpen',
  },
  'mobile-developer': {
    role: 'mobile-developer', displayName: 'Mobile Developer', color: AGENT_COLORS['mobile-developer'],
    group: 'engineering', deskTile: { x: 30, y: 6 }, idleZone: 'bullpen',
  },
  'ui-ux-expert': {
    role: 'ui-ux-expert', displayName: 'UI/UX Expert', color: AGENT_COLORS['ui-ux-expert'],
    group: 'engineering', deskTile: { x: 33, y: 6 }, idleZone: 'bullpen',
  },
  'data-engineer': {
    role: 'data-engineer', displayName: 'Data Engineer', color: AGENT_COLORS['data-engineer'],
    group: 'engineering', deskTile: { x: 24, y: 10 }, idleZone: 'bullpen',
  },
  'devops': {
    role: 'devops', displayName: 'DevOps', color: AGENT_COLORS['devops'],
    group: 'engineering', deskTile: { x: 27, y: 10 }, idleZone: 'bullpen',
  },
  'automation-developer': {
    role: 'automation-developer', displayName: 'Automation Dev', color: AGENT_COLORS['automation-developer'],
    group: 'engineering', deskTile: { x: 30, y: 10 }, idleZone: 'bullpen',
  },
  'freelancer': {
    role: 'freelancer', displayName: 'Freelancer', color: AGENT_COLORS['freelancer'],
    group: 'engineering', deskTile: { x: 33, y: 10 }, idleZone: 'common',
  },
};

export function getAgentConfig(role: AgentRole): AgentConfig {
  return AGENT_CONFIGS[role];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/office/characters/agents.config.ts
git commit -m "feat: add 14 agent config definitions with desk positions and colors"
```

---

### Task 7: Create OfficeStore (Zustand)

**Files:**
- Create: `src/stores/office.store.ts`
- Create: `tests/src/stores/office.store.test.ts`

- [ ] **Step 1: Write failing tests for OfficeStore**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useOfficeStore } from '../../../src/stores/office.store';
import type { AgentEvent } from '../../../shared/types';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    agentId: 'agent-1',
    agentRole: 'backend-engineer',
    source: 'transcript',
    type: 'agent:created',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('OfficeStore', () => {
  beforeEach(() => {
    useOfficeStore.getState().reset();
  });

  it('starts with empty agents map', () => {
    expect(useOfficeStore.getState().agents).toEqual({});
  });

  it('adds agent on agent:created event', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    const agents = useOfficeStore.getState().agents;
    expect(agents['agent-1']).toBeDefined();
    expect(agents['agent-1'].role).toBe('backend-engineer');
    expect(agents['agent-1'].state).toBe('idle');
  });

  it('sets agent to typing on tool:start with Write tool', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start', toolName: 'Write' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('type');
    expect(useOfficeStore.getState().agents['agent-1'].currentTool).toBe('Write');
  });

  it('sets agent to reading on tool:start with Read tool', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start', toolName: 'Read' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('read');
  });

  it('returns agent to idle on tool:done', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start', toolName: 'Write' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:done' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('idle');
  });

  it('removes agent on agent:closed', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:closed' }));
    expect(useOfficeStore.getState().agents['agent-1']).toBeUndefined();
  });

  it('sets waiting state on agent:waiting', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:waiting' }));
    expect(useOfficeStore.getState().agents['agent-1'].state).toBe('idle');
    expect(useOfficeStore.getState().agents['agent-1'].waiting).toBe(true);
  });

  it('sets permission flag on agent:permission', () => {
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:created' }));
    useOfficeStore.getState().handleAgentEvent(makeEvent({ type: 'agent:permission', toolName: 'Bash', toolId: 'tool-1' }));
    expect(useOfficeStore.getState().agents['agent-1'].needsPermission).toBe(true);
    expect(useOfficeStore.getState().agents['agent-1'].permissionToolId).toBe('tool-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/src/stores/office.store.test.ts
```

Expected: FAIL — module `../../../src/stores/office.store` not found.

- [ ] **Step 3: Implement OfficeStore**

```typescript
import { create } from 'zustand';
import type { AgentEvent, AgentRole } from '../../shared/types';
import { getAgentConfig } from '../office/characters/agents.config';

const TYPING_TOOLS = ['Write', 'Edit', 'Bash', 'NotebookEdit'];
const READING_TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent'];

export interface AgentCharacter {
  agentId: string;
  role: AgentRole;
  state: 'idle' | 'walk' | 'type' | 'read';
  position: { x: number; y: number };
  target: { x: number; y: number } | null;
  currentTool: string | null;
  waiting: boolean;
  needsPermission: boolean;
  permissionToolId: string | null;
  message: string | null;
}

interface OfficeState {
  agents: Record<string, AgentCharacter>;
  handleAgentEvent: (event: AgentEvent) => void;
  reset: () => void;
}

function toolToState(toolName?: string): 'type' | 'read' {
  if (toolName && READING_TOOLS.includes(toolName)) return 'read';
  return 'type';
}

export const useOfficeStore = create<OfficeState>((set) => ({
  agents: {},

  handleAgentEvent: (event: AgentEvent) => {
    set((state) => {
      const agents = { ...state.agents };

      switch (event.type) {
        case 'agent:created': {
          const config = getAgentConfig(event.agentRole);
          agents[event.agentId] = {
            agentId: event.agentId,
            role: event.agentRole,
            state: 'idle',
            position: { x: config.deskTile.x * 16, y: config.deskTile.y * 16 },
            target: null,
            currentTool: null,
            waiting: false,
            needsPermission: false,
            permissionToolId: null,
            message: null,
          };
          break;
        }
        case 'agent:tool:start': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = {
              ...agent,
              state: toolToState(event.toolName),
              currentTool: event.toolName ?? null,
              waiting: false,
              needsPermission: false,
              permissionToolId: null,
            };
          }
          break;
        }
        case 'agent:tool:done':
        case 'agent:tool:clear': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = { ...agent, state: 'idle', currentTool: null };
          }
          break;
        }
        case 'agent:waiting': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = { ...agent, state: 'idle', waiting: true, currentTool: null };
          }
          break;
        }
        case 'agent:permission': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = {
              ...agent,
              needsPermission: true,
              permissionToolId: event.toolId ?? null,
            };
          }
          break;
        }
        case 'agent:message': {
          const agent = agents[event.agentId];
          if (agent) {
            agents[event.agentId] = { ...agent, message: event.message ?? null };
          }
          break;
        }
        case 'agent:closed': {
          delete agents[event.agentId];
          break;
        }
      }

      return { agents };
    });
  },

  reset: () => set({ agents: {} }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/src/stores/office.store.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/office.store.ts tests/src/stores/office.store.test.ts
git commit -m "feat: implement OfficeStore with agent state machine"
```

---

### Task 8: Create ChatStore (Zustand)

**Files:**
- Create: `src/stores/chat.store.ts`
- Create: `tests/src/stores/chat.store.test.ts`

- [ ] **Step 1: Write failing tests for ChatStore**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../../../src/stores/chat.store';
import type { AgentEvent } from '../../../shared/types';

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    agentId: 'agent-1',
    agentRole: 'ceo',
    source: 'sdk',
    type: 'agent:message',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('starts with empty messages and imagine phase', () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.currentPhase).toBe('imagine');
  });

  it('adds user message via addUserMessage', () => {
    useChatStore.getState().addUserMessage('Hello world');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello world');
  });

  it('adds agent message on agent:message event', () => {
    useChatStore.getState().handleAgentEvent(makeEvent({
      type: 'agent:message',
      message: 'I have a plan',
    }));
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('ceo');
    expect(messages[0].content).toBe('I have a plan');
  });

  it('updates cost on session:cost:update', () => {
    useChatStore.getState().handleAgentEvent(makeEvent({
      type: 'session:cost:update',
      cost: 0.42,
      tokens: 12400,
    }));
    expect(useChatStore.getState().totalCost).toBe(0.42);
    expect(useChatStore.getState().totalTokens).toBe(12400);
  });

  it('allows phase to be set manually', () => {
    useChatStore.getState().setPhase('warroom');
    expect(useChatStore.getState().currentPhase).toBe('warroom');
  });

  it('ignores non-message events', () => {
    useChatStore.getState().handleAgentEvent(makeEvent({ type: 'agent:tool:start' }));
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/src/stores/chat.store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ChatStore**

```typescript
import { create } from 'zustand';
import type { AgentEvent, AgentRole } from '../../shared/types';

export type Phase = 'imagine' | 'warroom' | 'build';

export interface ChatMessage {
  id: string;
  role: AgentRole | 'user' | 'system';
  content: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  currentPhase: Phase;
  totalCost: number;
  totalTokens: number;
  isDispatching: boolean;
  handleAgentEvent: (event: AgentEvent) => void;
  addUserMessage: (content: string) => void;
  setPhase: (phase: Phase) => void;
  setDispatching: (v: boolean) => void;
  reset: () => void;
}

let messageCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  currentPhase: 'imagine',
  totalCost: 0,
  totalTokens: 0,
  isDispatching: false,

  handleAgentEvent: (event: AgentEvent) => {
    set((state) => {
      if (event.type === 'agent:message' && event.message) {
        return {
          messages: [...state.messages, {
            id: `msg-${++messageCounter}`,
            role: event.agentRole,
            content: event.message,
            timestamp: event.timestamp,
          }],
        };
      }
      if (event.type === 'session:cost:update') {
        return {
          totalCost: event.cost ?? state.totalCost,
          totalTokens: event.tokens ?? state.totalTokens,
        };
      }
      return {};
    });
  },

  addUserMessage: (content: string) => {
    set((state) => ({
      messages: [...state.messages, {
        id: `msg-${++messageCounter}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      }],
    }));
  },

  setPhase: (phase: Phase) => set({ currentPhase: phase }),
  setDispatching: (v: boolean) => set({ isDispatching: v }),
  reset: () => {
    messageCounter = 0;
    return set({ messages: [], currentPhase: 'imagine', totalCost: 0, totalTokens: 0, isDispatching: false });
  },
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/src/stores/chat.store.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/chat.store.ts tests/src/stores/chat.store.test.ts
git commit -m "feat: implement ChatStore with message thread and cost tracking"
```

---

### Task 9: Create KanbanStore (Zustand)

**Files:**
- Create: `src/stores/kanban.store.ts`
- Create: `tests/src/stores/kanban.store.test.ts`

- [ ] **Step 1: Write failing tests for KanbanStore**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useKanbanStore } from '../../../src/stores/kanban.store';
import type { KanbanState } from '../../../shared/types';

const mockState: KanbanState = {
  projectName: 'The Office',
  currentPhase: 'build',
  completionPercent: 40,
  tasks: [
    { id: 't-1', description: 'Set up project', status: 'done', assignedAgent: 'devops', phaseId: 'phase-1' },
    { id: 't-2', description: 'Build UI', status: 'active', assignedAgent: 'frontend-engineer', phaseId: 'phase-2' },
    { id: 't-3', description: 'Write tests', status: 'queued', assignedAgent: 'backend-engineer', phaseId: 'phase-2' },
  ],
};

describe('KanbanStore', () => {
  beforeEach(() => {
    useKanbanStore.getState().reset();
  });

  it('starts with null state', () => {
    expect(useKanbanStore.getState().kanban).toBeNull();
  });

  it('updates state via handleKanbanUpdate', () => {
    useKanbanStore.getState().handleKanbanUpdate(mockState);
    expect(useKanbanStore.getState().kanban).toEqual(mockState);
  });

  it('replaces previous state on update', () => {
    useKanbanStore.getState().handleKanbanUpdate(mockState);
    const updated = { ...mockState, completionPercent: 80 };
    useKanbanStore.getState().handleKanbanUpdate(updated);
    expect(useKanbanStore.getState().kanban?.completionPercent).toBe(80);
  });

  it('computes task counts by status', () => {
    useKanbanStore.getState().handleKanbanUpdate(mockState);
    const counts = useKanbanStore.getState().getTaskCounts();
    expect(counts).toEqual({ queued: 1, active: 1, review: 0, done: 1, failed: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/src/stores/kanban.store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement KanbanStore**

```typescript
import { create } from 'zustand';
import type { KanbanState } from '../../shared/types';

interface KanbanStoreState {
  kanban: KanbanState | null;
  handleKanbanUpdate: (state: KanbanState) => void;
  getTaskCounts: () => Record<string, number>;
  reset: () => void;
}

export const useKanbanStore = create<KanbanStoreState>((set, get) => ({
  kanban: null,

  handleKanbanUpdate: (kanban: KanbanState) => set({ kanban }),

  getTaskCounts: () => {
    const kanban = get().kanban;
    if (!kanban) return { queued: 0, active: 0, review: 0, done: 0, failed: 0 };
    const counts: Record<string, number> = { queued: 0, active: 0, review: 0, done: 0, failed: 0 };
    for (const task of kanban.tasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    return counts;
  },

  reset: () => set({ kanban: null }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/src/stores/kanban.store.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/kanban.store.ts tests/src/stores/kanban.store.test.ts
git commit -m "feat: implement KanbanStore with task state tracking"
```

---

### Task 10: Create OfficeCanvas (PixiJS shell)

**Files:**
- Create: `src/office/OfficeCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create OfficeCanvas.tsx — PixiJS Application wrapper**

```tsx
import React, { useRef, useEffect } from 'react';
import { Application } from 'pixi.js';

export function OfficeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    appRef.current = app;

    const init = async () => {
      await app.init({
        background: '#1a1a2e',
        resizeTo: container,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });
      container.appendChild(app.canvas);
    };

    init();

    return () => {
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  );
}
```

- [ ] **Step 2: Update App.tsx to use OfficeCanvas**

```tsx
import React from 'react';
import { OfficeCanvas } from './office/OfficeCanvas';

export function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <div style={{ width: 320, borderRight: '1px solid #2a2a4a', padding: 16 }}>
        Chat Panel (placeholder)
      </div>
      <OfficeCanvas />
    </div>
  );
}
```

- [ ] **Step 3: Verify app launches with PixiJS canvas**

```bash
npm run dev
```

Expected: App launches. Left panel shows placeholder text. Right area shows a dark PixiJS canvas (#1a1a2e) that resizes with the window.

- [ ] **Step 4: Commit**

```bash
git add src/office/OfficeCanvas.tsx src/App.tsx
git commit -m "feat: add PixiJS canvas shell with resize handling"
```

---

### Task 11: Run all tests and verify green

**Files:** (none — verification only)

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (smoke test + 3 store test files = 21 tests total).

- [ ] **Step 2: Verify app launches end-to-end**

```bash
npm run dev
```

Expected: Electron window with chat placeholder on left, PixiJS canvas on right. No console errors.

---

## Chunk 3: Tilemap Engine & Pathfinding

### Task 12: Create TileMap loader and walkability grid

**Files:**
- Create: `src/office/engine/tilemap.ts`
- Create: `src/assets/office-layout.json`
- Create: `tests/src/office/engine/tilemap.test.ts`

- [ ] **Step 1: Write failing tests for TileMap**

```typescript
import { describe, it, expect } from 'vitest';
import { TileMap, TileType } from '../../../../src/office/engine/tilemap';

const MINI_LAYOUT = {
  width: 4,
  height: 3,
  tileSize: 16,
  tiles: [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 1, 1],
  ],
};

describe('TileMap', () => {
  it('loads layout dimensions', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.width).toBe(4);
    expect(map.height).toBe(3);
    expect(map.tileSize).toBe(16);
  });

  it('returns correct tile type', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.getTile(0, 0)).toBe(TileType.Wall);
    expect(map.getTile(1, 1)).toBe(TileType.Floor);
  });

  it('returns Void for out-of-bounds', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.getTile(-1, 0)).toBe(TileType.Void);
    expect(map.getTile(10, 10)).toBe(TileType.Void);
  });

  it('builds walkability grid', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.isWalkable(1, 1)).toBe(true);
    expect(map.isWalkable(2, 1)).toBe(true);
    expect(map.isWalkable(0, 0)).toBe(false);
  });

  it('converts tile coords to pixel coords', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.tileToPixel(2, 1)).toEqual({ x: 32, y: 16 });
  });

  it('converts pixel coords to tile coords', () => {
    const map = new TileMap(MINI_LAYOUT);
    expect(map.pixelToTile(35, 20)).toEqual({ x: 2, y: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/src/office/engine/tilemap.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement TileMap**

```typescript
export enum TileType {
  Floor = 0,
  Wall = 1,
  Void = 2,
}

export interface TileMapLayout {
  width: number;
  height: number;
  tileSize: number;
  tiles: number[][];
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  private tiles: number[][];
  private walkable: boolean[][];

  constructor(layout: TileMapLayout) {
    this.width = layout.width;
    this.height = layout.height;
    this.tileSize = layout.tileSize;
    this.tiles = layout.tiles;
    this.walkable = this.buildWalkabilityGrid();
  }

  private buildWalkabilityGrid(): boolean[][] {
    return this.tiles.map((row) => row.map((tile) => tile === TileType.Floor));
  }

  getTile(x: number, y: number): TileType {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return TileType.Void;
    return this.tiles[y][x] as TileType;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.walkable[y][x];
  }

  tileToPixel(tileX: number, tileY: number): { x: number; y: number } {
    return { x: tileX * this.tileSize, y: tileY * this.tileSize };
  }

  pixelToTile(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor(px / this.tileSize), y: Math.floor(py / this.tileSize) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/src/office/engine/tilemap.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Create office-layout.json (40×24 pre-designed layout)**

Create `src/assets/office-layout.json`. This is the pre-designed office floor plan. Tile values: 0=Floor, 1=Wall, 2=Void.

```json
{
  "width": 40,
  "height": 24,
  "tileSize": 16,
  "zones": {
    "boardroom": { "x": 1, "y": 1, "w": 10, "h": 12 },
    "coordination": { "x": 12, "y": 6, "w": 8, "h": 8 },
    "bullpen": { "x": 21, "y": 2, "w": 17, "h": 12 },
    "kanban": { "x": 12, "y": 1, "w": 10, "h": 4 },
    "common": { "x": 26, "y": 16, "w": 12, "h": 7 }
  },
  "tiles": [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
  ]
}
```

This layout defines: walled boardroom (top-left), kanban wall area (top-center), open bullpen (top-right), coordination (center), open bottom floor, and common area (bottom-right behind a wall).

- [ ] **Step 6: Commit**

```bash
git add src/office/engine/tilemap.ts src/assets/office-layout.json tests/src/office/engine/tilemap.test.ts
git commit -m "feat: implement TileMap with walkability grid and office layout"
```

---

### Task 13: Implement BFS pathfinding

**Files:**
- Create: `src/office/engine/pathfinding.ts`
- Create: `tests/src/office/engine/pathfinding.test.ts`

- [ ] **Step 1: Write failing tests for pathfinding**

```typescript
import { describe, it, expect } from 'vitest';
import { findPath } from '../../../../src/office/engine/pathfinding';
import { TileMap } from '../../../../src/office/engine/tilemap';

const LAYOUT = {
  width: 6,
  height: 5,
  tileSize: 16,
  tiles: [
    [1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 0, 1],
    [1, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1],
  ],
};

describe('findPath (BFS)', () => {
  const map = new TileMap(LAYOUT);

  it('finds direct path between adjacent tiles', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 2, y: 1 });
    expect(path).toEqual([{ x: 2, y: 1 }]);
  });

  it('finds path around walls', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 4, y: 1 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 1 });
  });

  it('returns null when no path exists', () => {
    const blockedMap = new TileMap({
      width: 4, height: 3, tileSize: 16,
      tiles: [
        [1, 1, 1, 1],
        [1, 0, 1, 0],
        [1, 1, 1, 1],
      ],
    });
    const path = findPath(blockedMap, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(path).toBeNull();
  });

  it('returns empty array when start equals goal', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 1, y: 1 });
    expect(path).toEqual([]);
  });

  it('does not include start position in path', () => {
    const path = findPath(map, { x: 1, y: 1 }, { x: 2, y: 2 });
    expect(path).not.toBeNull();
    expect(path![0]).not.toEqual({ x: 1, y: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/src/office/engine/pathfinding.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement BFS pathfinding**

```typescript
import { TileMap } from './tilemap';

interface Point {
  x: number;
  y: number;
}

const DIRECTIONS: Point[] = [
  { x: 0, y: -1 }, // up
  { x: 0, y: 1 },  // down
  { x: -1, y: 0 }, // left
  { x: 1, y: 0 },  // right
];

export function findPath(map: TileMap, start: Point, goal: Point): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!map.isWalkable(goal.x, goal.y)) return null;

  const key = (p: Point) => `${p.x},${p.y}`;
  const visited = new Set<string>();
  const parent = new Map<string, Point>();
  const queue: Point[] = [start];
  visited.add(key(start));

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of DIRECTIONS) {
      const next: Point = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = key(next);

      if (visited.has(nextKey) || !map.isWalkable(next.x, next.y)) continue;

      visited.add(nextKey);
      parent.set(nextKey, current);

      if (next.x === goal.x && next.y === goal.y) {
        return reconstructPath(parent, start, goal);
      }

      queue.push(next);
    }
  }

  return null;
}

function reconstructPath(parent: Map<string, Point>, start: Point, goal: Point): Point[] {
  const path: Point[] = [];
  let current = goal;
  const key = (p: Point) => `${p.x},${p.y}`;

  while (!(current.x === start.x && current.y === start.y)) {
    path.unshift(current);
    current = parent.get(key(current))!;
  }

  return path;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/src/office/engine/pathfinding.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/office/engine/pathfinding.ts tests/src/office/engine/pathfinding.test.ts
git commit -m "feat: implement BFS pathfinding on tile grid"
```

---

### Task 14: Create camera controller

**Files:**
- Create: `src/office/engine/camera.ts`

- [ ] **Step 1: Implement camera with pan, zoom, and phase-driven focus**

```typescript
import { Container } from 'pixi.js';

export interface CameraTarget {
  x: number;
  y: number;
  zoom: number;
}

const PHASE_TARGETS: Record<string, CameraTarget> = {
  imagine: { x: 80, y: 96, zoom: 2.5 },    // boardroom center
  warroom: { x: 256, y: 160, zoom: 2.0 },   // coordination area
  build: { x: 320, y: 192, zoom: 1.5 },     // full office view
};

const LERP_SPEED = 0.04;

export class Camera {
  private container: Container;
  private currentX = 320;
  private currentY = 192;
  private currentZoom = 1.5;
  private targetX = 320;
  private targetY = 192;
  private targetZoom = 1.5;
  private viewWidth = 960;
  private viewHeight = 800;
  private manualOverride = false;

  constructor(container: Container) {
    this.container = container;
  }

  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  focusOnPhase(phase: string): void {
    if (this.manualOverride) return;
    const target = PHASE_TARGETS[phase];
    if (target) {
      this.targetX = target.x;
      this.targetY = target.y;
      this.targetZoom = target.zoom;
    }
  }

  panTo(x: number, y: number): void {
    this.manualOverride = true;
    this.targetX = x;
    this.targetY = y;
  }

  setZoom(zoom: number): void {
    this.manualOverride = true;
    this.targetZoom = Math.max(0.5, Math.min(4, zoom));
  }

  resetToPhase(phase: string): void {
    this.manualOverride = false;
    this.focusOnPhase(phase);
  }

  update(): void {
    this.currentX += (this.targetX - this.currentX) * LERP_SPEED;
    this.currentY += (this.targetY - this.currentY) * LERP_SPEED;
    this.currentZoom += (this.targetZoom - this.currentZoom) * LERP_SPEED;

    this.container.scale.set(this.currentZoom);
    this.container.x = this.viewWidth / 2 - this.currentX * this.currentZoom;
    this.container.y = this.viewHeight / 2 - this.currentY * this.currentZoom;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/office/engine/camera.ts
git commit -m "feat: implement camera with lerp panning and phase-driven focus"
```

---

### Task 15: Create OfficeScene orchestrator

**Files:**
- Create: `src/office/OfficeScene.ts`

- [ ] **Step 1: Implement OfficeScene — ties tilemap + camera into PixiJS stage**

```typescript
import { Application, Container, Graphics } from 'pixi.js';
import { TileMap, TileType } from './engine/tilemap';
import { Camera } from './engine/camera';
import officeLayout from '../assets/office-layout.json';

const FLOOR_COLOR = 0x2a2a4a;
const WALL_COLOR = 0x4a4a6a;

export class OfficeScene {
  private app: Application;
  private worldContainer: Container;
  private tileMap: TileMap;
  private camera: Camera;

  constructor(app: Application) {
    this.app = app;
    this.worldContainer = new Container();
    this.app.stage.addChild(this.worldContainer);

    this.tileMap = new TileMap(officeLayout);
    this.camera = new Camera(this.worldContainer);
    this.camera.setViewSize(app.screen.width, app.screen.height);

    this.drawTiles();
    this.camera.focusOnPhase('imagine');

    this.app.ticker.add(() => this.update());
  }

  private drawTiles(): void {
    const g = new Graphics();

    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        const tile = this.tileMap.getTile(x, y);
        if (tile === TileType.Void) continue;

        const color = tile === TileType.Floor ? FLOOR_COLOR : WALL_COLOR;
        g.rect(x * this.tileMap.tileSize, y * this.tileMap.tileSize, this.tileMap.tileSize, this.tileMap.tileSize);
        g.fill(color);
      }
    }

    this.worldContainer.addChild(g);
  }

  private update(): void {
    this.camera.update();
  }

  getTileMap(): TileMap {
    return this.tileMap;
  }

  getCamera(): Camera {
    return this.camera;
  }

  getWorldContainer(): Container {
    return this.worldContainer;
  }

  onResize(width: number, height: number): void {
    this.camera.setViewSize(width, height);
  }
}
```

- [ ] **Step 2: Wire OfficeScene into OfficeCanvas.tsx**

Update `src/office/OfficeCanvas.tsx` — add scene creation after app init:

```tsx
import React, { useRef, useEffect } from 'react';
import { Application } from 'pixi.js';
import { OfficeScene } from './OfficeScene';

export function OfficeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<OfficeScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    appRef.current = app;

    const init = async () => {
      await app.init({
        background: '#1a1a2e',
        resizeTo: container,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });
      container.appendChild(app.canvas);
      sceneRef.current = new OfficeScene(app);
    };

    init();

    const onResize = () => {
      if (sceneRef.current && container) {
        sceneRef.current.onResize(container.clientWidth, container.clientHeight);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      app.destroy(true, { children: true });
      appRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  );
}
```

- [ ] **Step 3: Verify — app shows colored tile grid**

```bash
npm run dev
```

Expected: Electron window shows the tile grid rendered as colored rectangles — dark purple for floors, lighter purple for walls. Camera starts focused on the boardroom area (top-left).

- [ ] **Step 4: Commit**

```bash
git add src/office/OfficeScene.ts src/office/OfficeCanvas.tsx
git commit -m "feat: render office tilemap with camera and phase-driven focus"
```

---

## Chunk 4: Character System

### Task 16: Create CharacterSprite (PixiJS animated sprite wrapper)

**Files:**
- Create: `src/office/characters/CharacterSprite.ts`

- [ ] **Step 1: Implement CharacterSprite**

This wraps PixiJS `AnimatedSprite` to handle the 7×3 sprite sheet format (112×96 PNG), direction selection, and runtime horizontal flip for left-facing.

```typescript
import { AnimatedSprite, Container, Texture, Rectangle } from 'pixi.js';

export type Direction = 'down' | 'up' | 'right' | 'left';
export type AnimState = 'walk' | 'type' | 'read' | 'idle';

const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 32;
const COLS = 7;

// Row 0 = Down, Row 1 = Up, Row 2 = Right (Left = flipped Right)
const DIRECTION_ROW: Record<Direction, number> = {
  down: 0,
  up: 1,
  right: 2,
  left: 2,
};

// Frame ranges within each row
const ANIM_FRAMES: Record<AnimState, number[]> = {
  walk: [0, 1, 2, 1],    // walk1, walk2, walk3, walk2
  type: [3, 4],           // type1, type2
  read: [5, 6],           // read1, read2
  idle: [0],              // standing frame
};

export class CharacterSprite {
  readonly container: Container;
  private sprite: AnimatedSprite;
  private baseTexture: Texture;
  private currentDirection: Direction = 'down';
  private currentAnim: AnimState = 'idle';
  private frameSpeed: number = 0.15;

  constructor(spriteSheet: Texture) {
    this.baseTexture = spriteSheet;
    this.container = new Container();

    const frames = this.getFrames('down', 'idle');
    this.sprite = new AnimatedSprite(frames);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.animationSpeed = this.frameSpeed;
    this.sprite.play();

    this.container.addChild(this.sprite);
  }

  private getFrames(direction: Direction, anim: AnimState): Texture[] {
    const row = DIRECTION_ROW[direction];
    const frameIndices = ANIM_FRAMES[anim];

    return frameIndices.map((col) => {
      const frame = new Rectangle(
        col * FRAME_WIDTH,
        row * FRAME_HEIGHT,
        FRAME_WIDTH,
        FRAME_HEIGHT,
      );
      const tex = new Texture({ source: this.baseTexture.source, frame });
      tex.source.scaleMode = 'nearest';
      return tex;
    });
  }

  setAnimation(anim: AnimState, direction: Direction): void {
    if (anim === this.currentAnim && direction === this.currentDirection) return;

    this.currentAnim = anim;
    this.currentDirection = direction;

    const frames = this.getFrames(direction, anim);
    this.sprite.textures = frames;

    // Flip horizontally for left-facing
    this.sprite.scale.x = direction === 'left' ? -1 : 1;

    // Adjust speed: walk = fast, type/read = slower
    this.sprite.animationSpeed = anim === 'walk' ? 0.15 : 0.08;
    this.sprite.play();
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }

  setAlpha(alpha: number): void {
    this.container.alpha = alpha;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/office/characters/CharacterSprite.ts
git commit -m "feat: implement CharacterSprite with direction and animation state"
```

---

### Task 17: Create Character state machine

**Files:**
- Create: `src/office/characters/Character.ts`
- Create: `tests/src/office/characters/Character.test.ts`

- [ ] **Step 1: Write failing tests for Character state machine**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Character, CharacterState } from '../../../../src/office/characters/Character';
import { TileMap } from '../../../../src/office/engine/tilemap';

// Mock CharacterSprite since it depends on PixiJS Texture
vi.mock('../../../../src/office/characters/CharacterSprite', () => ({
  CharacterSprite: class MockSprite {
    container = { x: 0, y: 0, alpha: 1, destroy: vi.fn() };
    setAnimation = vi.fn();
    setPosition = vi.fn();
    setAlpha = vi.fn();
    destroy = vi.fn();
  },
}));

const LAYOUT = {
  width: 10, height: 10, tileSize: 16,
  tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
};
// Add walls on edges
LAYOUT.tiles[0] = Array(10).fill(1);
LAYOUT.tiles[9] = Array(10).fill(1);
for (let y = 0; y < 10; y++) { LAYOUT.tiles[y][0] = 1; LAYOUT.tiles[y][9] = 1; }

describe('Character', () => {
  let tileMap: TileMap;
  let character: Character;

  beforeEach(() => {
    tileMap = new TileMap(LAYOUT);
    character = new Character({
      agentId: 'agent-1',
      role: 'backend-engineer',
      deskTile: { x: 5, y: 5 },
      tileMap,
      spriteSheet: null as any, // mocked
    });
  });

  it('starts in idle state at desk position', () => {
    expect(character.getState()).toBe('idle');
    expect(character.getTilePosition()).toEqual({ x: 5, y: 5 });
  });

  it('transitions to walk when given a target', () => {
    character.moveTo({ x: 7, y: 5 });
    expect(character.getState()).toBe('walk');
  });

  it('transitions to type when setWorking called with type', () => {
    character.setWorking('type');
    // Should pathfind to desk first if not there
    expect(['walk', 'type']).toContain(character.getState());
  });

  it('transitions to idle when setIdle called', () => {
    character.setWorking('type');
    character.setIdle();
    expect(character.getState()).toBe('idle');
  });

  it('advances along path on update', () => {
    character.moveTo({ x: 7, y: 5 });
    const startPos = character.getPixelPosition();
    // Simulate several update ticks
    for (let i = 0; i < 60; i++) {
      character.update(1 / 60);
    }
    const endPos = character.getPixelPosition();
    expect(endPos.x).toBeGreaterThan(startPos.x);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/src/office/characters/Character.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Character**

```typescript
import { Texture } from 'pixi.js';
import { CharacterSprite, type Direction, type AnimState } from './CharacterSprite';
import { findPath } from '../engine/pathfinding';
import { TileMap } from '../engine/tilemap';
import type { AgentRole } from '../../../shared/types';

export type CharacterState = 'idle' | 'walk' | 'type' | 'read';

const SPEED = 48; // pixels per second

interface CharacterOptions {
  agentId: string;
  role: AgentRole;
  deskTile: { x: number; y: number };
  tileMap: TileMap;
  spriteSheet: Texture;
}

export class Character {
  readonly agentId: string;
  readonly role: AgentRole;
  readonly sprite: CharacterSprite;

  private state: CharacterState = 'idle';
  private tileMap: TileMap;
  private deskTile: { x: number; y: number };
  private px: number;
  private py: number;
  private path: { x: number; y: number }[] = [];
  private pendingWork: CharacterState | null = null;
  private direction: Direction = 'down';
  private idleTimer = 0;
  private idleWanderDelay = 3 + Math.random() * 5;

  constructor(options: CharacterOptions) {
    this.agentId = options.agentId;
    this.role = options.role;
    this.deskTile = options.deskTile;
    this.tileMap = options.tileMap;
    this.sprite = new CharacterSprite(options.spriteSheet);

    const pos = this.tileMap.tileToPixel(this.deskTile.x, this.deskTile.y);
    this.px = pos.x + this.tileMap.tileSize / 2;
    this.py = pos.y + this.tileMap.tileSize;
    this.sprite.setPosition(this.px, this.py);
  }

  getState(): CharacterState {
    return this.state;
  }

  getTilePosition(): { x: number; y: number } {
    return this.tileMap.pixelToTile(this.px, this.py - 1);
  }

  getPixelPosition(): { x: number; y: number } {
    return { x: this.px, y: this.py };
  }

  moveTo(tile: { x: number; y: number }): void {
    const currentTile = this.getTilePosition();
    const path = findPath(this.tileMap, currentTile, tile);
    if (path && path.length > 0) {
      this.path = path;
      this.state = 'walk';
      this.sprite.setAnimation('walk', this.direction);
    }
  }

  setWorking(workType: 'type' | 'read'): void {
    const currentTile = this.getTilePosition();
    if (currentTile.x === this.deskTile.x && currentTile.y === this.deskTile.y) {
      this.state = workType;
      this.sprite.setAnimation(workType, 'down');
    } else {
      this.pendingWork = workType;
      this.moveTo(this.deskTile);
    }
  }

  setIdle(): void {
    this.state = 'idle';
    this.pendingWork = null;
    this.path = [];
    this.idleTimer = 0;
    this.idleWanderDelay = 3 + Math.random() * 5;
    this.sprite.setAnimation('idle', this.direction);
  }

  update(dt: number): void {
    if (this.state === 'walk') {
      this.updateWalk(dt);
    } else if (this.state === 'idle') {
      this.updateIdle(dt);
    }
  }

  private updateWalk(dt: number): void {
    if (this.path.length === 0) {
      if (this.pendingWork) {
        this.state = this.pendingWork;
        this.pendingWork = null;
        this.sprite.setAnimation(this.state as AnimState, 'down');
      } else {
        this.setIdle();
      }
      return;
    }

    const target = this.path[0];
    const targetPx = target.x * this.tileMap.tileSize + this.tileMap.tileSize / 2;
    const targetPy = target.y * this.tileMap.tileSize + this.tileMap.tileSize;

    const dx = targetPx - this.px;
    const dy = targetPy - this.py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      this.px = targetPx;
      this.py = targetPy;
      this.path.shift();
      return;
    }

    const step = Math.min(SPEED * dt, dist);
    this.px += (dx / dist) * step;
    this.py += (dy / dist) * step;

    // Update direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? 'right' : 'left';
    } else {
      this.direction = dy > 0 ? 'down' : 'up';
    }

    this.sprite.setAnimation('walk', this.direction);
    this.sprite.setPosition(this.px, this.py);
  }

  private updateIdle(dt: number): void {
    this.idleTimer += dt;
    if (this.idleTimer >= this.idleWanderDelay) {
      this.idleTimer = 0;
      this.idleWanderDelay = 3 + Math.random() * 5;
      this.wanderToRandomTile();
    }
  }

  private wanderToRandomTile(): void {
    const current = this.getTilePosition();
    const range = 4;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = current.x + Math.floor(Math.random() * range * 2) - range;
      const ty = current.y + Math.floor(Math.random() * range * 2) - range;
      if (this.tileMap.isWalkable(tx, ty)) {
        this.moveTo({ x: tx, y: ty });
        return;
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/src/office/characters/Character.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/office/characters/Character.ts tests/src/office/characters/Character.test.ts
git commit -m "feat: implement Character state machine with pathfinding and idle wandering"
```

---

### Task 18: Create in-scene SpeechBubble and AgentLabel

**Files:**
- Create: `src/office/ui/SpeechBubble.ts`
- Create: `src/office/ui/AgentLabel.ts`

- [ ] **Step 1: Implement SpeechBubble**

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';

const BUBBLE_COLORS: Record<string, number> = {
  working: 0xffffff,
  waiting: 0x4ade80,
  permission: 0xfb923c,
};

const AUTO_HIDE_MS = 5000;

export class SpeechBubble {
  readonly container: Container;
  private bg: Graphics;
  private text: Text;
  private hideTimer = 0;
  private visible = false;
  private pulsePhase = 0;

  constructor() {
    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.text = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 8,
        fill: '#000000',
        fontFamily: 'monospace',
        wordWrap: true,
        wordWrapWidth: 80,
      }),
    });
    this.text.x = 6;
    this.text.y = 4;
    this.container.addChild(this.text);
  }

  show(message: string, type: 'working' | 'waiting' | 'permission'): void {
    this.text.text = message.length > 40 ? message.slice(0, 37) + '...' : message;
    this.drawBubble(BUBBLE_COLORS[type]);
    this.container.visible = true;
    this.visible = true;
    this.hideTimer = AUTO_HIDE_MS;
    this.pulsePhase = 0;
  }

  hide(): void {
    this.container.visible = false;
    this.visible = false;
  }

  update(dt: number): void {
    if (!this.visible) return;

    this.hideTimer -= dt * 1000;
    if (this.hideTimer <= 0) {
      this.hide();
      return;
    }

    // Pulse effect for permission bubbles
    this.pulsePhase += dt * 3;
    if (this.bg.tint === BUBBLE_COLORS.permission) {
      this.container.alpha = 0.7 + 0.3 * Math.sin(this.pulsePhase);
    }
  }

  private drawBubble(color: number): void {
    this.bg.clear();
    const w = Math.max(this.text.width + 12, 40);
    const h = this.text.height + 8;
    this.bg.roundRect(0, 0, w, h, 4);
    this.bg.fill(color);

    // Position above character
    this.container.x = -w / 2;
    this.container.y = -h - 4;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Implement AgentLabel**

```typescript
import { Container, Text, TextStyle } from 'pixi.js';

export class AgentLabel {
  readonly container: Container;
  private nameText: Text;
  private toolText: Text;

  constructor(name: string, color: string) {
    this.container = new Container();

    this.nameText = new Text({
      text: name,
      style: new TextStyle({
        fontSize: 7,
        fill: color,
        fontFamily: 'monospace',
        align: 'center',
      }),
    });
    this.nameText.anchor.set(0.5, 0);
    this.container.addChild(this.nameText);

    this.toolText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 6,
        fill: '#9ca3af',
        fontFamily: 'monospace',
        align: 'center',
      }),
    });
    this.toolText.anchor.set(0.5, 0);
    this.toolText.y = 10;
    this.container.addChild(this.toolText);
  }

  setTool(toolName: string | null): void {
    this.toolText.text = toolName ?? '';
  }

  setDimmed(dimmed: boolean): void {
    this.container.alpha = dimmed ? 0.4 : 1;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/office/ui/SpeechBubble.ts src/office/ui/AgentLabel.ts
git commit -m "feat: add SpeechBubble and AgentLabel overlays for characters"
```

---

### Task 19: Wire characters into OfficeScene

**Files:**
- Modify: `src/office/OfficeScene.ts`

- [ ] **Step 1: Add character management to OfficeScene**

Update `src/office/OfficeScene.ts` to add character spawning and updating. Add these imports and methods:

```typescript
// Add to imports:
import { Character } from './characters/Character';
import { SpeechBubble } from './ui/SpeechBubble';
import { AgentLabel } from './ui/AgentLabel';
import { getAgentConfig } from './characters/agents.config';
import type { AgentRole } from '../../shared/types';
import { Texture } from 'pixi.js';

// Add to class properties:
private characters: Map<string, Character> = new Map();
private characterLayer: Container;  // add as new Container() in constructor

// Add to constructor, after drawTiles():
this.characterLayer = new Container();
this.worldContainer.addChild(this.characterLayer);

// Add these methods:
spawnCharacter(agentId: string, role: AgentRole, spriteSheet: Texture): Character {
  const config = getAgentConfig(role);
  const character = new Character({
    agentId,
    role,
    deskTile: config.deskTile,
    tileMap: this.tileMap,
    spriteSheet,
  });
  this.characters.set(agentId, character);
  this.characterLayer.addChild(character.sprite.container);
  return character;
}

removeCharacter(agentId: string): void {
  const character = this.characters.get(agentId);
  if (character) {
    character.destroy();
    this.characters.delete(agentId);
  }
}

getCharacter(agentId: string): Character | undefined {
  return this.characters.get(agentId);
}

// Update the existing update() method:
private update(): void {
  const dt = this.app.ticker.deltaMS / 1000;
  this.camera.update();
  for (const character of this.characters.values()) {
    character.update(dt);
  }
}
```

- [ ] **Step 2: Verify app still launches**

```bash
npm run dev
```

Expected: App launches with tilemap visible. No characters yet (they spawn on agent events).

- [ ] **Step 3: Commit**

```bash
git add src/office/OfficeScene.ts
git commit -m "feat: wire character lifecycle into OfficeScene"
```

---

## Chunk 5: React UI Components

### Task 20: Create ChatPanel components

**Files:**
- Create: `src/components/ChatPanel/ChatPanel.tsx`
- Create: `src/components/ChatPanel/MessageThread.tsx`
- Create: `src/components/ChatPanel/MessageBubble.tsx`
- Create: `src/components/ChatPanel/PromptInput.tsx`

- [ ] **Step 1: Create MessageBubble**

```tsx
import React from 'react';
import type { ChatMessage } from '../../stores/chat.store';
import { AGENT_COLORS } from '../../../shared/types';
import type { AgentRole } from '../../../shared/types';

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const color = isUser
    ? '#e5e5e5'
    : isSystem
      ? '#6b7280'
      : AGENT_COLORS[message.role as AgentRole] ?? '#9ca3af';

  return (
    <div style={{
      marginBottom: 8,
      padding: '6px 10px',
      borderLeft: `3px solid ${color}`,
      background: isUser ? '#1e1e36' : '#16162a',
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 10, color, marginBottom: 2, fontWeight: 600 }}>
        {isUser ? 'You' : message.role}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
        {message.content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MessageThread**

```tsx
import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chat.store';
import { MessageBubble } from './MessageBubble';

export function MessageThread() {
  const messages = useChatStore((s) => s.messages);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {messages.length === 0 && (
        <div style={{ color: '#6b7280', textAlign: 'center', marginTop: 32, fontSize: 12 }}>
          No messages yet. Type a prompt to start.
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 3: Create PromptInput**

```tsx
import React, { useState } from 'react';
import { useChatStore } from '../../stores/chat.store';

const QUICK_COMMANDS = ['/imagine', '/warroom', '/build'];

interface Props {
  onSubmit: (prompt: string) => void;
}

export function PromptInput({ onSubmit }: Props) {
  const [input, setInput] = useState('');
  const isDispatching = useChatStore((s) => s.isDispatching);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isDispatching) return;
    onSubmit(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{ borderTop: '1px solid #2a2a4a', padding: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            onClick={() => { setInput(cmd + ' '); }}
            style={{
              background: '#2a2a4a',
              border: 'none',
              color: '#9ca3af',
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            {cmd}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a prompt..."
          disabled={isDispatching}
          rows={2}
          style={{
            flex: 1,
            background: '#1e1e36',
            border: '1px solid #2a2a4a',
            color: '#e5e5e5',
            borderRadius: 4,
            padding: 8,
            fontSize: 13,
            resize: 'none',
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={isDispatching || !input.trim()}
          style={{
            background: isDispatching ? '#2a2a4a' : '#3b82f6',
            border: 'none',
            color: '#fff',
            padding: '0 16px',
            borderRadius: 4,
            cursor: isDispatching ? 'not-allowed' : 'pointer',
            fontSize: 13,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ChatPanel container**

```tsx
import React from 'react';
import { useChatStore, type Phase } from '../../stores/chat.store';
import { MessageThread } from './MessageThread';
import { PromptInput } from './PromptInput';

const PHASES: Phase[] = ['imagine', 'warroom', 'build'];
const PHASE_ICONS: Record<Phase, string> = {
  imagine: '💡',
  warroom: '🗺️',
  build: '🔨',
};

export function ChatPanel() {
  const currentPhase = useChatStore((s) => s.currentPhase);
  const addUserMessage = useChatStore((s) => s.addUserMessage);

  const handleSubmit = async (prompt: string) => {
    addUserMessage(prompt);

    if (window.office?.dispatch) {
      useChatStore.getState().setDispatching(true);
      try {
        await window.office.dispatch(prompt);
      } finally {
        useChatStore.getState().setDispatching(false);
      }
    }
  };

  return (
    <div style={{
      width: 320,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #2a2a4a',
      background: '#0f0f1a',
    }}>
      {/* Phase indicator */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #2a2a4a' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {PHASES.map((phase) => (
            <span
              key={phase}
              style={{
                fontSize: 11,
                color: phase === currentPhase ? '#e5e5e5' : '#4a4a6a',
                fontWeight: phase === currentPhase ? 700 : 400,
              }}
            >
              {PHASE_ICONS[phase]} {phase}
            </span>
          ))}
        </div>
      </div>

      <MessageThread />
      <PromptInput onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatPanel/
git commit -m "feat: implement ChatPanel with message thread, prompt input, and phase indicator"
```

---

### Task 21: Create TopBar component

**Files:**
- Create: `src/components/TopBar/TopBar.tsx`

- [ ] **Step 1: Implement TopBar**

```tsx
import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chat.store';
import type { ConnectionStatus } from '../../../shared/types';

export function TopBar() {
  const totalCost = useChatStore((s) => s.totalCost);
  const totalTokens = useChatStore((s) => s.totalTokens);
  const [connection, setConnection] = useState<ConnectionStatus>({
    claudeCode: 'disconnected',
    openCode: 'disconnected',
  });

  useEffect(() => {
    if (!window.office?.onConnectionStatus) return;
    const unsub = window.office.onConnectionStatus(setConnection);
    return unsub;
  }, []);

  const dot = (status: string) => {
    const color = status === 'connected' ? '#4ade80' : status === 'error' ? '#ef4444' : '#6b7280';
    return (
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        marginRight: 4,
      }} />
    );
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '6px 16px',
      background: '#0a0a18',
      borderBottom: '1px solid #2a2a4a',
      fontSize: 12,
      color: '#9ca3af',
    }}>
      <span>{dot(connection.claudeCode)} Claude Code</span>
      <span>{dot(connection.openCode)} OpenCode</span>
      <span style={{ marginLeft: 'auto' }}>${totalCost.toFixed(2)}</span>
      <span>{(totalTokens / 1000).toFixed(1)}k tokens</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TopBar/TopBar.tsx
git commit -m "feat: implement TopBar with connection status, cost, and token display"
```

---

### Task 22: Create StatsOverlay component

**Files:**
- Create: `src/components/StatsOverlay/StatsOverlay.tsx`

- [ ] **Step 1: Implement StatsOverlay with agent heatmap**

```tsx
import React from 'react';
import { useOfficeStore } from '../../stores/office.store';
import { useChatStore } from '../../stores/chat.store';
import { AGENT_CONFIGS } from '../../office/characters/agents.config';
import { AGENT_GROUPS } from '../../../shared/types';

export function StatsOverlay() {
  const agents = useOfficeStore((s) => s.agents);
  const totalCost = useChatStore((s) => s.totalCost);
  const totalTokens = useChatStore((s) => s.totalTokens);
  const currentPhase = useChatStore((s) => s.currentPhase);

  const groupOrder = ['leadership', 'coordination', 'engineering'] as const;

  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      right: 12,
      background: 'rgba(15, 15, 26, 0.85)',
      border: '1px solid #2a2a4a',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 11,
      color: '#9ca3af',
      pointerEvents: 'none',
      minWidth: 180,
    }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <span>${totalCost.toFixed(2)}</span>
        <span>{(totalTokens / 1000).toFixed(1)}k</span>
        <span style={{ textTransform: 'capitalize' }}>{currentPhase}</span>
      </div>

      {/* Agent heatmap */}
      <div style={{ display: 'flex', gap: 8 }}>
        {groupOrder.map((group) => (
          <div key={group} style={{ display: 'flex', gap: 3 }}>
            {AGENT_GROUPS[group].map((role) => {
              const config = AGENT_CONFIGS[role];
              const isActive = Object.values(agents).some(
                (a) => a.role === role && (a.state === 'type' || a.state === 'read'),
              );
              return (
                <div
                  key={role}
                  title={config.displayName}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: config.color,
                    opacity: isActive ? 1 : 0.3,
                    animation: isActive ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StatsOverlay/StatsOverlay.tsx
git commit -m "feat: implement StatsOverlay with agent activity heatmap"
```

---

### Task 23: Wire all UI into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx to assemble all components**

```tsx
import React from 'react';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { TopBar } from './components/TopBar/TopBar';
import { StatsOverlay } from './components/StatsOverlay/StatsOverlay';
import { OfficeCanvas } from './office/OfficeCanvas';

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ChatPanel />
        <OfficeCanvas />
        <StatsOverlay />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the full UI layout**

```bash
npm run dev
```

Expected: Electron window shows TopBar at top (connection dots, cost, tokens), ChatPanel on left (phase indicator, empty message thread, prompt input with command chips), PixiJS canvas filling the center, StatsOverlay floating in the bottom-right corner.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: assemble full UI layout — TopBar, ChatPanel, OfficeCanvas, StatsOverlay"
```

---

## Chunk 6: Adapters, Session Manager & End-to-End Wiring

### Task 24: Implement ClaudeCodeTranscriptAdapter

**Files:**
- Create: `electron/adapters/claude-transcript.adapter.ts`
- Create: `tests/electron/adapters/claude-transcript.adapter.test.ts`

- [ ] **Step 1: Write failing tests for transcript adapter**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeTranscriptAdapter } from '../../../electron/adapters/claude-transcript.adapter';
import type { AgentEvent } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock chokidar
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  })),
}));

describe('ClaudeCodeTranscriptAdapter', () => {
  let adapter: ClaudeCodeTranscriptAdapter;
  const events: AgentEvent[] = [];

  beforeEach(() => {
    adapter = new ClaudeCodeTranscriptAdapter();
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    events.length = 0;
  });

  afterEach(() => {
    adapter.stop();
  });

  it('parses a tool_use JSONL line into agent:tool:start event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Read',
          id: 'tool-abc',
        }],
      },
    });
    adapter.processLine(line, 'test-session');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:tool:start');
    expect(events[0].toolName).toBe('Read');
    expect(events[0].toolId).toBe('tool-abc');
  });

  it('parses a tool_result JSONL line into agent:tool:done event', () => {
    adapter.processLine(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Read', id: 'tool-abc' }] },
    }), 'test-session');

    adapter.processLine(JSON.stringify({
      type: 'tool_result',
      tool_use_id: 'tool-abc',
    }), 'test-session');

    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('agent:tool:done');
  });

  it('skips invalid JSON lines without crashing', () => {
    adapter.processLine('not valid json', 'test-session');
    expect(events).toHaveLength(0);
  });

  it('emits agent:message for text content blocks', () => {
    adapter.processLine(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello from assistant' }],
      },
    }), 'test-session');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:message');
    expect(events[0].message).toBe('Hello from assistant');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/electron/adapters/claude-transcript.adapter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ClaudeCodeTranscriptAdapter**

```typescript
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { ToolAdapter, type AdapterConfig } from './types';
import type { AgentEvent, AgentRole } from '../../shared/types';

export class ClaudeCodeTranscriptAdapter extends ToolAdapter {
  private watcher: chokidar.FSWatcher | null = null;
  private filePositions: Map<string, number> = new Map();
  private sessionRoles: Map<string, AgentRole> = new Map();

  start(config: AdapterConfig): void {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    this.watcher = chokidar.watch(`${claudeDir}/**/*.jsonl`, {
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on('add', (filePath: string) => this.handleNewFile(filePath));
    this.watcher.on('change', (filePath: string) => this.handleFileChange(filePath));
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    this.filePositions.clear();
    this.sessionRoles.clear();
  }

  private getSessionId(filePath: string): string {
    return path.basename(filePath, '.jsonl');
  }

  private async handleNewFile(filePath: string): Promise<void> {
    const sessionId = this.getSessionId(filePath);
    this.filePositions.set(filePath, 0);
    this.emitAgentEvent({
      agentId: sessionId,
      agentRole: this.sessionRoles.get(sessionId) ?? 'freelancer',
      source: 'transcript',
      type: 'agent:created',
      timestamp: Date.now(),
    });
    await this.readNewLines(filePath);
  }

  private async handleFileChange(filePath: string): Promise<void> {
    await this.readNewLines(filePath);
  }

  private async readNewLines(filePath: string): Promise<void> {
    const startPos = this.filePositions.get(filePath) ?? 0;
    const stats = fs.statSync(filePath);
    if (stats.size <= startPos) return;

    const stream = fs.createReadStream(filePath, { start: startPos, encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream });
    const sessionId = this.getSessionId(filePath);

    for await (const line of rl) {
      this.processLine(line, sessionId);
    }

    this.filePositions.set(filePath, stats.size);
  }

  processLine(line: string, sessionId: string): void {
    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return; // Skip invalid JSON
    }

    const role = this.sessionRoles.get(sessionId) ?? 'freelancer';

    if (data.type === 'assistant' && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === 'tool_use') {
          this.emitAgentEvent({
            agentId: sessionId,
            agentRole: role,
            source: 'transcript',
            type: 'agent:tool:start',
            toolName: block.name,
            toolId: block.id,
            timestamp: Date.now(),
          });
        } else if (block.type === 'text' && block.text) {
          this.emitAgentEvent({
            agentId: sessionId,
            agentRole: role,
            source: 'transcript',
            type: 'agent:message',
            message: block.text,
            timestamp: Date.now(),
          });
        }
      }
    }

    if (data.type === 'tool_result') {
      this.emitAgentEvent({
        agentId: sessionId,
        agentRole: role,
        source: 'transcript',
        type: 'agent:tool:done',
        toolId: data.tool_use_id,
        timestamp: Date.now(),
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/electron/adapters/claude-transcript.adapter.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/adapters/claude-transcript.adapter.ts tests/electron/adapters/claude-transcript.adapter.test.ts
git commit -m "feat: implement ClaudeCodeTranscriptAdapter with JSONL parsing"
```

---

### Task 25: Implement OpenCodeAdapter

**Files:**
- Create: `electron/adapters/opencode.adapter.ts`
- Create: `tests/electron/adapters/opencode.adapter.test.ts`

- [ ] **Step 1: Write failing tests for OpenCodeAdapter**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from '../../../electron/adapters/opencode.adapter';
import type { AgentEvent } from '../../../shared/types';

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => ({
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
      })),
      close: vi.fn(),
    })),
  };
});

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter;
  const events: AgentEvent[] = [];

  beforeEach(() => {
    adapter = new OpenCodeAdapter();
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    events.length = 0;
  });

  afterEach(() => {
    adapter.stop();
  });

  it('maps OpenCode session to freelancer role by default', () => {
    adapter.processSessionRow({
      id: 'oc-session-1',
      status: 'active',
      tool_name: 'Read',
      tool_id: 'tool-1',
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].agentRole).toBe('freelancer');
    expect(events[0].source).toBe('opencode');
  });

  it('emits tool:start for active session with tool', () => {
    adapter.processSessionRow({
      id: 'oc-session-1',
      status: 'active',
      tool_name: 'Write',
      tool_id: 'tool-1',
    });
    const toolStart = events.find((e) => e.type === 'agent:tool:start');
    expect(toolStart).toBeDefined();
    expect(toolStart!.toolName).toBe('Write');
  });

  it('emits agent:closed for completed session', () => {
    adapter.processSessionRow({
      id: 'oc-session-1',
      status: 'completed',
    });
    const closed = events.find((e) => e.type === 'agent:closed');
    expect(closed).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/electron/adapters/opencode.adapter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement OpenCodeAdapter**

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import { ToolAdapter, type AdapterConfig } from './types';
import type { AgentEvent, AgentRole } from '../../shared/types';

interface SessionRow {
  id: string;
  status: string;
  tool_name?: string;
  tool_id?: string;
}

const POLL_INTERVAL = 1000;
const MAX_CONSECUTIVE_FAILURES = 10;

export class OpenCodeAdapter extends ToolAdapter {
  private db: Database.Database | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private knownSessions: Map<string, string> = new Map(); // id → last status
  private failureCount = 0;

  start(config: AdapterConfig): void {
    const dbPath = path.join(config.projectDir, '.opencode', 'state.db');
    try {
      this.db = new Database(dbPath, { readonly: true });
      this.failureCount = 0;
    } catch {
      // OpenCode not running — that's fine
      return;
    }

    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.db?.close();
    this.db = null;
    this.knownSessions.clear();
  }

  private poll(): void {
    if (!this.db) return;

    try {
      const rows = this.db.prepare('SELECT id, status, tool_name, tool_id FROM sessions').all() as SessionRow[];
      this.failureCount = 0;

      for (const row of rows) {
        this.processSessionRow(row);
      }
    } catch {
      this.failureCount++;
      if (this.failureCount >= MAX_CONSECUTIVE_FAILURES) {
        this.emitAgentEvent({
          agentId: 'opencode-bridge',
          agentRole: 'freelancer',
          source: 'opencode',
          type: 'agent:closed',
          message: 'OpenCode connection lost after repeated failures',
          timestamp: Date.now(),
        });
        this.stop();
      }
    }
  }

  processSessionRow(row: SessionRow): void {
    const prevStatus = this.knownSessions.get(row.id);
    const role: AgentRole = 'freelancer';

    if (!prevStatus) {
      // New session
      this.knownSessions.set(row.id, row.status);
      this.emitAgentEvent({
        agentId: row.id,
        agentRole: role,
        source: 'opencode',
        type: 'agent:created',
        timestamp: Date.now(),
      });
    }

    if (row.status === 'completed' || row.status === 'error') {
      this.emitAgentEvent({
        agentId: row.id,
        agentRole: role,
        source: 'opencode',
        type: 'agent:closed',
        timestamp: Date.now(),
      });
      this.knownSessions.delete(row.id);
      return;
    }

    if (row.tool_name && row.status === 'active') {
      this.emitAgentEvent({
        agentId: row.id,
        agentRole: role,
        source: 'opencode',
        type: 'agent:tool:start',
        toolName: row.tool_name,
        toolId: row.tool_id,
        timestamp: Date.now(),
      });
    }

    this.knownSessions.set(row.id, row.status);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/electron/adapters/opencode.adapter.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/adapters/opencode.adapter.ts tests/electron/adapters/opencode.adapter.test.ts
git commit -m "feat: implement OpenCodeAdapter with SQLite polling"
```

---

### Task 26: Implement SessionManager

**Files:**
- Create: `electron/session-manager.ts`
- Create: `tests/electron/session-manager.test.ts`

- [ ] **Step 1: Write failing tests for SessionManager**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../electron/session-manager';
import { ToolAdapter, type AdapterConfig } from '../../electron/adapters/types';
import type { AgentEvent } from '../../shared/types';

class MockAdapter extends ToolAdapter {
  started = false;
  stopped = false;
  start(config: AdapterConfig) { this.started = true; }
  stop() { this.stopped = true; }
  triggerEvent(event: AgentEvent) { this.emitAgentEvent(event); }
}

describe('SessionManager', () => {
  let manager: SessionManager;
  let adapter1: MockAdapter;
  let adapter2: MockAdapter;

  beforeEach(() => {
    adapter1 = new MockAdapter();
    adapter2 = new MockAdapter();
    manager = new SessionManager([adapter1, adapter2]);
  });

  it('starts all adapters', () => {
    manager.start({ projectDir: '/tmp/test' });
    expect(adapter1.started).toBe(true);
    expect(adapter2.started).toBe(true);
  });

  it('stops all adapters', () => {
    manager.start({ projectDir: '/tmp/test' });
    manager.stop();
    expect(adapter1.stopped).toBe(true);
    expect(adapter2.stopped).toBe(true);
  });

  it('forwards agent events from adapters', () => {
    const events: AgentEvent[] = [];
    manager.on('agentEvent', (e: AgentEvent) => events.push(e));
    manager.start({ projectDir: '/tmp/test' });

    adapter1.triggerEvent({
      agentId: 'test-1',
      agentRole: 'ceo',
      source: 'transcript',
      type: 'agent:created',
      timestamp: Date.now(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].agentId).toBe('test-1');
  });

  it('tracks active sessions', () => {
    manager.start({ projectDir: '/tmp/test' });

    adapter1.triggerEvent({
      agentId: 'test-1',
      agentRole: 'ceo',
      source: 'transcript',
      type: 'agent:created',
      timestamp: Date.now(),
    });

    expect(manager.getActiveSessions()).toHaveLength(1);
    expect(manager.getActiveSessions()[0].agentRole).toBe('ceo');
  });

  it('removes session on agent:closed', () => {
    manager.start({ projectDir: '/tmp/test' });

    adapter1.triggerEvent({
      agentId: 'test-1', agentRole: 'ceo', source: 'transcript',
      type: 'agent:created', timestamp: Date.now(),
    });
    adapter1.triggerEvent({
      agentId: 'test-1', agentRole: 'ceo', source: 'transcript',
      type: 'agent:closed', timestamp: Date.now(),
    });

    expect(manager.getActiveSessions()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/electron/session-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SessionManager**

```typescript
import { EventEmitter } from 'events';
import { ToolAdapter, type AdapterConfig } from './adapters/types';
import type { AgentEvent, SessionInfo, AgentRole } from '../shared/types';

export class SessionManager extends EventEmitter {
  private adapters: ToolAdapter[];
  private sessions: Map<string, SessionInfo> = new Map();

  constructor(adapters: ToolAdapter[]) {
    super();
    this.adapters = adapters;
  }

  start(config: AdapterConfig): void {
    for (const adapter of this.adapters) {
      adapter.on('agentEvent', (event: AgentEvent) => this.handleEvent(event));

      try {
        adapter.start(config);
      } catch (err) {
        console.error(`Adapter failed to start:`, err);
        // Adapter fails independently — continue with others
      }
    }
  }

  stop(): void {
    for (const adapter of this.adapters) {
      try {
        adapter.stop();
      } catch (err) {
        console.error(`Adapter failed to stop:`, err);
      }
    }
    this.sessions.clear();
  }

  private handleEvent(event: AgentEvent): void {
    if (event.type === 'agent:created') {
      this.sessions.set(event.agentId, {
        sessionId: event.agentId,
        agentRole: event.agentRole,
        source: event.source,
        startedAt: event.timestamp,
      });
    }

    if (event.type === 'agent:closed') {
      this.sessions.delete(event.agentId);
    }

    this.emit('agentEvent', event);
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  getDispatchableAdapter(): ToolAdapter | undefined {
    return this.adapters.find((a) => typeof a.dispatch === 'function');
  }

  async dispatch(prompt: string, agentRole?: AgentRole): Promise<string> {
    const adapter = this.getDispatchableAdapter();
    if (!adapter?.dispatch) {
      throw new Error('No adapter supports dispatching');
    }
    await adapter.dispatch(prompt, agentRole ?? 'freelancer');
    return `session-${Date.now()}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/electron/session-manager.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/session-manager.ts tests/electron/session-manager.test.ts
git commit -m "feat: implement SessionManager unifying adapters into single event stream"
```

---

### Task 27: Create KanbanWatcher

**Files:**
- Create: `electron/kanban-watcher.ts`

- [ ] **Step 1: Implement KanbanWatcher**

```typescript
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { KanbanState, KanbanTask, AgentRole } from '../shared/types';

interface TaskYamlEntry {
  id: string;
  description: string;
  assigned_agent: string;
  phase_id: string;
}

export class KanbanWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private projectDir: string = '';
  private state: KanbanState = {
    projectName: '',
    currentPhase: '',
    completionPercent: 0,
    tasks: [],
  };

  start(projectDir: string): void {
    this.projectDir = projectDir;
    const docsDir = path.join(projectDir, 'docs', 'office');

    this.watcher = chokidar.watch([
      path.join(docsDir, 'tasks.yaml'),
      path.join(docsDir, 'build', '**', 'status.yaml'),
    ], {
      ignoreInitial: false,
      persistent: true,
    });

    this.watcher.on('add', () => this.rebuild());
    this.watcher.on('change', () => this.rebuild());
    this.watcher.on('unlink', () => this.rebuild());
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  getState(): KanbanState {
    return this.state;
  }

  private rebuild(): void {
    try {
      const tasksPath = path.join(this.projectDir, 'docs', 'office', 'tasks.yaml');

      if (!fs.existsSync(tasksPath)) {
        this.state = {
          projectName: path.basename(this.projectDir),
          currentPhase: '',
          completionPercent: 0,
          tasks: [],
        };
        this.emit('update', this.state);
        return;
      }

      // Simple YAML-like parsing (tasks.yaml uses a flat structure)
      const raw = fs.readFileSync(tasksPath, 'utf-8');
      const tasks = this.parseSimpleYaml(raw);

      const done = tasks.filter((t) => t.status === 'done').length;
      const total = tasks.length;

      this.state = {
        projectName: path.basename(this.projectDir),
        currentPhase: this.detectCurrentPhase(tasks),
        completionPercent: total > 0 ? Math.round((done / total) * 100) : 0,
        tasks,
      };

      this.emit('update', this.state);
    } catch {
      // File may be mid-write — skip this cycle
    }
  }

  private parseSimpleYaml(raw: string): KanbanTask[] {
    // This handles the specific format from the office plugin
    // For v1, a minimal parser is sufficient; can add js-yaml later if needed
    const tasks: KanbanTask[] = [];
    const lines = raw.split('\n');
    let current: Partial<KanbanTask> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- id:')) {
        if (current.id) tasks.push(current as KanbanTask);
        current = { id: trimmed.slice(5).trim() };
      } else if (trimmed.startsWith('description:')) {
        current.description = trimmed.slice(12).trim();
      } else if (trimmed.startsWith('status:')) {
        current.status = trimmed.slice(7).trim() as KanbanTask['status'];
      } else if (trimmed.startsWith('assigned_agent:')) {
        current.assignedAgent = trimmed.slice(15).trim() as AgentRole;
      } else if (trimmed.startsWith('phase_id:')) {
        current.phaseId = trimmed.slice(9).trim();
      }
    }
    if (current.id) tasks.push(current as KanbanTask);

    return tasks;
  }

  private detectCurrentPhase(tasks: KanbanTask[]): string {
    const active = tasks.find((t) => t.status === 'active');
    return active?.phaseId ?? '';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/kanban-watcher.ts
git commit -m "feat: implement KanbanWatcher for tasks.yaml file watching"
```

---

### Task 28: Wire everything together in electron/main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Update main.ts with SessionManager, adapters, and IPC handlers**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { IPC_CHANNELS } from '../shared/types';
import { SessionManager } from './session-manager';
import { ClaudeCodeTranscriptAdapter } from './adapters/claude-transcript.adapter';
import { OpenCodeAdapter } from './adapters/opencode.adapter';
import { KanbanWatcher } from './kanban-watcher';

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager;
let kanbanWatcher: KanbanWatcher;

const projectDir = process.cwd();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'The Office',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAdapters() {
  const transcriptAdapter = new ClaudeCodeTranscriptAdapter();
  const openCodeAdapter = new OpenCodeAdapter();

  sessionManager = new SessionManager([transcriptAdapter, openCodeAdapter]);
  kanbanWatcher = new KanbanWatcher();

  // Forward agent events to renderer
  sessionManager.on('agentEvent', (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.AGENT_EVENT, event);
  });

  // Forward kanban updates to renderer
  kanbanWatcher.on('update', (state) => {
    mainWindow?.webContents.send(IPC_CHANNELS.KANBAN_UPDATE, state);
  });

  sessionManager.start({ projectDir });
  kanbanWatcher.start(projectDir);
}

function setupIPC() {
  ipcMain.handle(IPC_CHANNELS.DISPATCH, async (_event, prompt: string, agentRole?: string) => {
    const sessionId = await sessionManager.dispatch(prompt, agentRole as any);
    return { sessionId };
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return sessionManager.getActiveSessions();
  });

  ipcMain.handle(IPC_CHANNELS.GET_KANBAN, async () => {
    return kanbanWatcher.getState();
  });

  ipcMain.handle(IPC_CHANNELS.APPROVE_PERMISSION, async (_event, agentId: string, toolId: string) => {
    // Placeholder — will be implemented with Claude SDK adapter
    console.log(`Permission approved: ${agentId} / ${toolId}`);
  });

  ipcMain.handle(IPC_CHANNELS.DENY_PERMISSION, async (_event, agentId: string, toolId: string) => {
    // Placeholder — will be implemented with Claude SDK adapter
    console.log(`Permission denied: ${agentId} / ${toolId}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIPC();
  setupAdapters();
});

app.on('window-all-closed', () => {
  sessionManager?.stop();
  kanbanWatcher?.stop();
  app.quit();
});
```

- [ ] **Step 2: Verify full app launches with wiring**

```bash
npm run dev
```

Expected: App launches with full UI. TopBar shows disconnected status (no active Claude Code or OpenCode sessions). Chat panel accepts input. PixiJS canvas shows the office tilemap. No errors in dev console.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire SessionManager, adapters, and IPC handlers into main process"
```

---

### Task 29: Wire renderer stores to IPC events

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Update main.tsx to subscribe stores to IPC events**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useOfficeStore } from './stores/office.store';
import { useChatStore } from './stores/chat.store';
import { useKanbanStore } from './stores/kanban.store';

// Subscribe stores to IPC events from main process
function initStoreSubscriptions() {
  if (!window.office) return;

  window.office.onAgentEvent((event) => {
    useOfficeStore.getState().handleAgentEvent(event);
    useChatStore.getState().handleAgentEvent(event);
  });

  window.office.onKanbanUpdate((state) => {
    useKanbanStore.getState().handleKanbanUpdate(state);
  });

  // Load initial kanban state
  window.office.getKanbanState().then((state) => {
    if (state) useKanbanStore.getState().handleKanbanUpdate(state);
  });
}

initStoreSubscriptions();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 2: Verify end-to-end data flow**

```bash
npm run dev
```

Expected: App launches with all components connected. When a Claude Code session runs externally in a terminal (with the same project directory), characters should appear in the pixel office and messages should flow into the chat panel.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: wire renderer stores to IPC agent events and kanban updates"
```

---

### Task 30: Run full test suite and final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (smoke + 3 stores + tilemap + pathfinding + character + transcript adapter + opencode adapter + session manager = ~49 tests).

- [ ] **Step 2: Verify app launches and shows complete UI**

```bash
npm run dev
```

Expected: Full Electron app with TopBar, ChatPanel, PixiJS office canvas, StatsOverlay. All components rendered. No console errors.

- [ ] **Step 3: Test with a real Claude Code session**

Open a separate terminal in the same project directory and run Claude Code. Verify that:
1. The transcript adapter detects the JSONL file
2. A character appears in the pixel office
3. Tool activity animates the character
4. Messages appear in the chat panel

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: The Office — complete v1 with agents, adapters, and pixel office"
```
