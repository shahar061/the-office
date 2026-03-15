# SDK-Driven Office App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Electron app to use the Claude Agent SDK directly, replacing CLI adapters with programmatic `query()` sessions, and adding project picker, auth management, and full phase orchestration.

**Architecture:** Phase-per-session model. Electron main process orchestrates phases (imagine → warroom → build), each spawning SDK `query()` sessions. Events stream to renderer via IPC, driving React UI and PixiJS pixel office animations. Shared agent definition .md files with terminal plugin.

**Tech Stack:** Electron 33+, @anthropic-ai/claude-agent-sdk, React 19, PixiJS 8, Zustand, TypeScript, Vite + electron-vite

**Spec:** `docs/superpowers/specs/2026-03-15-sdk-driven-office-app-design.md`

---

## Chunk 1: Foundation — Types, Dependencies, Agent Definitions

### Task 1: Update dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new dependencies**

```bash
npm install @anthropic-ai/claude-agent-sdk gray-matter
```

- [ ] **Step 2: Remove unused dependencies**

```bash
npm uninstall chokidar better-sqlite3 sql.js @types/better-sqlite3
```

- [ ] **Step 3: Verify build still works**

Run: `npx electron-vite build`
Expected: Build succeeds (renderer/main/preload compile)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: update deps — add agent-sdk, remove adapter deps"
```

---

### Task 2: Rewrite shared types

**Files:**
- Modify: `shared/types.ts`

The entire `shared/types.ts` file is rewritten to match the spec's IPC contract. All adapter-specific types are removed.

- [ ] **Step 1: Write the new types file**

Replace the entire contents of `shared/types.ts` with the spec's type definitions. Key changes:

```typescript
// shared/types.ts

// ── Agent System (retained, modified) ──

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

// ── Events (modified — source narrowed, delta added) ──

export type AgentEventType =
  | 'agent:created'
  | 'agent:tool:start'
  | 'agent:tool:done'
  | 'agent:tool:clear'
  | 'agent:waiting'
  | 'agent:permission'
  | 'agent:message'
  | 'agent:message:delta'
  | 'agent:closed'
  | 'session:cost:update';

export interface AgentEvent {
  agentId: string;
  agentRole: AgentRole;
  source: 'sdk';
  type: AgentEventType;
  toolName?: string;
  toolId?: string;
  message?: string;
  cost?: number;
  tokens?: number;
  timestamp: number;
}

// ── Auth ──

export interface AuthStatus {
  connected: boolean;
  account?: string;
  method?: 'api-key' | 'cli-auth';
}

// ── Projects ──

export type Phase = 'idle' | 'imagine' | 'warroom' | 'build' | 'complete';

export interface ProjectInfo {
  name: string;
  path: string;
  lastPhase: Phase | null;
  lastOpened: number;
}

export interface ProjectState {
  name: string;
  path: string;
  currentPhase: Phase;
  completedPhases: Phase[];
  interrupted: boolean;
}

export interface PhaseInfo {
  phase: Phase;
  status: 'starting' | 'active' | 'completing' | 'completed' | 'failed' | 'interrupted';
}

// ── Chat ──

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  agentRole?: AgentRole;
  text: string;
  timestamp: number;
}

// ── Permissions ──

export interface PermissionRequest {
  requestId: string;
  agentRole: AgentRole;
  toolName: string;
  input: Record<string, unknown>;
}

// ── Build ──

export interface BuildConfig {
  modelPreset: 'default' | 'fast' | 'quality';
  retryLimit: number;
  permissionMode: 'ask' | 'auto-safe' | 'auto-all';
}

// ── Kanban ──

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

// ── Stats ──

export interface SessionStats {
  totalCost: number;
  totalTokens: number;
  sessionTime: number;
  activeAgents: number;
}

// ── Settings ──

export interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
  windowBounds?: { x: number; y: number; width: number; height: number };
}

// ── IPC ──

export const IPC_CHANNELS = {
  // Auth
  GET_AUTH_STATUS: 'office:get-auth-status',
  CONNECT_API_KEY: 'office:connect-api-key',
  DISCONNECT: 'office:disconnect',
  AUTH_STATUS_CHANGE: 'office:auth-status-change',
  // Projects
  GET_RECENT_PROJECTS: 'office:get-recent-projects',
  OPEN_PROJECT: 'office:open-project',
  CREATE_PROJECT: 'office:create-project',
  PICK_DIRECTORY: 'office:pick-directory',
  GET_PROJECT_STATE: 'office:get-project-state',
  // Phase
  START_IMAGINE: 'office:start-imagine',
  START_WARROOM: 'office:start-warroom',
  START_BUILD: 'office:start-build',
  PHASE_CHANGE: 'office:phase-change',
  // Chat
  SEND_MESSAGE: 'office:send-message',
  CHAT_MESSAGE: 'office:chat-message',
  // Agent Events
  AGENT_EVENT: 'office:agent-event',
  // Permissions
  PERMISSION_REQUEST: 'office:permission-request',
  RESPOND_PERMISSION: 'office:respond-permission',
  // Kanban
  KANBAN_UPDATE: 'office:kanban-update',
  // Stats
  STATS_UPDATE: 'office:stats-update',
  // Settings
  GET_SETTINGS: 'office:get-settings',
  SAVE_SETTINGS: 'office:save-settings',
} as const;

// ── OfficeAPI (exposed via preload) ──

export interface OfficeAPI {
  getAuthStatus(): Promise<AuthStatus>;
  connectApiKey(key: string): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  onAuthStatusChange(callback: (status: AuthStatus) => void): () => void;

  getRecentProjects(): Promise<ProjectInfo[]>;
  openProject(path: string): Promise<{ success: boolean; error?: string }>;
  createProject(name: string, path: string): Promise<{ success: boolean; error?: string }>;
  pickDirectory(): Promise<string | null>;
  getProjectState(): Promise<ProjectState>;

  startImagine(userIdea: string): Promise<void>;
  startWarroom(): Promise<void>;
  startBuild(config: BuildConfig): Promise<void>;
  onPhaseChange(callback: (phase: PhaseInfo) => void): () => void;

  sendMessage(message: string): Promise<void>;
  onChatMessage(callback: (msg: ChatMessage) => void): () => void;

  onAgentEvent(callback: (event: AgentEvent) => void): () => void;

  onPermissionRequest(callback: (req: PermissionRequest) => void): () => void;
  respondPermission(requestId: string, approved: boolean): Promise<void>;

  onKanbanUpdate(callback: (state: KanbanState) => void): () => void;
  onStatsUpdate(callback: (stats: SessionStats) => void): () => void;

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
}

declare global {
  interface Window {
    office: OfficeAPI;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors in files that import old types (main.ts, preload.ts, adapters) — expected since those files haven't been updated yet. No errors in `shared/types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "refactor: rewrite shared types for SDK-driven architecture"
```

---

### Task 3: Copy agent definitions from plugin

**Files:**
- Create: `agents/ceo.md`
- Create: `agents/product-manager.md`
- Create: `agents/market-researcher.md`
- Create: `agents/chief-architect.md`
- Create: `agents/agent-organizer.md`
- Create: `agents/project-manager.md`
- Create: `agents/team-lead.md`
- Create: `agents/backend-engineer.md`
- Create: `agents/frontend-engineer.md`
- Create: `agents/mobile-developer.md`
- Create: `agents/ui-ux-expert.md`
- Create: `agents/data-engineer.md`
- Create: `agents/devops.md`
- Create: `agents/automation-developer.md`

- [ ] **Step 1: Copy all 14 agent .md files from the office plugin**

```bash
cp ../office/agents/*.md agents/
```

- [ ] **Step 2: Verify all 14 files exist**

```bash
ls agents/*.md | wc -l
```
Expected: 14

- [ ] **Step 3: Commit**

```bash
git add agents/
git commit -m "feat: add agent definition files (shared with office plugin)"
```

---

### Task 4: Agent Loader — parse .md files into SDK config

**Files:**
- Create: `electron/sdk/agent-loader.ts`
- Create: `tests/sdk/agent-loader.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sdk/agent-loader.test.ts
import { describe, it, expect } from 'vitest';
import { loadAgentDefinition, loadAllAgents } from '../../electron/sdk/agent-loader';
import path from 'path';

describe('agent-loader', () => {
  const agentsDir = path.join(__dirname, '../../agents');

  it('parses a single agent .md file into name + definition', () => {
    const [name, def] = loadAgentDefinition(path.join(agentsDir, 'ceo.md'));
    expect(name).toBe('ceo');
    expect(def.description).toBeTruthy();
    expect(def.prompt).toBeTruthy();
    expect(def.prompt).not.toContain('---'); // frontmatter stripped
  });

  it('loads all 14 agents from directory', () => {
    const agents = loadAllAgents(agentsDir);
    const names = Object.keys(agents);
    expect(names.length).toBe(14);
    expect(names).toContain('ceo');
    expect(names).toContain('backend-engineer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sdk/agent-loader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/sdk/agent-loader.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
}

export function loadAgentDefinition(mdPath: string): [string, AgentDefinition] {
  const raw = fs.readFileSync(mdPath, 'utf-8');
  const { data: frontmatter, content: body } = matter(raw);

  const name = frontmatter.name as string;
  if (!name) {
    throw new Error(`Agent file missing 'name' in frontmatter: ${mdPath}`);
  }

  return [name, {
    description: (frontmatter.description as string) || name,
    prompt: body.trim(),
  }];
}

export function loadAllAgents(agentsDir: string): Record<string, AgentDefinition> {
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const entries = files.map(f => loadAgentDefinition(path.join(agentsDir, f)));
  return Object.fromEntries(entries);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sdk/agent-loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/sdk/agent-loader.ts tests/sdk/agent-loader.test.ts
git commit -m "feat: agent-loader — parse .md files into SDK AgentDefinition"
```

---

### Task 5: Auth Manager — API key storage

**Files:**
- Create: `electron/auth/auth-manager.ts`
- Create: `tests/auth/auth-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/auth/auth-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthManager } from '../../electron/auth/auth-manager';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AuthManager', () => {
  let manager: AuthManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-auth-'));
    manager = new AuthManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('starts disconnected', () => {
    const status = manager.getStatus();
    expect(status.connected).toBe(false);
    expect(status.account).toBeUndefined();
  });

  it('connects with API key', () => {
    const result = manager.connectApiKey('sk-ant-test-key-123');
    expect(result.success).toBe(true);
    const status = manager.getStatus();
    expect(status.connected).toBe(true);
    expect(status.method).toBe('api-key');
    expect(status.account).toBe('sk-...y-123');
  });

  it('rejects empty API key', () => {
    const result = manager.connectApiKey('');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('persists API key across instances', () => {
    manager.connectApiKey('sk-ant-test-key-456');
    const manager2 = new AuthManager(tmpDir);
    const status = manager2.getStatus();
    expect(status.connected).toBe(true);
  });

  it('disconnects and removes stored key', () => {
    manager.connectApiKey('sk-ant-test-key-789');
    manager.disconnect();
    const status = manager.getStatus();
    expect(status.connected).toBe(false);
  });

  it('returns API key for SDK env option', () => {
    manager.connectApiKey('sk-ant-test-key-abc');
    expect(manager.getApiKey()).toBe('sk-ant-test-key-abc');
  });

  it('returns null API key when disconnected', () => {
    expect(manager.getApiKey()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/auth-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/auth/auth-manager.ts
import fs from 'fs';
import path from 'path';
import type { AuthStatus } from '../../shared/types';

const AUTH_FILE = 'auth.json';

export class AuthManager {
  private dataDir: string;
  private apiKey: string | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.load();
  }

  getStatus(): AuthStatus {
    if (!this.apiKey) {
      return { connected: false };
    }
    return {
      connected: true,
      account: this.redactKey(this.apiKey),
      method: 'api-key',
    };
  }

  connectApiKey(key: string): { success: boolean; error?: string } {
    if (!key || !key.trim()) {
      return { success: false, error: 'API key cannot be empty' };
    }
    this.apiKey = key.trim();
    this.save();
    return { success: true };
  }

  disconnect(): void {
    this.apiKey = null;
    const filePath = path.join(this.dataDir, AUTH_FILE);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  private redactKey(key: string): string {
    if (key.length <= 6) return '***';
    return `${key.slice(0, 3)}...${key.slice(-3)}`;
  }

  private load(): void {
    try {
      const filePath = path.join(this.dataDir, AUTH_FILE);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.apiKey = data.apiKey || null;
      }
    } catch {
      this.apiKey = null;
    }
  }

  private save(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    const filePath = path.join(this.dataDir, AUTH_FILE);
    fs.writeFileSync(filePath, JSON.stringify({ apiKey: this.apiKey }), 'utf-8');
  }
}
```

Note: v1 stores the key as plaintext JSON. Encryption (via Electron's `safeStorage`) is a follow-up improvement.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/auth-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/auth/auth-manager.ts tests/auth/auth-manager.test.ts
git commit -m "feat: auth-manager — API key storage and status"
```

---

### Task 6: Project Manager — CRUD projects, recent list

**Files:**
- Create: `electron/project/project-manager.ts`
- Create: `tests/project/project-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/project/project-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectManager } from '../../electron/project/project-manager';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ProjectManager', () => {
  let pm: ProjectManager;
  let appDataDir: string;
  let projectsDir: string;

  beforeEach(() => {
    appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-app-'));
    projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-projects-'));
    pm = new ProjectManager(appDataDir);
  });

  afterEach(() => {
    fs.rmSync(appDataDir, { recursive: true });
    fs.rmSync(projectsDir, { recursive: true });
  });

  it('starts with empty recent projects', () => {
    expect(pm.getRecentProjects()).toEqual([]);
  });

  it('creates a new project', () => {
    const projectPath = path.join(projectsDir, 'my-app');
    const result = pm.createProject('My App', projectPath);
    expect(result.success).toBe(true);
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, '.the-office', 'config.json'))).toBe(true);
  });

  it('opens an existing project', () => {
    const projectPath = path.join(projectsDir, 'existing');
    fs.mkdirSync(projectPath);
    const result = pm.openProject(projectPath);
    expect(result.success).toBe(true);
  });

  it('rejects opening non-existent directory', () => {
    const result = pm.openProject('/nonexistent/path');
    expect(result.success).toBe(false);
  });

  it('tracks recent projects', () => {
    const p1 = path.join(projectsDir, 'project-1');
    const p2 = path.join(projectsDir, 'project-2');
    pm.createProject('Project 1', p1);
    pm.createProject('Project 2', p2);
    const recent = pm.getRecentProjects();
    expect(recent.length).toBe(2);
    expect(recent[0].name).toBe('Project 2'); // most recent first
  });

  it('reads project state', () => {
    const projectPath = path.join(projectsDir, 'stateful');
    pm.createProject('Stateful', projectPath);
    const state = pm.getProjectState(projectPath);
    expect(state.name).toBe('Stateful');
    expect(state.currentPhase).toBe('idle');
    expect(state.completedPhases).toEqual([]);
    expect(state.interrupted).toBe(false);
  });

  it('persists recent projects across instances', () => {
    const projectPath = path.join(projectsDir, 'persisted');
    pm.createProject('Persisted', projectPath);
    const pm2 = new ProjectManager(appDataDir);
    expect(pm2.getRecentProjects().length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project/project-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/project/project-manager.ts
import fs from 'fs';
import path from 'path';
import type { ProjectInfo, ProjectState } from '../../shared/types';

const RECENT_FILE = 'recent-projects.json';
const CONFIG_DIR = '.the-office';
const CONFIG_FILE = 'config.json';

export class ProjectManager {
  private appDataDir: string;

  constructor(appDataDir: string) {
    this.appDataDir = appDataDir;
  }

  createProject(name: string, projectPath: string): { success: boolean; error?: string } {
    try {
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
      const configDir = path.join(projectPath, CONFIG_DIR);
      fs.mkdirSync(configDir, { recursive: true });

      const config: ProjectState = {
        name,
        path: projectPath,
        currentPhase: 'idle',
        completedPhases: [],
        interrupted: false,
      };
      fs.writeFileSync(
        path.join(configDir, CONFIG_FILE),
        JSON.stringify(config, null, 2),
      );

      this.addToRecent({ name, path: projectPath, lastPhase: null, lastOpened: Date.now() });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  openProject(projectPath: string): { success: boolean; error?: string } {
    if (!fs.existsSync(projectPath)) {
      return { success: false, error: 'Directory does not exist' };
    }
    const name = this.readProjectName(projectPath) || path.basename(projectPath);
    this.addToRecent({ name, path: projectPath, lastPhase: null, lastOpened: Date.now() });
    return { success: true };
  }

  getRecentProjects(): ProjectInfo[] {
    try {
      const filePath = path.join(this.appDataDir, RECENT_FILE);
      if (!fs.existsSync(filePath)) return [];
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return (data as ProjectInfo[]).sort((a, b) => b.lastOpened - a.lastOpened);
    } catch {
      return [];
    }
  }

  getProjectState(projectPath: string): ProjectState {
    const configPath = path.join(projectPath, CONFIG_DIR, CONFIG_FILE);
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* fall through */ }
    return {
      name: path.basename(projectPath),
      path: projectPath,
      currentPhase: 'idle',
      completedPhases: [],
      interrupted: false,
    };
  }

  updateProjectState(projectPath: string, updates: Partial<ProjectState>): void {
    const state = this.getProjectState(projectPath);
    const newState = { ...state, ...updates };
    const configDir = path.join(projectPath, CONFIG_DIR);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(configDir, CONFIG_FILE),
      JSON.stringify(newState, null, 2),
    );
  }

  private readProjectName(projectPath: string): string | null {
    try {
      const configPath = path.join(projectPath, CONFIG_DIR, CONFIG_FILE);
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return data.name || null;
      }
    } catch { /* ignore */ }
    return null;
  }

  private addToRecent(project: ProjectInfo): void {
    const recent = this.getRecentProjects().filter(p => p.path !== project.path);
    recent.unshift(project);
    const trimmed = recent.slice(0, 20); // keep last 20
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(this.appDataDir, RECENT_FILE),
      JSON.stringify(trimmed, null, 2),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/project/project-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/project/project-manager.ts tests/project/project-manager.test.ts
git commit -m "feat: project-manager — create, open, recent projects, state persistence"
```

---

### Task 7: Artifact Store — read/write docs/office/ files

**Files:**
- Create: `electron/project/artifact-store.ts`
- Create: `tests/project/artifact-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/project/artifact-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ArtifactStore } from '../../electron/project/artifact-store';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ArtifactStore', () => {
  let store: ArtifactStore;
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-artifacts-'));
    store = new ArtifactStore(projectDir);
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true });
  });

  it('checks if imagine artifacts exist', () => {
    expect(store.hasImagineArtifacts()).toBe(false);
    const officeDir = path.join(projectDir, 'docs', 'office');
    fs.mkdirSync(officeDir, { recursive: true });
    fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), '# Vision');
    fs.writeFileSync(path.join(officeDir, '04-system-design.md'), '# Design');
    expect(store.hasImagineArtifacts()).toBe(true);
  });

  it('checks if warroom artifacts exist', () => {
    expect(store.hasWarroomArtifacts()).toBe(false);
    const officeDir = path.join(projectDir, 'docs', 'office');
    fs.mkdirSync(officeDir, { recursive: true });
    fs.writeFileSync(path.join(officeDir, 'tasks.yaml'), 'phases: []');
    expect(store.hasWarroomArtifacts()).toBe(true);
  });

  it('reads imagine artifacts as context string', () => {
    const officeDir = path.join(projectDir, 'docs', 'office');
    fs.mkdirSync(officeDir, { recursive: true });
    fs.writeFileSync(path.join(officeDir, '01-vision-brief.md'), '# Vision\nContent');
    const context = store.getImagineContext();
    expect(context).toContain('# Vision');
    expect(context).toContain('Content');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project/artifact-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/project/artifact-store.ts
import fs from 'fs';
import path from 'path';

const OFFICE_DIR = 'docs/office';
const IMAGINE_ARTIFACTS = ['01-vision-brief.md', '04-system-design.md'];
const WARROOM_ARTIFACTS = ['tasks.yaml'];
const ALL_IMAGINE_DOCS = [
  '01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md',
];

export class ArtifactStore {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  get officeDir(): string {
    return path.join(this.projectDir, OFFICE_DIR);
  }

  hasImagineArtifacts(): boolean {
    return IMAGINE_ARTIFACTS.every(f =>
      fs.existsSync(path.join(this.officeDir, f))
    );
  }

  hasWarroomArtifacts(): boolean {
    return WARROOM_ARTIFACTS.every(f =>
      fs.existsSync(path.join(this.officeDir, f))
    );
  }

  getImagineContext(): string {
    const parts: string[] = [];
    for (const file of ALL_IMAGINE_DOCS) {
      const filePath = path.join(this.officeDir, file);
      if (fs.existsSync(filePath)) {
        parts.push(`## ${file}\n\n${fs.readFileSync(filePath, 'utf-8')}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  getTasksYaml(): string | null {
    const filePath = path.join(this.officeDir, 'tasks.yaml');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/project/artifact-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/project/artifact-store.ts tests/project/artifact-store.test.ts
git commit -m "feat: artifact-store — read/write docs/office/ phase artifacts"
```

---

## Chunk 2: SDK Bridge, Permission Handler, Phase Machine

### Task 8: Permission Handler — canUseTool callback routing

**Files:**
- Create: `electron/sdk/permission-handler.ts`
- Create: `tests/sdk/permission-handler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sdk/permission-handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PermissionHandler } from '../../electron/sdk/permission-handler';

describe('PermissionHandler', () => {
  it('auto-approves safe tools in auto-safe mode', async () => {
    const handler = new PermissionHandler('auto-safe', vi.fn());
    const result = await handler.handleToolRequest('Read', { file_path: '/foo' }, 'ceo');
    expect(result.behavior).toBe('allow');
  });

  it('prompts for unsafe tools in auto-safe mode', async () => {
    const sendRequest = vi.fn();
    const handler = new PermissionHandler('auto-safe', sendRequest);

    // Simulate user approving in background
    setTimeout(() => {
      handler.resolvePermission(handler.lastRequestId!, true);
    }, 10);

    const result = await handler.handleToolRequest('Bash', { command: 'rm -rf /' }, 'ceo');
    expect(result.behavior).toBe('allow');
    expect(sendRequest).toHaveBeenCalledOnce();
  });

  it('auto-approves all tools in auto-all mode', async () => {
    const handler = new PermissionHandler('auto-all', vi.fn());
    const result = await handler.handleToolRequest('Bash', { command: 'rm -rf /' }, 'ceo');
    expect(result.behavior).toBe('allow');
  });

  it('prompts for all tools in ask mode', async () => {
    const sendRequest = vi.fn();
    const handler = new PermissionHandler('ask', sendRequest);

    setTimeout(() => {
      handler.resolvePermission(handler.lastRequestId!, false);
    }, 10);

    const result = await handler.handleToolRequest('Read', { file_path: '/foo' }, 'ceo');
    expect(result.behavior).toBe('deny');
  });

  it('times out and denies after timeout', async () => {
    const handler = new PermissionHandler('ask', vi.fn(), 50); // 50ms timeout
    const result = await handler.handleToolRequest('Bash', { command: 'ls' }, 'ceo');
    expect(result.behavior).toBe('deny');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sdk/permission-handler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/sdk/permission-handler.ts
import type { AgentRole, BuildConfig, PermissionRequest } from '../../shared/types';
import { randomUUID } from 'crypto';

const SAFE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']);
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface PermissionResult {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
}

type SendRequestFn = (req: PermissionRequest) => void;

export class PermissionHandler {
  private mode: BuildConfig['permissionMode'];
  private sendRequest: SendRequestFn;
  private timeoutMs: number;
  private pendingResolvers: Map<string, (approved: boolean) => void> = new Map();
  public lastRequestId: string | null = null;

  constructor(mode: BuildConfig['permissionMode'], sendRequest: SendRequestFn, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.mode = mode;
    this.sendRequest = sendRequest;
    this.timeoutMs = timeoutMs;
  }

  setMode(mode: BuildConfig['permissionMode']): void {
    this.mode = mode;
  }

  async handleToolRequest(
    toolName: string,
    input: Record<string, unknown>,
    agentRole: AgentRole,
  ): Promise<PermissionResult> {
    if (this.mode === 'auto-all') {
      return { behavior: 'allow', updatedInput: input };
    }

    if (this.mode === 'auto-safe' && SAFE_TOOLS.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Must prompt user
    const requestId = randomUUID();
    this.lastRequestId = requestId;

    const approved = await new Promise<boolean>((resolve) => {
      this.pendingResolvers.set(requestId, resolve);
      this.sendRequest({ requestId, agentRole, toolName, input });

      setTimeout(() => {
        if (this.pendingResolvers.has(requestId)) {
          this.pendingResolvers.delete(requestId);
          resolve(false);
        }
      }, this.timeoutMs);
    });

    return approved
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: 'User denied tool use' };
  }

  resolvePermission(requestId: string, approved: boolean): void {
    const resolver = this.pendingResolvers.get(requestId);
    if (resolver) {
      this.pendingResolvers.delete(requestId);
      resolver(approved);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sdk/permission-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/sdk/permission-handler.ts tests/sdk/permission-handler.test.ts
git commit -m "feat: permission-handler — canUseTool routing with auto-safe/ask/auto-all modes"
```

---

### Task 9: SDK Bridge — wrap query(), translate events

**Files:**
- Create: `electron/sdk/sdk-bridge.ts`
- Create: `tests/sdk/sdk-bridge.test.ts`

This is the core integration layer. It wraps the Agent SDK's `query()` and translates `SDKMessage` events into the app's `AgentEvent` stream.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sdk/sdk-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { translateMessage } from '../../electron/sdk/sdk-bridge';

describe('sdk-bridge message translation', () => {
  it('translates system init to agent:created', () => {
    const msg = { type: 'system', subtype: 'init', session_id: 'sess-123' };
    const events = translateMessage(msg, 'ceo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:created');
    expect(events[0].agentId).toBe('sess-123');
    expect(events[0].agentRole).toBe('ceo');
    expect(events[0].source).toBe('sdk');
  });

  it('translates assistant tool_use to agent:tool:start', () => {
    const msg = {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 'tool-1', name: 'Read' }],
      },
    };
    const events = translateMessage(msg, 'backend-engineer');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:tool:start');
    expect(events[0].toolName).toBe('Read');
    expect(events[0].toolId).toBe('tool-1');
  });

  it('translates assistant text to agent:message', () => {
    const msg = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello world' }],
      },
    };
    const events = translateMessage(msg, 'ceo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:message');
    expect(events[0].message).toBe('Hello world');
  });

  it('translates user with tool_use_result to agent:tool:done', () => {
    const msg = {
      type: 'user',
      tool_use_result: true,
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'tool-1' }],
      },
    };
    const events = translateMessage(msg, 'ceo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:tool:done');
    expect(events[0].toolId).toBe('tool-1');
  });

  it('translates result to session:cost:update', () => {
    const msg = { type: 'result', total_cost_usd: 0.05, usage: { input_tokens: 100, output_tokens: 50 } };
    const events = translateMessage(msg, 'ceo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('session:cost:update');
    expect(events[0].cost).toBe(0.05);
    expect(events[0].tokens).toBe(150);
  });

  it('translates task_started to agent:created for subagent', () => {
    const msg = { type: 'system', subtype: 'task_started', task_name: 'product-manager' };
    const events = translateMessage(msg, 'ceo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:created');
    expect(events[0].agentRole).toBe('product-manager');
  });

  it('translates stream_event content_block_delta to agent:message:delta', () => {
    const msg = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'partial ' },
      },
    };
    const events = translateMessage(msg, 'ceo');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:message:delta');
    expect(events[0].message).toBe('partial ');
  });

  it('returns empty array for unknown message types', () => {
    const events = translateMessage({ type: 'unknown' }, 'ceo');
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sdk/sdk-bridge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/sdk/sdk-bridge.ts
import { EventEmitter } from 'events';
import type { AgentEvent, AgentRole } from '../../shared/types';
import { AGENT_ROLES } from '../../shared/types';
import type { AgentDefinition } from './agent-loader';
import type { PermissionHandler, PermissionResult } from './permission-handler';

// ── Message Translation (exported for testing) ──

export function translateMessage(msg: any, defaultRole: AgentRole): AgentEvent[] {
  const events: AgentEvent[] = [];
  const ts = Date.now();

  if (msg.type === 'system') {
    if (msg.subtype === 'init') {
      events.push({
        agentId: msg.session_id || 'unknown',
        agentRole: defaultRole,
        source: 'sdk',
        type: 'agent:created',
        timestamp: ts,
      });
    } else if (msg.subtype === 'task_started') {
      const role = resolveRole(msg.task_name || msg.agent_name);
      events.push({
        agentId: msg.task_id || msg.task_name || 'subagent',
        agentRole: role,
        source: 'sdk',
        type: 'agent:created',
        timestamp: ts,
      });
    } else if (msg.subtype === 'task_notification') {
      const role = resolveRole(msg.task_name || msg.agent_name);
      events.push({
        agentId: msg.task_id || msg.task_name || 'subagent',
        agentRole: role,
        source: 'sdk',
        type: 'agent:closed',
        timestamp: ts,
      });
    }
  }

  if (msg.type === 'assistant' && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === 'tool_use') {
        events.push({
          agentId: msg.session_id || 'unknown',
          agentRole: defaultRole,
          source: 'sdk',
          type: 'agent:tool:start',
          toolName: block.name,
          toolId: block.id,
          timestamp: ts,
        });
      } else if (block.type === 'text' && block.text) {
        events.push({
          agentId: msg.session_id || 'unknown',
          agentRole: defaultRole,
          source: 'sdk',
          type: 'agent:message',
          message: block.text,
          timestamp: ts,
        });
      }
    }
  }

  if (msg.type === 'user' && msg.tool_use_result) {
    const content = msg.message?.content || [];
    for (const block of content) {
      if (block.type === 'tool_result') {
        events.push({
          agentId: msg.session_id || 'unknown',
          agentRole: defaultRole,
          source: 'sdk',
          type: 'agent:tool:done',
          toolId: block.tool_use_id,
          timestamp: ts,
        });
      }
    }
  }

  if (msg.type === 'stream_event' && msg.event?.type === 'content_block_delta') {
    if (msg.event.delta?.type === 'text_delta' && msg.event.delta.text) {
      events.push({
        agentId: msg.session_id || 'unknown',
        agentRole: defaultRole,
        source: 'sdk',
        type: 'agent:message:delta',
        message: msg.event.delta.text,
        timestamp: ts,
      });
    }
  }

  if (msg.type === 'result') {
    const tokens = (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);
    events.push({
      agentId: msg.session_id || 'unknown',
      agentRole: defaultRole,
      source: 'sdk',
      type: 'session:cost:update',
      cost: msg.total_cost_usd,
      tokens,
      timestamp: ts,
    });
  }

  return events;
}

function resolveRole(name: string): AgentRole {
  if (!name) return 'freelancer';
  const normalized = name.toLowerCase().replace(/[\s_]/g, '-');
  if ((AGENT_ROLES as readonly string[]).includes(normalized)) {
    return normalized as AgentRole;
  }
  return 'freelancer';
}

// ── SDK Bridge Class ──

export class SDKBridge extends EventEmitter {
  private activeQuery: any = null;

  async runSession(config: {
    prompt: string;
    role: AgentRole;
    agents?: Record<string, AgentDefinition>;
    apiKey: string;
    permissionHandler: PermissionHandler;
    cwd?: string;
  }): Promise<void> {
    // Dynamic import — the SDK may not be available in test environments
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const q = query({
      prompt: config.prompt,
      options: {
        agents: config.agents,
        env: { ANTHROPIC_API_KEY: config.apiKey },
        cwd: config.cwd,
        canUseTool: async (toolName: string, input: any) => {
          return config.permissionHandler.handleToolRequest(
            toolName, input, config.role,
          );
        },
      },
    });

    this.activeQuery = q;

    try {
      for await (const message of q) {
        const events = translateMessage(message, config.role);
        for (const event of events) {
          this.emit('agentEvent', event);
        }
      }
    } finally {
      this.activeQuery = null;
      this.emit('agentEvent', {
        agentId: 'session',
        agentRole: config.role,
        source: 'sdk',
        type: 'agent:closed',
        timestamp: Date.now(),
      } satisfies AgentEvent);
    }
  }

  abort(): void {
    if (this.activeQuery && typeof this.activeQuery.close === 'function') {
      this.activeQuery.close();
    }
    this.activeQuery = null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sdk/sdk-bridge.test.ts`
Expected: PASS (only `translateMessage` is tested — `SDKBridge.runSession` requires the real SDK and will be integration-tested later)

- [ ] **Step 5: Commit**

```bash
git add electron/sdk/sdk-bridge.ts tests/sdk/sdk-bridge.test.ts
git commit -m "feat: sdk-bridge — translate SDK messages to AgentEvents, wrap query()"
```

---

### Task 10: Phase Machine — state machine for workflow phases

**Files:**
- Create: `electron/orchestrator/phase-machine.ts`
- Create: `tests/orchestrator/phase-machine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/orchestrator/phase-machine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PhaseMachine } from '../../electron/orchestrator/phase-machine';

describe('PhaseMachine', () => {
  it('starts in idle', () => {
    const pm = new PhaseMachine();
    expect(pm.currentPhase).toBe('idle');
  });

  it('transitions idle → imagine', () => {
    const pm = new PhaseMachine();
    pm.transition('imagine');
    expect(pm.currentPhase).toBe('imagine');
  });

  it('transitions imagine → warroom', () => {
    const pm = new PhaseMachine();
    pm.transition('imagine');
    pm.transition('warroom');
    expect(pm.currentPhase).toBe('warroom');
  });

  it('transitions warroom → build', () => {
    const pm = new PhaseMachine();
    pm.transition('imagine');
    pm.transition('warroom');
    pm.transition('build');
    expect(pm.currentPhase).toBe('build');
  });

  it('transitions build → complete', () => {
    const pm = new PhaseMachine();
    pm.transition('imagine');
    pm.transition('warroom');
    pm.transition('build');
    pm.transition('complete');
    expect(pm.currentPhase).toBe('complete');
  });

  it('allows backward transition to imagine from any phase', () => {
    const pm = new PhaseMachine();
    pm.transition('imagine');
    pm.transition('warroom');
    pm.transition('imagine'); // redo
    expect(pm.currentPhase).toBe('imagine');
  });

  it('rejects invalid transition idle → build', () => {
    const pm = new PhaseMachine();
    expect(() => pm.transition('build')).toThrow();
  });

  it('emits change events', () => {
    const pm = new PhaseMachine();
    const listener = vi.fn();
    pm.on('change', listener);
    pm.transition('imagine');
    expect(listener).toHaveBeenCalledWith({
      phase: 'imagine',
      status: 'active',
    });
  });

  it('tracks completed phases', () => {
    const pm = new PhaseMachine();
    pm.transition('imagine');
    pm.markCompleted('imagine');
    pm.transition('warroom');
    expect(pm.completedPhases).toContain('imagine');
  });

  it('restores from saved state', () => {
    const pm = new PhaseMachine('warroom', ['imagine']);
    expect(pm.currentPhase).toBe('warroom');
    expect(pm.completedPhases).toContain('imagine');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orchestrator/phase-machine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// electron/orchestrator/phase-machine.ts
import { EventEmitter } from 'events';
import type { Phase, PhaseInfo } from '../../shared/types';

// Valid forward transitions
const FORWARD_TRANSITIONS: Record<Phase, Phase[]> = {
  'idle': ['imagine'],
  'imagine': ['warroom'],
  'warroom': ['build'],
  'build': ['complete'],
  'complete': [],
};

export class PhaseMachine extends EventEmitter {
  private _currentPhase: Phase;
  private _completedPhases: Set<Phase>;

  constructor(initialPhase: Phase = 'idle', completedPhases: Phase[] = []) {
    super();
    this._currentPhase = initialPhase;
    this._completedPhases = new Set(completedPhases);
  }

  get currentPhase(): Phase {
    return this._currentPhase;
  }

  get completedPhases(): Phase[] {
    return Array.from(this._completedPhases);
  }

  transition(target: Phase): void {
    // Always allow backward transition to imagine (redo)
    if (target === 'imagine' && this._currentPhase !== 'idle') {
      this._currentPhase = target;
      this.emitChange('active');
      return;
    }

    // Check valid forward transitions
    const allowed = FORWARD_TRANSITIONS[this._currentPhase];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(`Invalid transition: ${this._currentPhase} → ${target}`);
    }

    this._currentPhase = target;
    this.emitChange('active');
  }

  markCompleted(phase: Phase): void {
    this._completedPhases.add(phase);
    this.emitChange('completed');
  }

  markFailed(): void {
    this.emitChange('failed');
  }

  markInterrupted(): void {
    this.emitChange('interrupted');
  }

  private emitChange(status: PhaseInfo['status']): void {
    this.emit('change', {
      phase: this._currentPhase,
      status,
    } satisfies PhaseInfo);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/orchestrator/phase-machine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/orchestrator/phase-machine.ts tests/orchestrator/phase-machine.test.ts
git commit -m "feat: phase-machine — IDLE→IMAGINE→WARROOM→BUILD→COMPLETE state machine"
```

---

### Task 11: Imagine Orchestrator — spawn /imagine session

**Files:**
- Create: `electron/orchestrator/imagine.ts`

This module connects the SDK Bridge to the /imagine phase. It spawns a `query()` session with the CEO agent, loads all agents as subagent definitions, and monitors for artifact completion.

- [ ] **Step 1: Write the implementation**

```typescript
// electron/orchestrator/imagine.ts
import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAllAgents } from '../sdk/agent-loader';
import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent } from '../../shared/types';
import path from 'path';

export interface ImagineConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
}

export async function runImagine(userIdea: string, config: ImagineConfig): Promise<void> {
  const agents = loadAllAgents(config.agentsDir);
  const bridge = new SDKBridge();

  bridge.on('agentEvent', (event: AgentEvent) => {
    config.onEvent(event);
  });

  const prompt = [
    'You are the CEO of a virtual startup team. The user wants to build something.',
    'Guide them through the /imagine phase: Discovery → Definition → Validation → Architecture.',
    'You have access to subagents: product-manager, market-researcher, chief-architect.',
    'Dispatch them as needed to produce these artifacts in docs/office/:',
    '- 01-vision-brief.md',
    '- 02-prd.md',
    '- 03-market-analysis.md',
    '- 04-system-design.md',
    '',
    `The user's idea: ${userIdea}`,
  ].join('\n');

  await bridge.runSession({
    prompt,
    role: 'ceo',
    agents,
    apiKey: config.apiKey,
    permissionHandler: config.permissionHandler,
    cwd: config.projectDir,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/orchestrator/imagine.ts
git commit -m "feat: imagine orchestrator — spawn CEO session for /imagine phase"
```

---

### Task 12: Warroom Orchestrator — spawn /warroom session

**Files:**
- Create: `electron/orchestrator/warroom.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// electron/orchestrator/warroom.ts
import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAllAgents } from '../sdk/agent-loader';
import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent } from '../../shared/types';

export interface WarroomConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  permissionHandler: PermissionHandler;
  onEvent: (event: AgentEvent) => void;
}

export async function runWarroom(config: WarroomConfig): Promise<void> {
  const agents = loadAllAgents(config.agentsDir);
  const artifactStore = new ArtifactStore(config.projectDir);
  const context = artifactStore.getImagineContext();

  const bridge = new SDKBridge();
  bridge.on('agentEvent', (event: AgentEvent) => {
    config.onEvent(event);
  });

  const prompt = [
    'You are the Agent Organizer leading the War Room planning phase.',
    'You have access to subagents: project-manager, team-lead.',
    'Based on the design documents below, produce:',
    '- docs/office/plan.md — human-readable implementation plan',
    '- docs/office/tasks.yaml — machine-readable task manifest with phases, dependencies, and assigned agents',
    '',
    'Design documents:',
    context,
  ].join('\n');

  await bridge.runSession({
    prompt,
    role: 'agent-organizer',
    agents,
    apiKey: config.apiKey,
    permissionHandler: config.permissionHandler,
    cwd: config.projectDir,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/orchestrator/warroom.ts
git commit -m "feat: warroom orchestrator — spawn Organizer session for /warroom phase"
```

---

### Task 13: Add js-yaml dependency for build orchestrator

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install js-yaml**

```bash
npm install js-yaml
npm install -D @types/js-yaml
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-yaml for tasks.yaml parsing"
```

---

### Task 14: Build Orchestrator — parallel phase sessions

**Files:**
- Create: `electron/orchestrator/build.ts`

The build orchestrator is the most complex piece. It reads `tasks.yaml`, resolves the dependency graph, and spawns parallel `query()` sessions for independent phases.

- [ ] **Step 1: Write the implementation**

```typescript
// electron/orchestrator/build.ts
import { SDKBridge } from '../sdk/sdk-bridge';
import { loadAllAgents } from '../sdk/agent-loader';
import { ArtifactStore } from '../project/artifact-store';
import type { PermissionHandler } from '../sdk/permission-handler';
import type { AgentEvent, BuildConfig, KanbanState, KanbanTask } from '../../shared/types';
import yaml from 'js-yaml'; // will need to add dependency

export interface BuildPhase {
  id: string;
  name: string;
  dependsOn: string[];
  tasks: { id: string; description: string; assignedAgent: string }[];
}

export interface BuildOrchestratorConfig {
  projectDir: string;
  agentsDir: string;
  apiKey: string;
  permissionHandler: PermissionHandler;
  buildConfig: BuildConfig;
  onEvent: (event: AgentEvent) => void;
  onKanbanUpdate: (state: KanbanState) => void;
}

export async function runBuild(config: BuildOrchestratorConfig): Promise<void> {
  const artifactStore = new ArtifactStore(config.projectDir);
  const tasksYaml = artifactStore.getTasksYaml();
  if (!tasksYaml) {
    throw new Error('tasks.yaml not found — run /warroom first');
  }

  const parsed = yaml.load(tasksYaml) as any;
  const phases: BuildPhase[] = (parsed.phases || parsed || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    dependsOn: p.depends_on || [],
    tasks: p.tasks || [],
  }));

  const agents = loadAllAgents(config.agentsDir);
  const completed = new Set<string>();
  const failed = new Set<string>();

  while (completed.size + failed.size < phases.length) {
    // Find ready phases
    const ready = phases.filter(p =>
      !completed.has(p.id) &&
      !failed.has(p.id) &&
      p.dependsOn.every(dep => completed.has(dep))
    );

    if (ready.length === 0) {
      if (failed.size > 0) break; // deadlocked by failures
      break;
    }

    // Run ready phases in parallel
    const results = await Promise.allSettled(
      ready.map(phase => runPhaseSession(phase, agents, config))
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        completed.add(ready[i].id);
      } else {
        failed.add(ready[i].id);
      }
      emitKanbanUpdate(phases, completed, failed, config);
    }
  }
}

async function runPhaseSession(
  phase: BuildPhase,
  agents: Record<string, any>,
  config: BuildOrchestratorConfig,
): Promise<void> {
  const bridge = new SDKBridge();
  bridge.on('agentEvent', (event: AgentEvent) => {
    config.onEvent(event);
  });

  const taskList = phase.tasks
    .map(t => `- ${t.id}: ${t.description} (assigned: ${t.assignedAgent})`)
    .join('\n');

  const prompt = [
    `You are executing build phase: ${phase.name} (${phase.id}).`,
    'Implement the following tasks sequentially using TDD:',
    taskList,
    '',
    'For each task: write failing test → implement → verify pass → commit.',
    'Read the spec files in spec/ for implementation details.',
  ].join('\n');

  await bridge.runSession({
    prompt,
    role: 'backend-engineer', // default — could be smarter about role selection
    agents,
    apiKey: config.apiKey,
    permissionHandler: config.permissionHandler,
    cwd: config.projectDir,
  });
}

function emitKanbanUpdate(
  phases: BuildPhase[],
  completed: Set<string>,
  failed: Set<string>,
  config: BuildOrchestratorConfig,
): void {
  const tasks: KanbanTask[] = phases.flatMap(phase =>
    phase.tasks.map(t => ({
      id: t.id,
      description: t.description,
      status: failed.has(phase.id) ? 'failed' as const
        : completed.has(phase.id) ? 'done' as const
        : 'queued' as const,
      assignedAgent: t.assignedAgent as any,
      phaseId: phase.id,
    }))
  );

  const totalDone = phases.filter(p => completed.has(p.id)).length;

  config.onKanbanUpdate({
    projectName: '',
    currentPhase: 'build',
    completionPercent: Math.round((totalDone / phases.length) * 100),
    tasks,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/orchestrator/build.ts
git commit -m "feat: build orchestrator — parallel phase sessions with dependency graph"
```

---

## Chunk 3: Main Process & Preload Rewrite

### Task 15: Rewrite main.ts — wire all components together

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Rewrite main.ts**

Replace the entire file. The new main.ts creates the window, initializes all managers, and sets up IPC handlers for every channel in the contract.

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { AuthManager } from './auth/auth-manager';
import { ProjectManager } from './project/project-manager';
import { ArtifactStore } from './project/artifact-store';
import { PermissionHandler } from './sdk/permission-handler';
import { PhaseMachine } from './orchestrator/phase-machine';
import { runImagine } from './orchestrator/imagine';
import { runWarroom } from './orchestrator/warroom';
import { runBuild } from './orchestrator/build';
import { IPC_CHANNELS } from '../shared/types';
import type {
  AuthStatus, BuildConfig, ChatMessage, AgentEvent,
  PhaseInfo, KanbanState, SessionStats, AppSettings,
} from '../shared/types';

let mainWindow: BrowserWindow | null = null;

// ── Managers ──
const appDataDir = path.join(app.getPath('userData'), 'the-office');
const authManager = new AuthManager(appDataDir);
const projectManager = new ProjectManager(appDataDir);
let phaseMachine: PhaseMachine | null = null;
let permissionHandler: PermissionHandler | null = null;
let currentProjectDir: string | null = null;
let activeAbort: (() => void) | null = null;

const agentsDir = path.join(__dirname, '../../agents');

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

  mainWindow.on('closed', () => { mainWindow = null; });
}

function send(channel: string, data: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function sendChat(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
  send(IPC_CHANNELS.CHAT_MESSAGE, {
    ...msg,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
  });
}

function onAgentEvent(event: AgentEvent) {
  send(IPC_CHANNELS.AGENT_EVENT, event);
  if (event.type === 'agent:message' && event.message) {
    sendChat({ role: 'agent', agentRole: event.agentRole, text: event.message });
  }
  if (event.type === 'session:cost:update') {
    send(IPC_CHANNELS.STATS_UPDATE, {
      totalCost: event.cost || 0,
      totalTokens: event.tokens || 0,
      sessionTime: 0,
      activeAgents: 0,
    } satisfies SessionStats);
  }
}

function setupIPC() {
  // ── Auth ──
  ipcMain.handle(IPC_CHANNELS.GET_AUTH_STATUS, () => authManager.getStatus());
  ipcMain.handle(IPC_CHANNELS.CONNECT_API_KEY, (_, key: string) => authManager.connectApiKey(key));
  ipcMain.handle(IPC_CHANNELS.DISCONNECT, () => { authManager.disconnect(); });

  // ── Projects ──
  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, () => projectManager.getRecentProjects());
  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, (_, p: string) => {
    const result = projectManager.openProject(p);
    if (result.success) currentProjectDir = p;
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, (_, name: string, p: string) => {
    const result = projectManager.createProject(name, p);
    if (result.success) currentProjectDir = p;
    return result;
  });
  ipcMain.handle(IPC_CHANNELS.PICK_DIRECTORY, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_STATE, () => {
    if (!currentProjectDir) return null;
    return projectManager.getProjectState(currentProjectDir);
  });

  // ── Phase Control ──
  ipcMain.handle(IPC_CHANNELS.START_IMAGINE, async (_, userIdea: string) => {
    if (!currentProjectDir || !authManager.getApiKey()) return;
    phaseMachine = new PhaseMachine();
    phaseMachine.transition('imagine');
    phaseMachine.on('change', (info: PhaseInfo) => send(IPC_CHANNELS.PHASE_CHANGE, info));
    send(IPC_CHANNELS.PHASE_CHANGE, { phase: 'imagine', status: 'active' });

    permissionHandler = new PermissionHandler('auto-safe', (req) => {
      send(IPC_CHANNELS.PERMISSION_REQUEST, req);
    });

    try {
      await runImagine(userIdea, {
        projectDir: currentProjectDir,
        agentsDir,
        apiKey: authManager.getApiKey()!,
        permissionHandler,
        onEvent: onAgentEvent,
      });
      phaseMachine.markCompleted('imagine');
      projectManager.updateProjectState(currentProjectDir, {
        currentPhase: 'imagine',
        completedPhases: phaseMachine.completedPhases,
      });
      sendChat({ role: 'agent', agentRole: 'ceo', text: 'Design is locked. Ready to move to the war room?' });
    } catch (err: any) {
      phaseMachine.markFailed();
      sendChat({ role: 'agent', text: `Error: ${err.message}` });
    }
  });

  ipcMain.handle(IPC_CHANNELS.START_WARROOM, async () => {
    if (!currentProjectDir || !authManager.getApiKey() || !phaseMachine || !permissionHandler) return;
    phaseMachine.transition('warroom');
    send(IPC_CHANNELS.PHASE_CHANGE, { phase: 'warroom', status: 'active' });

    try {
      await runWarroom({
        projectDir: currentProjectDir,
        agentsDir,
        apiKey: authManager.getApiKey()!,
        permissionHandler,
        onEvent: onAgentEvent,
      });
      phaseMachine.markCompleted('warroom');
      projectManager.updateProjectState(currentProjectDir, {
        currentPhase: 'warroom',
        completedPhases: phaseMachine.completedPhases,
      });
      sendChat({ role: 'agent', agentRole: 'agent-organizer', text: 'Plan complete. Ready to build?' });
    } catch (err: any) {
      phaseMachine.markFailed();
      sendChat({ role: 'agent', text: `Error: ${err.message}` });
    }
  });

  ipcMain.handle(IPC_CHANNELS.START_BUILD, async (_, config: BuildConfig) => {
    if (!currentProjectDir || !authManager.getApiKey() || !phaseMachine) return;
    phaseMachine.transition('build');
    send(IPC_CHANNELS.PHASE_CHANGE, { phase: 'build', status: 'active' });

    permissionHandler = new PermissionHandler(config.permissionMode, (req) => {
      send(IPC_CHANNELS.PERMISSION_REQUEST, req);
    });

    try {
      await runBuild({
        projectDir: currentProjectDir,
        agentsDir,
        apiKey: authManager.getApiKey()!,
        permissionHandler,
        buildConfig: config,
        onEvent: onAgentEvent,
        onKanbanUpdate: (state: KanbanState) => send(IPC_CHANNELS.KANBAN_UPDATE, state),
      });
      phaseMachine.markCompleted('build');
      phaseMachine.transition('complete');
      projectManager.updateProjectState(currentProjectDir, {
        currentPhase: 'complete',
        completedPhases: phaseMachine.completedPhases,
      });
      sendChat({ role: 'agent', text: 'Build complete!' });
    } catch (err: any) {
      phaseMachine.markFailed();
      sendChat({ role: 'agent', text: `Build error: ${err.message}` });
    }
  });

  // ── Chat ──
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_, message: string) => {
    // For v1, messages during active phase are not routed back to SDK
    // (SDK sessions run to completion). This is a placeholder for future interaction.
    sendChat({ role: 'user', text: message });
  });

  // ── Permissions ──
  ipcMain.handle(IPC_CHANNELS.RESPOND_PERMISSION, (_, requestId: string, approved: boolean) => {
    permissionHandler?.resolvePermission(requestId, approved);
  });

  // ── Settings ──
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, (): AppSettings => ({
    defaultModelPreset: 'default',
    defaultPermissionMode: 'auto-safe',
  }));
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_, settings: AppSettings) => {
    // TODO: persist to disk
  });
}

// ── App lifecycle ──

app.whenReady().then(() => {
  createWindow();
  setupIPC();
});

app.on('window-all-closed', () => {
  if (phaseMachine && currentProjectDir) {
    phaseMachine.markInterrupted();
    projectManager.updateProjectState(currentProjectDir, { interrupted: true });
  }
  activeAbort?.();
  app.quit();
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: May have import resolution issues — fix any remaining type errors.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "refactor: rewrite main.ts — SDK-driven orchestration with full IPC contract"
```

---

### Task 16: Rewrite preload.ts — new IPC bridge

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Rewrite preload.ts**

Replace the entire file with the new IPC contract:

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type {
  AuthStatus, ProjectInfo, ProjectState, PhaseInfo,
  ChatMessage, AgentEvent, PermissionRequest, KanbanState,
  SessionStats, BuildConfig, AppSettings, AgentRole,
} from '../shared/types';

function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('office', {
  // Auth
  getAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AUTH_STATUS),
  connectApiKey: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECT_API_KEY, key),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.DISCONNECT),
  onAuthStatusChange: (cb: (s: AuthStatus) => void) => onEvent(IPC_CHANNELS.AUTH_STATUS_CHANGE, cb),

  // Projects
  getRecentProjects: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_PROJECTS),
  openProject: (p: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PROJECT, p),
  createProject: (name: string, p: string) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PROJECT, name, p),
  pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.PICK_DIRECTORY),
  getProjectState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECT_STATE),

  // Phase Control
  startImagine: (idea: string) => ipcRenderer.invoke(IPC_CHANNELS.START_IMAGINE, idea),
  startWarroom: () => ipcRenderer.invoke(IPC_CHANNELS.START_WARROOM),
  startBuild: (config: BuildConfig) => ipcRenderer.invoke(IPC_CHANNELS.START_BUILD, config),
  onPhaseChange: (cb: (p: PhaseInfo) => void) => onEvent(IPC_CHANNELS.PHASE_CHANGE, cb),

  // Chat
  sendMessage: (msg: string) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, msg),
  onChatMessage: (cb: (m: ChatMessage) => void) => onEvent(IPC_CHANNELS.CHAT_MESSAGE, cb),

  // Agent Events
  onAgentEvent: (cb: (e: AgentEvent) => void) => onEvent(IPC_CHANNELS.AGENT_EVENT, cb),

  // Permissions
  onPermissionRequest: (cb: (r: PermissionRequest) => void) => onEvent(IPC_CHANNELS.PERMISSION_REQUEST, cb),
  respondPermission: (id: string, approved: boolean) => ipcRenderer.invoke(IPC_CHANNELS.RESPOND_PERMISSION, id, approved),

  // Kanban
  onKanbanUpdate: (cb: (s: KanbanState) => void) => onEvent(IPC_CHANNELS.KANBAN_UPDATE, cb),

  // Stats
  onStatsUpdate: (cb: (s: SessionStats) => void) => onEvent(IPC_CHANNELS.STATS_UPDATE, cb),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (s: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, s),
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "refactor: rewrite preload.ts — new SDK-driven IPC bridge"
```

---

### Task 17: Remove old adapter files

**Files:**
- Delete: `electron/adapters/claude-transcript.adapter.ts`
- Delete: `electron/adapters/opencode.adapter.ts`
- Delete: `electron/adapters/claude-code-process.ts`
- Delete: `electron/adapters/types.ts`
- Delete: `electron/session-manager.ts`
- Delete: `electron/settings.ts`

- [ ] **Step 1: Remove old files**

```bash
rm -rf electron/adapters/
rm -f electron/session-manager.ts electron/settings.ts
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Should compile cleanly (main.ts and preload.ts no longer reference removed files).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old adapter files — replaced by SDK bridge"
```

---

### Task 18: Verify full build

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run electron-vite build**

Run: `npx electron-vite build`
Expected: Build succeeds

- [ ] **Step 3: Commit any fixes if needed**

---

## Chunk 4: Renderer — Stores, Routing, Core Components

> **Note:** This chunk covers the React renderer. The PixiJS office (characters, tiles, animations) is a separate chunk (Chunk 5) since it can be developed independently — the stores provide the interface.
>
> **Important:** Renderer source lives at `src/renderer/src/`. The `@` alias resolves to `src/renderer/src/` and `@shared` resolves to `shared/` (see `electron.vite.config.ts`). All renderer imports should use these aliases. Existing files (stores, screens, components) will be replaced — this is a full rewrite of the renderer layer.

### Task 19: Update electron.vite.config.ts and remove sql.js external

**Files:**
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Remove `sql.js` from rollup externals**

In `electron.vite.config.ts`, remove the `rollupOptions.external` block since `sql.js` is no longer a dependency:

```typescript
  main: {
    build: {
      outDir: 'dist/main',
      lib: {
        entry: 'electron/main.ts',
        formats: ['cjs'],
      },
      // rollupOptions.external removed — sql.js no longer used
    },
  },
```

- [ ] **Step 2: Commit**

```bash
git add electron.vite.config.ts
git commit -m "chore: remove sql.js external from vite config"
```

---

### Task 20: Zustand stores — project, chat, kanban, office

**Files:**
- Create: `src/renderer/src/stores/project.store.ts`
- Rewrite: `src/renderer/src/stores/chat.store.ts`
- Rewrite: `src/renderer/src/stores/kanban.store.ts`
- Rewrite: `src/renderer/src/stores/office.store.ts`
- Delete: `src/renderer/src/stores/app.store.ts` (replaced by project.store.ts)
- Delete: `src/renderer/src/stores/session.store.ts` (no longer needed)
- Delete: `src/renderer/src/stores/settings.store.ts` (replaced by project.store.ts)

- [ ] **Step 1: Delete old stores and create project store**

```bash
rm -f src/renderer/src/stores/app.store.ts src/renderer/src/stores/session.store.ts src/renderer/src/stores/settings.store.ts
```

```typescript
// src/renderer/src/stores/project.store.ts
import { create } from 'zustand';
import type { Phase, PhaseInfo, ProjectState, AuthStatus } from '@shared/types';

interface ProjectStore {
  authStatus: AuthStatus;
  projectState: ProjectState | null;
  currentPhase: PhaseInfo | null;

  setAuthStatus: (status: AuthStatus) => void;
  setProjectState: (state: ProjectState | null) => void;
  setPhaseInfo: (info: PhaseInfo) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  authStatus: { connected: false },
  projectState: null,
  currentPhase: null,

  setAuthStatus: (status) => set({ authStatus: status }),
  setProjectState: (state) => set({ projectState: state }),
  setPhaseInfo: (info) => set({ currentPhase: info }),
}));
```

- [ ] **Step 2: Create chat store**

```typescript
// src/renderer/src/stores/chat.store.ts
import { create } from 'zustand';
import type { ChatMessage } from '@shared/types';

interface ChatStore {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
}));
```

- [ ] **Step 3: Create kanban store**

```typescript
// src/renderer/src/stores/kanban.store.ts
import { create } from 'zustand';
import type { KanbanState } from '@shared/types';

interface KanbanStore {
  kanban: KanbanState;
  setKanban: (state: KanbanState) => void;
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  kanban: { projectName: '', currentPhase: '', completionPercent: 0, tasks: [] },
  setKanban: (state) => set({ kanban: state }),
}));
```

- [ ] **Step 4: Create office store** (drives PixiJS character state)

```typescript
// src/renderer/src/stores/office.store.ts
import { create } from 'zustand';
import type { AgentRole, AgentEvent } from '@shared/types';

export type CharacterState = 'idle' | 'walking' | 'typing' | 'reading';

export interface CharacterInfo {
  role: AgentRole;
  state: CharacterState;
  toolName?: string;
  lastActive: number;
}

interface OfficeStore {
  characters: Map<AgentRole, CharacterInfo>;
  handleAgentEvent: (event: AgentEvent) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  characters: new Map(),

  handleAgentEvent: (event) => set((state) => {
    const chars = new Map(state.characters);
    const role = event.agentRole;

    if (event.type === 'agent:created') {
      chars.set(role, { role, state: 'idle', lastActive: event.timestamp });
    } else if (event.type === 'agent:tool:start') {
      const readTools = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'];
      const charState = readTools.includes(event.toolName || '') ? 'reading' : 'typing';
      chars.set(role, { role, state: charState, toolName: event.toolName, lastActive: event.timestamp });
    } else if (event.type === 'agent:tool:done') {
      const existing = chars.get(role);
      if (existing) {
        chars.set(role, { ...existing, state: 'idle', toolName: undefined, lastActive: event.timestamp });
      }
    } else if (event.type === 'agent:closed') {
      const existing = chars.get(role);
      if (existing) {
        chars.set(role, { ...existing, state: 'idle', lastActive: event.timestamp });
      }
    }

    return { characters: chars };
  }),
}));
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/
git commit -m "feat: zustand stores — project, chat, kanban, office"
```

---

### Task 21: App.tsx — routing between project picker and office view

**Files:**
- Rewrite: `src/renderer/src/App.tsx`
- Delete: `src/renderer/src/screens/LobbyScreen.tsx` (replaced by ProjectPicker)
- Delete: `src/renderer/src/screens/OfficeScreen.tsx` (replaced by OfficeView)
- Delete: `src/renderer/src/lobby/` (replaced by ProjectPicker)

- [ ] **Step 1: Remove old screens and lobby**

```bash
rm -rf src/renderer/src/screens/ src/renderer/src/lobby/
```

- [ ] **Step 2: Write App.tsx with routing**

```typescript
// src/renderer/src/App.tsx
import React, { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project.store';
import { useChatStore } from '@/stores/chat.store';
import { useKanbanStore } from '@/stores/kanban.store';
import { useOfficeStore } from '@/stores/office.store';

// Placeholder components — will be implemented in later tasks
const ProjectPicker = React.lazy(() => import('@/components/ProjectPicker/ProjectPicker'));
const OfficeView = React.lazy(() => import('@/components/OfficeView/OfficeView'));

export default function App() {
  const projectState = useProjectStore((s) => s.projectState);
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);
  const setProjectState = useProjectStore((s) => s.setProjectState);
  const setPhaseInfo = useProjectStore((s) => s.setPhaseInfo);
  const addMessage = useChatStore((s) => s.addMessage);
  const setKanban = useKanbanStore((s) => s.setKanban);
  const handleAgentEvent = useOfficeStore((s) => s.handleAgentEvent);

  // Wire up IPC listeners
  useEffect(() => {
    const unsubs = [
      window.office.onAuthStatusChange(setAuthStatus),
      window.office.onPhaseChange(setPhaseInfo),
      window.office.onChatMessage(addMessage),
      window.office.onKanbanUpdate(setKanban),
      window.office.onAgentEvent(handleAgentEvent),
    ];
    // Load initial auth status
    window.office.getAuthStatus().then(setAuthStatus);
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const view = projectState ? 'office' : 'picker';

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f0f1a', color: '#e5e5e5' }}>
      <React.Suspense fallback={<div>Loading...</div>}>
        {view === 'picker' ? (
          <ProjectPicker onProjectOpened={(state) => setProjectState(state)} />
        ) : (
          <OfficeView />
        )}
      </React.Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: App.tsx — route between project picker and office view"
```

---

### Task 22: ProjectPicker component

**Files:**
- Create: `src/renderer/src/components/ProjectPicker/ProjectPicker.tsx`

- [ ] **Step 1: Write ProjectPicker**

```typescript
// src/renderer/src/components/ProjectPicker/ProjectPicker.tsx
import React, { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project.store';
import type { ProjectInfo, ProjectState } from '@shared/types';

interface Props {
  onProjectOpened: (state: ProjectState) => void;
}

export default function ProjectPicker({ onProjectOpened }: Props) {
  const authStatus = useProjectStore((s) => s.authStatus);
  const [recentProjects, setRecentProjects] = useState<ProjectInfo[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    window.office.getRecentProjects().then(setRecentProjects);
  }, []);

  const handleNewProject = async () => {
    const dir = await window.office.pickDirectory();
    if (!dir || !newProjectName.trim()) return;
    const result = await window.office.createProject(newProjectName.trim(), dir);
    if (result.success) {
      const state = await window.office.getProjectState();
      if (state) onProjectOpened(state);
    }
  };

  const handleOpenProject = async () => {
    const dir = await window.office.pickDirectory();
    if (!dir) return;
    const result = await window.office.openProject(dir);
    if (result.success) {
      const state = await window.office.getProjectState();
      if (state) onProjectOpened(state);
    }
  };

  const handleOpenRecent = async (project: ProjectInfo) => {
    const result = await window.office.openProject(project.path);
    if (result.success) {
      const state = await window.office.getProjectState();
      if (state) onProjectOpened(state);
    }
  };

  const handleConnectApiKey = async () => {
    const result = await window.office.connectApiKey(apiKeyInput);
    if (result.success) {
      setApiKeyInput('');
      setShowSettings(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>The Office</h1>

      {/* Account status */}
      <div style={{ position: 'fixed', bottom: 16, left: 16, fontSize: 14, opacity: 0.7 }}>
        <span style={{ color: authStatus.connected ? '#22c55e' : '#ef4444' }}>●</span>
        {' '}{authStatus.connected ? authStatus.account : 'Not connected'}
        {!authStatus.connected && (
          <button onClick={() => setShowSettings(true)} style={{ marginLeft: 8, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
            Connect
          </button>
        )}
      </div>

      {/* Settings panel (inline for v1) */}
      {showSettings && (
        <div style={{ padding: 16, border: '1px solid #333', borderRadius: 8, width: 400 }}>
          <h3>API Key</h3>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-..."
            style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 4, color: '#e5e5e5' }}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={handleConnectApiKey}>Connect</button>
            <button onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* New project */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="Project name"
          style={{ padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 4, color: '#e5e5e5' }}
        />
        <button onClick={handleNewProject} disabled={!authStatus.connected}>New Project</button>
      </div>

      {/* Open existing */}
      <button onClick={handleOpenProject} disabled={!authStatus.connected}>Open Project</button>

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <div style={{ width: 400 }}>
          <h3 style={{ fontSize: 14, opacity: 0.7, marginBottom: 8 }}>Recent Projects</h3>
          {recentProjects.map((p) => (
            <div
              key={p.path}
              onClick={() => handleOpenRecent(p)}
              style={{ padding: 12, border: '1px solid #333', borderRadius: 4, marginBottom: 4, cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, opacity: 0.5 }}>{p.path}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ProjectPicker/
git commit -m "feat: ProjectPicker component — new/open/recent projects + API key setup"
```

---

### Task 23: OfficeView shell component

**Files:**
- Create: `src/renderer/src/components/OfficeView/OfficeView.tsx`

This is the main office layout shell — chat panel left, PixiJS canvas right, top bar.

- [ ] **Step 1: Write OfficeView**

```typescript
// src/renderer/src/components/OfficeView/OfficeView.tsx
import React, { useEffect } from 'react';
import { useProjectStore } from '@/stores/project.store';
import { useChatStore } from '@/stores/chat.store';

export default function OfficeView() {
  const projectState = useProjectStore((s) => s.projectState);
  const currentPhase = useProjectStore((s) => s.currentPhase);
  const authStatus = useProjectStore((s) => s.authStatus);
  const messages = useChatStore((s) => s.messages);
  const [input, setInput] = React.useState('');

  // CEO introduction on first load
  useEffect(() => {
    if (projectState?.currentPhase === 'idle' && messages.length === 0) {
      window.office.sendMessage(''); // trigger CEO intro (handled in main process)
    }
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');

    if (!currentPhase || currentPhase.phase === 'idle') {
      // First message starts /imagine
      await window.office.startImagine(text);
    } else {
      await window.office.sendMessage(text);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #333', gap: 16, fontSize: 14 }}>
        <span style={{ fontWeight: 700 }}>{projectState?.name}</span>
        <span style={{ opacity: 0.5 }}>
          {currentPhase ? `${currentPhase.phase} — ${currentPhase.status}` : 'idle'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ color: authStatus.connected ? '#22c55e' : '#ef4444' }}>●</span>
        <span style={{ opacity: 0.7 }}>{authStatus.account}</span>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Chat panel */}
        <div style={{ width: 320, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.5 }}>
                  {msg.role === 'user' ? 'You' : msg.agentRole || 'Agent'}
                </div>
                <div>{msg.text}</div>
              </div>
            ))}
          </div>
          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #333' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={currentPhase?.phase === 'idle' ? 'What would you like to build?' : 'Type a message...'}
              style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 4, color: '#e5e5e5' }}
            />
          </div>
        </div>

        {/* PixiJS canvas placeholder */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
          Pixel Office (PixiJS — Chunk 5)
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/
git commit -m "feat: OfficeView shell — chat panel, top bar, canvas placeholder"
```

---

### Task 24: Permission Prompt component

**Files:**
- Create: `src/renderer/src/components/PermissionPrompt/PermissionPrompt.tsx`

- [ ] **Step 1: Write PermissionPrompt**

```typescript
// src/renderer/src/components/PermissionPrompt/PermissionPrompt.tsx
import React, { useEffect, useState } from 'react';
import type { PermissionRequest } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';

export default function PermissionPrompt() {
  const [requests, setRequests] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    return window.office.onPermissionRequest((req) => {
      setRequests((prev) => [...prev, req]);
    });
  }, []);

  const handleRespond = (requestId: string, approved: boolean) => {
    window.office.respondPermission(requestId, approved);
    setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  };

  if (requests.length === 0) return null;

  const req = requests[0]; // show one at a time

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 16,
      background: '#1a1a2e', border: '1px solid #f59e0b', borderRadius: 8,
      padding: 16, width: 360, zIndex: 1000,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: AGENT_COLORS[req.agentRole] || '#fff' }}>
        {req.agentRole} wants to use {req.toolName}
      </div>
      <pre style={{ fontSize: 12, opacity: 0.7, maxHeight: 100, overflow: 'auto', marginTop: 8 }}>
        {JSON.stringify(req.input, null, 2).slice(0, 500)}
      </pre>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => handleRespond(req.requestId, true)} style={{ background: '#22c55e', color: '#000', border: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer' }}>
          Allow
        </button>
        <button onClick={() => handleRespond(req.requestId, false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 4, cursor: 'pointer' }}>
          Deny
        </button>
      </div>
      {requests.length > 1 && (
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>
          +{requests.length - 1} more pending
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/PermissionPrompt/
git commit -m "feat: PermissionPrompt component — tool approval UI"
```

---

### Task 25: Integrate PermissionPrompt into OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Add PermissionPrompt import and render**

Add import at top of OfficeView.tsx:
```typescript
import PermissionPrompt from '@/components/PermissionPrompt/PermissionPrompt';
```

Add `<PermissionPrompt />` as the last child inside the outermost `<div>`, after the main content flex container.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: integrate PermissionPrompt into OfficeView"
```

---

### Task 26: Verify renderer entry point

The existing `src/renderer/src/main.tsx` and `src/renderer/index.html` should already mount the `App` component. Verify this still works after the App.tsx rewrite.

- [ ] **Step 1: Check main.tsx imports App correctly**

Verify `src/renderer/src/main.tsx` imports from `./App`. Fix if needed.

- [ ] **Step 2: Commit any fixes**

```bash
git add src/renderer/
git commit -m "fix: verify renderer entry point mounts new App"
```

---

### Task 27: Final integration test — build and launch

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All unit tests pass

- [ ] **Step 2: Build the app**

Run: `npx electron-vite build`
Expected: Build succeeds

- [ ] **Step 3: Launch in dev mode**

Run: `npx electron-vite dev`
Expected: App opens with ProjectPicker screen. Bottom-left shows "Not connected". Can enter API key and create a project.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: integration fixes for SDK-driven app"
```

---

## Chunk 5: PixiJS Office (Future)

> The PixiJS office (tilemap, characters, animations, furniture, camera) is a substantial subsystem that builds on the stores from Chunk 4. It follows the original spec's design (2026-03-13) for tile grid, character sprites, pathfinding, and animation state machine. This chunk should be planned separately once Chunks 1-4 are complete and the data flow (stores → PixiJS) is proven.

The OfficeView currently renders a placeholder where the PixiJS canvas will go. The `useOfficeStore` provides character state (idle/typing/reading) that the PixiJS layer will consume.

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-7 | Types, deps, agents, auth, project manager, artifact store |
| 2: SDK Bridge | 8-12 | Permission handler, SDK bridge, phase machine, orchestrators |
| 3: Main + Preload | 13-18 | js-yaml dep, build orchestrator, rewritten main.ts/preload.ts, old code removed |
| 4: Renderer | 19-27 | Vite config fix, stores, App routing, ProjectPicker, OfficeView, PermissionPrompt |
| 5: PixiJS | Future | Pixel office canvas, characters, animations |

After Chunk 4, the app is functional: users can connect API key, create projects, and run the full imagine → warroom → build pipeline through the chat panel with live permission prompts. The pixel office visual layer (Chunk 5) is the final piece.
