# The Office — SDK-Driven Pixel-Art Agent App

## Overview

A standalone Electron app that serves as the primary interface for the office virtual startup team. Users open the app, connect their Anthropic account, create or select a project, and interact with 14 AI agents through a chat panel while watching them work as animated pixel-art characters in a virtual office.

The app embeds the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) directly, running all agent sessions programmatically — no terminal or CLI dependency. It coexists with the existing office Claude Code plugin; both share the same agent definition markdown files but operate independently.

## Goals

- Provide a standalone desktop app for the full office workflow (imagine → warroom → build)
- Use the Agent SDK for all AI interactions — no CLI subprocess, no file watching
- Support account connection via OAuth or API key
- Offer a project picker with create/open/recent project support
- Visualize agent activity as pixel-art characters in real-time
- Handle tool permissions through the UI (speech bubbles, approval prompts)

## Non-Goals

- Replacing the terminal-based office plugin (both coexist)
- Mobile or web deployment (Electron desktop only)
- Office layout editor (ship with pre-designed layouts)
- Gamification mechanics (XP, levels, achievements)

---

## App Launch & Project Flow

### First Launch

1. App opens to a **project picker screen** — clean, minimal UI
2. Bottom-left corner shows **account status**: "Not connected" with a link to Settings
3. User must connect their Anthropic account before proceeding

### Project Picker

- **"New Project"** button — prompts for project name and directory location (create new folder or pick empty folder)
- **"Open Project"** card — standard directory browser to select an existing project folder
- **Recent projects** list — shows previously opened projects with name, path, last phase, last opened date
- Selecting/creating a project opens the **office view**

### Entering the Office (New Project)

- The pixel office loads with all 14 characters in idle state (common area, wandering)
- The CEO character walks toward the camera/user area
- A chat message appears from the CEO introducing the team and asking: "What would you like to build?"
- User's response kicks off the /imagine phase automatically

### Returning to an Existing Project

- App reads local project state from `.the-office/config.json` in the project directory
- Resumes at the last phase — characters are positioned in the relevant zone
- Chat history is restored from local storage

---

## Architecture

### Three-Layer System

**1. Electron Main Process** — the orchestrator:
- **SDK Bridge** — wraps `query()` calls, streams events to renderer via IPC
- **Agent Loader** — reads agent definition markdown files (shared with terminal plugin), builds SDK config objects
- **Permission Handler** — implements `canUseTool` callback, routes approval requests to renderer
- **Orchestrator** — phase state machine (IDLE → IMAGINE → WARROOM → BUILD → COMPLETE), spawns sessions, manages transitions
- **Project Manager** — CRUD projects, recent list, state persistence
- **Artifact Store** — reads/writes `docs/office/` files (design docs, plan.md, tasks.yaml)
- **Auth Manager** — OAuth flow, API key storage, credential management

**2. Electron Renderer (React + PixiJS)** — the visual layer:
- **Project Picker** — launch screen with new/open/recent project support
- **Chat Panel** — prompt input, agent response thread, phase indicator
- **Pixel Office (PixiJS)** — animated office canvas with 14 characters
- **Status Overlays** — token usage, cost, time tracking (React)
- **Kanban Whiteboard** — wall-mounted board showing task progress (PixiJS)
- **Settings Panel** — account connection, model preset, permission mode
- **Permission Prompt** — tool approval UI (modal or inline in chat)

**3. Agent SDK** — the AI runtime:
- Single integration point replacing all previous adapters
- Events stream directly from `query()` — no file watching needed
- Permissions handled via `canUseTool` callback

### Data Flow

```
User types in Chat Panel
        │
        ▼ IPC
Electron Main Process
        │
        ├── Agent Loader (reads agent .md files)
        │
        ├── SDK Bridge ──── query() ────► Agent SDK
        │                     │
        │                     ◄──── streaming events
        │
        ├── Orchestrator (phase state, transitions)
        │
        ├── Project Manager (project CRUD, persistence)
        │
        ▼ IPC (events)
Renderer
  ├── ChatStore ──► Chat Panel
  ├── OfficeStore ──► PixiJS Canvas (characters animate)
  └── KanbanStore ──► Whiteboard (tasks update)
```

---

## SDK Integration

### Authentication

The Agent SDK does not expose its own OAuth API. Authentication works through two paths:

- **API Key (primary for v1):** User pastes their `ANTHROPIC_API_KEY` in Settings. The app passes it via the `env` option in `query()`:
  ```typescript
  query({ prompt, options: { env: { ANTHROPIC_API_KEY: storedKey } } })
  ```
  This is the simplest path and works with any Anthropic account (API billing, pay-per-token).

- **CLI auth reuse (stretch goal):** If the user has already run `claude login` on their machine, the SDK may pick up stored OAuth tokens from `~/.claude/`. This would allow Max/Pro subscribers to use their subscription. However, this depends on implementation details of how the SDK resolves credentials, so it requires a spike to verify. For v1, API key is the reliable path.

The Auth Manager stores the API key encrypted in the app's local data directory. The Settings UI shows connection status based on whether a valid key is stored.

### SDK Message to AgentEvent Translation

The SDK's `query()` returns an `AsyncGenerator<SDKMessage>` where `SDKMessage` is a discriminated union of message types. The SDK Bridge (`sdk-bridge.ts`) translates these into the app's `AgentEvent` stream:

| SDK Message Type | Condition | AgentEvent |
|---|---|---|
| `system` (subtype `init`) | Session initialized | `agent:created` — extract `session_id` for tracking |
| `assistant` with `tool_use` content block | Agent starts a tool | `agent:tool:start` — extract `block.name`, `block.id` |
| `assistant` with `text` content block | Agent sends text | `agent:message` — extract `block.text`, route to ChatStore |
| `user` with `tool_use_result` | Tool execution complete | `agent:tool:done` — extract `tool_use_id` from the result |
| `result` | Session turn complete | `session:cost:update` — extract `total_cost_usd`, `usage` |
| `stream_event` (content_block_delta) | Streaming text chunk | `agent:message:delta` — partial text for live chat display (new event type, not in original `AgentEventType`) |
| `system` (subtype `task_started`) | Subagent spawned | `agent:created` — extract subagent name, map to `AgentRole` |
| `system` (subtype `task_progress`) | Subagent working | Forward as tool events for the subagent's character |
| `system` (subtype `task_notification`) | Subagent complete/failed | `agent:closed` for the subagent character |

**Subagent detection:** The SDK provides dedicated task lifecycle messages (`task_started`, `task_progress`, `task_notification`) for subagent tracking. Messages from subagents also carry a `parent_tool_use_id` field, which the SDK Bridge uses to attribute activity to the correct character. When the CEO spawns PM during /imagine, a `task_started` message fires → SDK Bridge maps the subagent name to `AgentRole` → PM character walks to the boardroom.

**Messages intentionally not mapped in v1:**
- `rate_limit_event` → logged, surfaced as error in chat if persistent
- Error messages (`authentication_failed`, `billing_error`) → triggers error handling (see Error Handling section)
- Status messages → logged for debugging

### Agent Definition Loading

The office plugin's agent `.md` files use frontmatter + markdown body:

```markdown
---
name: chief-architect
description: "Systems-thinking Chief Architect who leads the Architecture phase"
---

# Chief Architect

You are the Chief Architect...
```

The Agent Loader (`agent-loader.ts`) transforms these into SDK `AgentDefinition` objects:

```typescript
// agent-loader.ts
function loadAgentDefinition(mdPath: string): [string, AgentDefinition] {
  const raw = fs.readFileSync(mdPath, 'utf-8');
  const { data: frontmatter, content: body } = parseFrontmatter(raw);

  return [frontmatter.name, {
    description: frontmatter.description,
    prompt: body.trim(),
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],  // illustrative — omitting `tools` inherits all from parent
  }];
}

// Usage in SDK Bridge
const agentEntries = agentMdFiles.map(loadAgentDefinition);
const agents = Object.fromEntries(agentEntries);

query({
  prompt: userIdea,
  options: { agents }
})
```

The `agents/` directory at the project root contains symlinks or copies of the plugin's agent files. Both the Electron app and the terminal plugin can evolve their copies independently.

---

## Phase Orchestration

The Electron main process owns phase transitions. It is TypeScript code managing a workflow state machine — not an AI agent.

### Phase State Machine

```
IDLE → IMAGINE → WARROOM → BUILD → COMPLETE
              ↑_________|  (user can redo)
```

### Phase: /imagine

The main process spawns a single `query()` session with the CEO agent definition. The session handles the four sub-phases internally (Discovery → Definition → Validation → Architecture), dispatching subagents for PM, Market Researcher, and Architect as needed.

- **Input:** User's idea from chat
- **Output artifacts:** `01-vision-brief.md`, `02-prd.md`, `03-market-analysis.md`, `04-system-design.md` — written to `docs/office/` in the project directory
- **Character animation:** CEO sits in boardroom. When subagents are dispatched, their characters walk to boardroom and sit at the conference table.
- **Completion:** SDK session ends. Main process detects artifacts exist, updates phase state. CEO asks "Ready to move to the war room?"

### Phase: /warroom

New `query()` session with the Agent Organizer/PM/Team Lead agent definitions. Reads the /imagine artifacts as context.

- **Input:** The four design docs from /imagine (passed as context to the session)
- **Output artifacts:** `plan.md`, `tasks.yaml` — same format as the terminal plugin
- **Character animation:** Organizer, PM, Team Lead move to coordination area. Kanban whiteboard starts populating.
- **Completion:** Session ends. Main process parses `tasks.yaml` to understand phases/tasks. Asks user to confirm build configuration.

### Phase: /build

Multiple parallel `query()` sessions — one per build phase. The main process reads `tasks.yaml`, resolves the dependency graph, and spawns sessions for ready phases.

- **Input per session:** Phase spec + relevant tasks from `tasks.yaml`
- **Parallelism:** Independent phases run as concurrent `query()` calls
- **Character animation:** Engineers walk to desks and start typing/reading based on streaming tool events
- **Permissions:** `canUseTool` callback routes to a UI prompt — the character's speech bubble turns orange, a modal or inline approval appears in chat
- **Completion:** All phases done → main process creates PR via SDK Bash tool or `gh` directly

### Artifact Handoff Between Phases

Each phase writes markdown/YAML files to `docs/office/`. The next phase's session reads those files from disk or receives them injected into the prompt. Files on disk are the contract between phases — same pattern as the terminal plugin.

### Chat-Driven Phase Transitions

- Phase transitions happen conversationally. When /imagine completes, the CEO says "Design is locked. Want to move to the war room?" User confirms in chat.
- A subtle phase indicator in the top bar or sidebar shows progress: `imagine → warroom → build`. Informational, not the primary control.
- Manual override available via a menu for power users to jump to or re-run a phase.

### Phase State Machine — Valid Transitions

```
IDLE ──────► IMAGINE ──────► WARROOM ──────► BUILD ──────► COMPLETE
               ▲                │               │              │
               │                │               │              │
               └────────────────┘               │              │
               (redo from warroom)              │              │
               ▲                                │              │
               └────────────────────────────────┘              │
               (redo from build — restart planning)            │
               ▲                                               │
               └───────────────────────────────────────────────┘
               (start new idea from complete)
```

The state machine allows backward transitions: any phase can return to IMAGINE (restart the design). WARROOM can also return to IMAGINE. These are triggered by the user via the manual override menu, never automatically.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `query()` auth failure | Surface error in chat: "Authentication failed. Check your API key in Settings." Stop phase. |
| `query()` billing error | Surface error in chat: "Billing error — check your Anthropic account." Stop phase. |
| Rate limit during /build | Log warning. The affected session pauses and retries with backoff (SDK handles this internally). Other parallel sessions continue. |
| SDK session crash (non-zero exit) | Mark phase as failed. Surface error in chat with option to retry the phase. Other parallel /build sessions continue. |
| Network disconnection | Surface "Connection lost" in chat. SDK session will fail; user can retry the phase when reconnected. |
| `canUseTool` timeout | If user doesn't respond to permission prompt within 5 minutes, deny the tool call. Agent continues with the denial. |
| App closed during active sessions | All `query()` sessions are aborted via `query.close()` in the `window-all-closed` handler. Phase state is saved as "interrupted" in `.the-office/config.json`. On reopen, user sees "Phase X was interrupted. Restart it?" |
| Parallel /build session fails | Other sessions continue. Failed session is marked in Kanban. User can retry the failed phase after others complete. |

### Persistence & Resume

**What is persisted (survives app close):**
- Project state: current phase, which phases completed (`.the-office/config.json`)
- Artifacts: all `docs/office/` files (design docs, plan.md, tasks.yaml)
- Chat history: stored in `.the-office/chat-history.json` — displayed on reopen for context
- Build progress: `docs/office/build/phase-*/status.yaml`

**What is NOT persisted (lost on app close):**
- Active SDK sessions — `query()` calls are aborted, conversation context is lost
- In-progress tool executions

**User experience on reopen:** The user sees their chat history and completed artifacts. If a phase was interrupted, the app offers to restart it. The agent won't remember the prior conversation, but it will read the artifacts from disk to rebuild context.

---

## Account & Settings

### Account Connection

The Settings panel is accessible from the project picker and from within the office view (gear icon).

- **API Key (v1):** Text field for `ANTHROPIC_API_KEY` entry. Stored encrypted in app's local data directory. This is the primary auth method — works with any Anthropic API account.
- **CLI auth reuse (stretch goal):** If the user has run `claude login`, the SDK may pick up stored OAuth tokens. Requires a spike to verify. Not relied upon for v1.
- **Account display:** Bottom-left corner shows connected account (email or "API Key: sk-...redacted") with a green/red status dot.
- **Disconnect:** Button to clear stored credentials.

### Build Configuration (prompted before /build)

- **Model preset:** default / fast / quality (maps to Claude models for implementer, reviewer, etc.)
- **Retry limit:** default 3
- **Permission mode:**
  - "Ask me" — `canUseTool` routes every tool call to UI
  - "Auto-approve safe tools" — Read, Glob, Grep auto-approved; Write, Edit, Bash prompt
  - "Auto-approve all" — bypass all checks (with warning)

### Project Settings (per-project, `.the-office/config.json`)

- Project name
- Agent definitions path (defaults to bundled, can point to custom directory)
- Build branch naming convention

### App Settings (global, app data directory)

- Connected account credentials (encrypted)
- Default model preset
- Default permission mode
- Window size/position
- Recent projects list

---

## IPC Contract

**This replaces the entire existing OfficeAPI.** The current `shared/types.ts` OfficeAPI (dispatch, createSession, cancelSession, session linking, terminal config, etc.) is removed. The new contract reflects the SDK-driven architecture.

The preload bridge exposes a typed API via `contextBridge.exposeInMainWorld`:

```typescript
// ── Supporting Types ──

interface AuthStatus {
  connected: boolean;
  account?: string;        // email or "sk-...redacted"
  method?: 'api-key' | 'cli-auth';  // api-key for v1, cli-auth is stretch goal
}

interface ProjectInfo {
  name: string;
  path: string;
  lastPhase: Phase | null;
  lastOpened: number;       // timestamp
}

type Phase = 'idle' | 'imagine' | 'warroom' | 'build' | 'complete';

interface ProjectState {
  name: string;
  path: string;
  currentPhase: Phase | null;
  completedPhases: Phase[];
  interrupted: boolean;     // true if app was closed mid-phase
}

interface PhaseInfo {
  phase: Phase;
  status: 'starting' | 'active' | 'completing' | 'completed' | 'failed' | 'interrupted';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  agentRole?: AgentRole;    // which character is speaking
  text: string;
  timestamp: number;
}

interface PermissionRequest {
  requestId: string;
  agentRole: AgentRole;
  toolName: string;
  input: Record<string, unknown>;  // tool input for display
}

interface BuildConfig {
  modelPreset: 'default' | 'fast' | 'quality';
  retryLimit: number;
  permissionMode: 'ask' | 'auto-safe' | 'auto-all';
}

interface SessionStats {
  totalCost: number;
  totalTokens: number;
  sessionTime: number;      // ms since phase started
  activeAgents: number;
}

// ── IPC API ──

interface OfficeAPI {
  // ── Auth ──
  getAuthStatus(): Promise<AuthStatus>;
  connectApiKey(key: string): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  onAuthStatusChange(callback: (status: AuthStatus) => void): () => void;

  // ── Projects ──
  getRecentProjects(): Promise<ProjectInfo[]>;
  openProject(path: string): Promise<{ success: boolean; error?: string }>;
  createProject(name: string, path: string): Promise<{ success: boolean; error?: string }>;
  pickDirectory(): Promise<string | null>;
  getProjectState(): Promise<ProjectState>;

  // ── Phase Control ──
  startImagine(userIdea: string): Promise<void>;
  startWarroom(): Promise<void>;
  startBuild(config: BuildConfig): Promise<void>;
  onPhaseChange(callback: (phase: PhaseInfo) => void): () => void;

  // ── Chat ──
  sendMessage(message: string): Promise<void>;
  onChatMessage(callback: (msg: ChatMessage) => void): () => void;

  // ── Agent Events ──
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;

  // ── Permissions ──
  onPermissionRequest(callback: (req: PermissionRequest) => void): () => void;
  respondPermission(requestId: string, approved: boolean): Promise<void>;

  // ── Kanban ──
  onKanbanUpdate(callback: (state: KanbanState) => void): () => void;

  // ── Stats ──
  onStatsUpdate(callback: (stats: SessionStats) => void): () => void;

  // ── Settings ──
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
}

interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
  windowBounds?: { x: number; y: number; width: number; height: number };
}
```

Events use `ipcRenderer.on()` wrapped in the preload bridge. Commands use `ipcRenderer.invoke()` with corresponding `ipcMain.handle()` handlers. All callback registrations return an unsubscribe function.

The `AgentEvent` and `KanbanState` types are retained from the existing `shared/types.ts` with these changes:
- `AgentEvent.source` narrows from `'sdk' | 'transcript' | 'opencode' | 'claude-process'` to just `'sdk'`
- `AgentEventType` adds `'agent:message:delta'` for streaming text chunks
- All adapter-specific types (`SessionListItem`, `TerminalConfig`, old `AppSettings`) are removed

---

## Office Scene

Five zones in a 40x24 tile grid (16px per tile), as defined in the original spec (2026-03-13):

1. **Boardroom (left)** — /imagine hub. Conference table, CEO + leadership seats, "YOU" seat, presentation screen.
2. **Coordination Area (center-left)** — /warroom hub. Organizer, PM, Team Lead desks.
3. **Engineering Bullpen (right)** — /build hub. 7 engineer desks in two rows.
4. **Kanban Whiteboard (top wall)** — four columns (Queued/Active/Review/Done), tasks as color-coded bars.
5. **Common Area (bottom-right)** — coffee machine, water cooler, couch. Idle agents wander here.

### Phase-Driven Camera

| Phase | Camera Behavior |
|-------|----------------|
| /imagine | Pans to boardroom. Leadership enters and sits at conference table. |
| /warroom | Pulls back to coordination area + whiteboard. Agents move from boardroom to desks. |
| /build | Zooms out to full office view. Engineering bullpen lights up, engineers animate to desks. |
| Manual | User can always pan/zoom freely to any area. |

---

## Character System

14 unique characters with distinct colors (as defined in the original spec):

| Group | Agent | Color |
|-------|-------|-------|
| Leadership | CEO | #3b82f6 |
| Leadership | Product Manager | #14b8a6 |
| Leadership | Market Researcher | #22c55e |
| Leadership | Chief Architect | #f97316 |
| Coordination | Agent Organizer | #a855f7 |
| Coordination | Project Manager | #0ea5e9 |
| Coordination | Team Lead | #f59e0b |
| Engineering | Backend Engineer | #10b981 |
| Engineering | Frontend Engineer | #6366f1 |
| Engineering | Mobile Developer | #8b5cf6 |
| Engineering | UI/UX Expert | #f43f5e |
| Engineering | Data Engineer | #06b6d4 |
| Engineering | DevOps | #ef4444 |
| Engineering | Automation Dev | #ec4899 |

### Animation State Machine

Three states: IDLE, WALK, TYPE/READ. Transitions driven by AgentEvent stream from SDK Bridge:
- Tool start → pathfind to assigned desk → WALK → arrive → TYPE/READ
- Tool end → IDLE
- Idle timer expires → pick random walkable tile → WALK → arrive → IDLE

### Sprite Sheet Format

Per character: 16x32px frames, 7 columns x 3 rows (112x96 PNG). Left-facing frames generated by horizontal flip at runtime.

---

## Overlays & In-Scene UI

- **Speech Bubbles** — white (working), green (done), orange pulsing (needs permission). Show current tool name. Auto-hide after 5s.
- **Agent Labels** — name + role below each character. Dimmed for idle agents.
- **Kanban Whiteboard** — reads from KanbanStore, four columns, color-coded task bars. Data source: the orchestrator's `build.ts` reads `docs/office/tasks.yaml` for task definitions and watches `docs/office/build/phase-*/status.yaml` for live status. It merges these into a `KanbanState` and pushes updates to renderer via `onKanbanUpdate`. During /imagine and /warroom (before tasks.yaml exists), the whiteboard shows an empty state.
- **Presentation Screen** — shows current design document title during /imagine.
- **Floating Stats Overlay** — session time, cost, tokens, phase counter, agent activity heatmap.

---

## Project Structure

```
the-office/
├── electron/
│   ├── main.ts                          # Electron main entry, window creation
│   ├── preload.ts                       # IPC bridge (contextBridge)
│   ├── sdk/
│   │   ├── sdk-bridge.ts               # Wraps query() calls, streams events via IPC
│   │   ├── agent-loader.ts             # Reads agent .md files, builds SDK config
│   │   └── permission-handler.ts       # canUseTool callback → renderer prompts
│   ├── orchestrator/
│   │   ├── phase-machine.ts            # IDLE→IMAGINE→WARROOM→BUILD→COMPLETE state machine
│   │   ├── imagine.ts                  # Spawns /imagine session, monitors artifacts
│   │   ├── warroom.ts                  # Spawns /warroom session, parses tasks.yaml
│   │   └── build.ts                    # Parallel session spawning, dependency graph, merge
│   ├── project/
│   │   ├── project-manager.ts          # CRUD projects, recent list, state persistence
│   │   └── artifact-store.ts           # Read/write docs/office/ artifacts
│   └── auth/
│       └── auth-manager.ts             # OAuth flow, API key storage, credential management
├── src/
│   ├── App.tsx                          # Root layout, routing (picker vs office)
│   ├── stores/
│   │   ├── office.store.ts              # Character states, positions, animations
│   │   ├── chat.store.ts               # Message thread, prompt history
│   │   ├── kanban.store.ts             # Phase/task progress
│   │   └── project.store.ts            # Current project, phase state
│   ├── components/
│   │   ├── ProjectPicker/              # Launch screen, new/open/recent projects
│   │   ├── ChatPanel/                  # Chat thread, input, phase indicator
│   │   ├── TopBar/                     # Account status, cost, tokens
│   │   ├── StatsOverlay/              # Floating stats + agent heatmap
│   │   ├── Settings/                  # Account, model preset, permissions
│   │   └── PermissionPrompt/          # Tool approval UI
│   ├── office/
│   │   ├── OfficeCanvas.tsx            # PixiJS Application wrapper
│   │   ├── scenes/
│   │   │   └── OfficeScene.ts          # Tilemap + zones + characters
│   │   ├── characters/                 # Character.ts, CharacterSprite.ts, agents.config.ts
│   │   ├── furniture/                  # Whiteboard.ts, PresentationScreen.ts
│   │   ├── ui/                         # SpeechBubble.ts, AgentLabel.ts
│   │   ├── engine/                     # pathfinding.ts, camera.ts, renderer.ts
│   │   └── tilemap/                    # TileMap.ts, layouts/
│   └── assets/                         # Sprites, tiles, furniture
├── shared/
│   └── types.ts                        # All shared types (AgentEvent, KanbanState, OfficeAPI, etc.)
├── agents/                             # Shared agent definitions (same .md files as plugin)
│   ├── ceo.md
│   ├── chief-architect.md
│   ├── backend-engineer.md
│   └── ... (14 total)
├── package.json
├── electron.vite.config.ts
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Shell | Electron 33+ | Desktop app, main/renderer split |
| Main process | `@anthropic-ai/claude-agent-sdk` | All AI interactions, streaming |
| Renderer | React 19 + TypeScript | UI components |
| Renderer | PixiJS 8 + `@pixi/react` | Pixel office canvas, animation |
| State | Zustand | OfficeStore, ChatStore, KanbanStore, ProjectStore |
| Build | Vite + electron-vite | Fast dev builds, HMR |
| Package | electron-builder | macOS/Windows/Linux distribution |

### Dependency Changes from Original Spec

**Added:**
- `@anthropic-ai/claude-agent-sdk` — all AI interactions
- `gray-matter` (or similar) — parsing agent .md frontmatter

**Removed:**
- `chokidar` — no longer watching JSONL files
- `better-sqlite3` / `sql.js` — no longer polling OpenCode SQLite

**Retained:**
- `pixi.js` — pixel office canvas
- `react`, `react-dom` — UI components
- `zustand` — state management
- `electron`, `electron-vite` — app shell and build

---

## Decisions

1. **Agent SDK over CLI adapters** — the SDK provides direct programmatic control, streaming events, and permission handling. Eliminates the need for file watching, subprocess management, and three separate adapter implementations.
2. **Phase-per-session orchestration** — each phase gets its own `query()` session with clean context boundaries. /build spawns parallel sessions. The Electron main process manages transitions, not an AI agent.
3. **Coexistence with terminal plugin** — both share agent definition .md files but operate independently. Terminal plugin is unaffected.
4. **API key auth for v1** — the app manages its own API key in its data directory. CLI auth reuse (for Max/Pro subscribers) is a stretch goal pending a spike to verify SDK credential resolution.
5. **Artifacts on disk as phase contract** — `docs/office/` files bridge phases. Same pattern as the terminal plugin, enabling interop if needed.
6. **Chat-driven transitions with subtle indicators** — phases advance through conversation. A phase indicator is visible but not the primary control. Manual override available for power users.
7. **No session persistence in v1** — closing the app mid-phase loses the active SDK session. Project state (completed phases, artifacts) is persisted. Session resume can be added later.
