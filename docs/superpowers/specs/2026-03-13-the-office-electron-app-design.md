# The Office — Pixel-Art Agent Visualization Electron App

## Overview

A standalone Electron app that gamifies and visualizes AI agent activity as animated pixel-art characters in a virtual office. Inspired by GameDev Tycoon and pixel-agents, it serves as both a prompt-writing workspace and a live visualization layer for Claude Code and OpenCode sessions.

The app extends the existing [office](https://github.com/shahar061/office) Claude Code plugin — a 14-agent virtual startup team with /imagine, /warroom, and /build phases — by giving each agent a unique pixel-art character that animates in real-time based on their activity.

## Goals

- Provide a visual, engaging interface for watching AI agents work
- Offer a chat-based prompt input that dispatches work to Claude Code/OpenCode
- Monitor external terminal sessions (Claude Code, OpenCode) alongside internal ones
- Surface rich information: task progress, token usage, cost, agent state
- Support the three-phase office workflow: /imagine → /warroom → /build

## Non-Goals

- Office layout editor (ship with pre-designed layouts)
- Gamification mechanics (XP, levels, achievements) — the pixel art itself is the reward
- Mobile or web deployment (Electron desktop only for v1)

---

## Architecture

### Three-Layer System

**1. Electron Main Process** — owns all external I/O:
- **Agent SDK Bridge** — embeds `@anthropic-ai/claude-agent-sdk` directly. Spawns agents, streams events, handles permission prompts.
- **Transcript Watcher** — monitors `~/.claude/projects/<encoded-cwd>/*.jsonl` for external Claude Code terminal sessions.
- **OpenCode Bridge** — spawns `opencode -p` subprocesses, polls SQLite at `.opencode/` for session state.
- **Session Manager** — unifies all sources into a single `AgentEvent` stream sent to the renderer via IPC.

**2. Electron Renderer (React + PixiJS)** — the visual layer:
- **Chat Panel** — prompt input + agent response thread
- **Pixel Office (PixiJS)** — animated office canvas with 14 characters
- **Status Overlays** — token usage, cost, time tracking (React)
- **In-Scene Kanban** — whiteboard rendered as office furniture (PixiJS)

**3. External Sources** — JSONL transcripts, OpenCode SQLite, Claude API

### Adapter Pattern

Each integration source implements the `ToolAdapter` interface and emits unified `AgentEvent` objects:

```typescript
interface ToolAdapter {
  start(config: AdapterConfig): void;
  stop(): void;
  dispatch?(prompt: string, agentRole: AgentRole): Promise<void>;
  on(event: 'agentEvent', handler: (event: AgentEvent) => void): void;
}
```

Three adapters:
- `ClaudeCodeSDKAdapter` — wraps the Agent SDK (dispatch + monitoring)
- `ClaudeCodeTranscriptAdapter` — wraps the JSONL file watcher (monitoring only)
- `OpenCodeAdapter` — wraps subprocess + SQLite polling (dispatch + monitoring)

Adding support for new tools (Crush, Copilot) means implementing one new adapter file.

Adapters extend Node's `EventEmitter` for the `on()` method.

### Adapter Error Handling

Each adapter handles failures at the integration boundary:

| Scenario | Behavior |
|----------|----------|
| JSONL file deleted mid-watch | Emit `agent:closed` for affected agent, log warning, continue watching directory for new files |
| Claude SDK connection drop | Emit `agent:closed`, surface error in chat panel ("Connection lost"), auto-retry with exponential backoff (1s, 2s, 4s, max 30s) |
| OpenCode SQLite locked | Skip poll cycle, retry on next interval (1s). After 10 consecutive failures, emit `agent:closed` and surface error |
| Invalid JSONL line | Skip line, log warning, continue processing. Do not crash the watcher. |
| Adapter startup failure | Mark adapter as disconnected in top bar, surface error in chat panel, allow other adapters to function independently |

General principle: adapters fail independently. A broken OpenCode connection does not affect Claude Code monitoring.

### IPC Bridge Contract

The `preload.ts` exposes a typed API via `contextBridge.exposeInMainWorld`:

```typescript
// Exposed as window.office
interface OfficeAPI {
  // Events (main → renderer, push-based)
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void;

  // Commands (renderer → main, request-response)
  dispatch(prompt: string, agentRole?: AgentRole): Promise<{ sessionId: string }>;
  getActiveSessions(): Promise<SessionInfo[]>;
  approvePermission(agentId: string, toolId: string): Promise<void>;
  denyPermission(agentId: string, toolId: string): Promise<void>;

  // Kanban data (renderer → main, request-response)
  getKanbanState(): Promise<KanbanState>;
  onKanbanUpdate(callback: (state: KanbanState) => void): () => void;
}
```

Events use `ipcRenderer.on()` wrapped in the preload bridge. Commands use `ipcRenderer.invoke()` with corresponding `ipcMain.handle()` handlers. All callback registrations return an unsubscribe function.

### Unified AgentEvent

```typescript
type AgentEventType =
  | 'agent:created'
  | 'agent:tool:start'
  | 'agent:tool:done'
  | 'agent:tool:clear'
  | 'agent:waiting'
  | 'agent:permission'
  | 'agent:message'
  | 'agent:closed'
  | 'session:cost:update';

interface AgentEvent {
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
```

### Agent-to-Character Mapping

- **SDK sessions** — tagged with `agentRole` at spawn time (CEO, Backend Engineer, etc.)
- **External transcripts** — parsed from system prompt/agent definition in first JSONL lines
- **OpenCode sessions** — mapped to a configurable default role or generic character
- **Sub-agents** — deferred to v2. For v1, sub-agent activity is attributed to the parent agent (the parent character animates for sub-agent tool calls). Sub-agent events are identifiable by `isSidechain: true` in JSONL transcripts and by the SDK's subagent lifecycle events.
- **Unknown agents** — fall back to a generic "freelancer" character

---

## UI Layout

### Window Structure

```
┌─────────────────────────────────────────────────────────┐
│ Top Bar: [🟢 Claude Code] [⚪ OpenCode] [$0.42] [12.4k] │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  Chat Panel  │          Pixel Office (PixiJS)           │
│   (320px)    │                                          │
│              │   [Characters] [Desks] [Whiteboard]      │
│  Phase: ▶    │                                          │
│  imagine → ─ │                         ┌──────────────┐ │
│  warroom     │                         │ Stats Overlay │ │
│  build       │                         └──────────────┘ │
│              │                                          │
│  [Messages]  │                                          │
│              │                                          │
│  [Input bar] │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### Top Bar
- Connection indicators: Claude Code (green when connected), OpenCode (gray when disconnected)
- Running cost and token count for the current session

### Chat Panel (Left, 320px fixed)
- **Phase indicator** — shows progress through imagine → warroom → build
- **Message thread** — each message color-coded by agent role (CEO = blue, PM = cyan, Architect = orange, etc.)
- **Prompt input** — text input with command quick-access chips (/imagine, /warroom, /build)

### Pixel Office (Center, fills remaining)
- PixiJS canvas with all 14 agents
- Phase-driven camera focus (see Office Scene section)
- In-scene furniture including Kanban whiteboard

### Floating Stats Overlay (Bottom-right, React)
- Session time, cost, tokens, phase counter
- Agent activity heatmap: 14 colored dots grouped by team, pulsing = active, dimmed = idle

---

## Office Scene

### Layout: 40×24 Tiles (16px per tile = 640×384 base resolution, integer-zoomed)

Five zones:

**1. Boardroom (left, glass-walled)** — the /imagine hub
- Conference table with seats for CEO, PM, Market Researcher, Architect
- A "YOU" seat representing the user
- Presentation screen on wall showing current design document title
- Glass wall divider with door connecting to main office

**2. Coordination Area (center-left)** — the /warroom hub
- Organizer, Project Manager, Team Lead desks
- Positioned near boardroom door for natural agent transitions

**3. Engineering Bullpen (right)** — the /build hub
- 7 engineer desks in two rows with monitors
- Backend, Frontend, Mobile, UI/UX (row 1)
- Data, DevOps, Automation (row 2)

**4. Kanban Whiteboard (top wall, main office)**
- Wall-mounted pixel-art board
- Four columns: Queued / Active / Review / Done
- Tasks as tiny color-coded bars
- Phase name and completion % at bottom
- Updates in real-time from KanbanStore

**5. Common Area (bottom-right)**
- Coffee machine, water cooler, plant, couch
- Where idle agents wander to socialize
- Door on bottom wall (sub-agents "enter" through it)

### Phase-Driven Camera

| Phase | Camera Behavior |
|-------|----------------|
| /imagine | Pans to boardroom. Leadership enters and sits at conference table. |
| /warroom | Pulls back to coordination area + whiteboard. Agents move from boardroom to desks. |
| /build | Zooms out to full office view. Engineering bullpen lights up, engineers animate to desks. |
| Manual | User can always pan/zoom freely to any area. |

### Tile & Furniture

- **Grid**: 40×24 tiles at 16×16px each
- **Tile types**: Wall, Floor (2-3 variants), Void
- **Furniture**: Desk (2×2), Chair (1×1), Monitor (1×1), Plant (1×1), Coffee machine (1×2), Water cooler (1×1), Whiteboard (4×2 wall-mounted), Bookshelf (1×2), Conference table (4×3), Presentation screen (3×2 wall-mounted), Couch (2×1)
- **Assets**: Start with free CC0 16×16 tilesets, commission custom art later

---

## Character System

### 14 Unique Characters

Each agent has a unique color to ensure visual distinguishability in both the pixel office and the chat panel.

| Group | Agent | Color | Hex | Identifier |
|-------|-------|-------|-----|-----------|
| Leadership | CEO | Blue | #3b82f6 | Suit + tie |
| Leadership | Product Manager | Teal | #14b8a6 | Clipboard |
| Leadership | Market Researcher | Green | #22c55e | Magnifier |
| Leadership | Chief Architect | Orange | #f97316 | Blueprint |
| Coordination | Agent Organizer | Purple | #a855f7 | Gears |
| Coordination | Project Manager | Sky | #0ea5e9 | Gantt chart |
| Coordination | Team Lead | Amber | #f59e0b | Target |
| Engineering | Backend Engineer | Emerald | #10b981 | Terminal |
| Engineering | Frontend Engineer | Indigo | #6366f1 | Palette |
| Engineering | Mobile Developer | Violet | #8b5cf6 | Phone |
| Engineering | UI/UX Expert | Rose | #f43f5e | Pen tool |
| Engineering | Data Engineer | Cyan | #06b6d4 | Database |
| Engineering | DevOps | Red | #ef4444 | Wrench |
| Engineering | Automation Dev | Pink | #ec4899 | Robot |

### Sprite Sheet Format

Per character: 16×32px frames, 7 columns × 3 rows (112×96 PNG per character). Left-facing frames are generated by horizontally flipping the Right row at runtime — no dedicated row in the sheet.

| Row | Direction | Frames |
|-----|-----------|--------|
| 0 | Down | walk1, walk2, walk3, type1, type2, read1, read2 |
| 1 | Up | (same layout) |
| 2 | Right | (same layout) |
| — | Left | (flipped from Right at runtime, not stored in sheet) |

### Animation State Machine

Three states:

**IDLE** — standing at current position. After a randomized timer, picks a random walkable tile and transitions to WALK (wandering). Idle agents rendered at 40% opacity when not in their active phase.

**WALK** — follows BFS-computed path at constant speed (~48px/sec). 4-frame walk cycle (walk1 → walk2 → walk3 → walk2) at 0.15s per frame. Direction updates based on movement vector.

**TYPE/READ** — sitting at assigned desk. Tool type determines animation:
- Write, Edit, Bash → typing animation (type1 ↔ type2 at 0.3s)
- Read, Grep, Glob, WebFetch, WebSearch → reading animation (read1 ↔ read2 at 0.3s)

**Transitions:**
- Tool start (from any state) → pathfind to assigned desk → WALK → arrive → TYPE/READ
- Tool end → IDLE (with randomized rest timer)
- Idle timer expires → pick random walkable tile → WALK → arrive → IDLE

---

## Overlays & In-Scene UI

### Speech Bubbles (PixiJS, per-character)

| Bubble Color | State | Example |
|-------------|-------|---------|
| White | Actively working | "Writing system design..." |
| Green | Done, awaiting input | "Done! Awaiting input" |
| Orange (pulsing) | Needs permission | "Needs permission" |

- Show current tool name beneath agent label
- Auto-hide after 5s of no change, reappear on new activity

### Agent Labels (PixiJS, always visible)

Name + role below each character. Dimmed for idle agents.

### Kanban Whiteboard (PixiJS, wall furniture)

- Reads from KanbanStore
- Four columns: Queued / Active / Review / Done
- Each task rendered as a tiny color-coded bar
- Phase name and completion % at bottom
- Updates in real-time

**KanbanStore data source:** The main process watches the project's `docs/office/` directory (the office plugin's output location) for `tasks.yaml` and `build/phase-*/status.yaml` files. It parses and merges these into a `KanbanState` object:

```typescript
interface KanbanState {
  projectName: string;
  currentPhase: string;
  completionPercent: number;
  tasks: KanbanTask[];
}

interface KanbanTask {
  id: string;
  description: string;
  status: 'queued' | 'active' | 'review' | 'done' | 'failed';
  assignedAgent: AgentRole;
  phaseId: string;
}
```

The `tasks.yaml` provides the task definitions (id, description, assigned agent, phase). Per-phase `status.yaml` files provide live status updates. The main process merges these and pushes updates to the renderer via `onKanbanUpdate`. If no `tasks.yaml` exists (e.g., during /imagine phase), the whiteboard shows an empty state.

### Presentation Screen (PixiJS, boardroom wall)

During /imagine, shows the title of the current design document being worked on. Updates as phases progress through Vision Brief → PRD → Market Analysis → System Design.

### Floating Stats Overlay (React, bottom-right)

- Row 1: Session time | Cost | Tokens | Phase counter
- Row 2: Agent activity heatmap — 14 colored dots grouped by team (Leadership | Coordination | Engineering). Pulsing = active, dimmed = idle. Hover shows agent name + state.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Shell | Electron 33+ | Desktop app, main/renderer process split |
| Main process | `@anthropic-ai/claude-agent-sdk` | Dispatch prompts to Claude Code, streaming |
| Main process | `chokidar` | File watching for JSONL transcripts |
| Main process | `better-sqlite3` | Read OpenCode's SQLite sessions |
| Renderer | React 19 + TypeScript | UI components (chat, overlays, stats) |
| Renderer | PixiJS 8 + `@pixi/react` | Pixel office canvas, sprites, animation |
| State | Zustand | OfficeStore, ChatStore, KanbanStore |
| Build | Vite + electron-vite | Fast dev builds, HMR |
| Package | electron-builder | macOS/Windows/Linux distribution |

---

## Project Structure

```
the-office/
├── electron/
│   ├── main.ts                          # Electron main entry
│   ├── preload.ts                       # IPC bridge (contextBridge)
│   ├── adapters/
│   │   ├── types.ts                     # ToolAdapter interface, AgentEvent type
│   │   ├── claude-sdk.adapter.ts        # Agent SDK integration
│   │   ├── claude-transcript.adapter.ts # JSONL watcher
│   │   └── opencode.adapter.ts          # Subprocess + SQLite
│   └── session-manager.ts               # Unifies adapters, emits events via IPC
├── src/
│   ├── App.tsx                          # Root layout
│   ├── stores/
│   │   ├── office.store.ts              # Character states, positions, animations
│   │   ├── chat.store.ts                # Message thread, prompt history
│   │   └── kanban.store.ts              # Phase/task progress
│   ├── components/
│   │   ├── ChatPanel/                   # Chat thread, input, command chips
│   │   ├── TopBar/                      # Connection status, cost, tokens
│   │   └── StatsOverlay/               # Floating stats + agent heatmap
│   ├── office/
│   │   ├── OfficeCanvas.tsx             # PixiJS Application wrapper
│   │   ├── scenes/
│   │   │   └── OfficeScene.ts           # Single scene: tilemap + all zones + characters
│   │   ├── characters/
│   │   │   ├── Character.ts             # State machine (IDLE/WALK/TYPE/READ)
│   │   │   ├── CharacterSprite.ts       # AnimatedSprite with direction handling
│   │   │   └── agents.config.ts         # 14 agent definitions
│   │   ├── furniture/
│   │   │   ├── Whiteboard.ts            # Kanban board
│   │   │   ├── PresentationScreen.ts    # Boardroom screen
│   │   │   └── furniture.config.ts      # Furniture definitions
│   │   ├── ui/
│   │   │   ├── SpeechBubble.ts          # Bubble sprites
│   │   │   └── AgentLabel.ts            # Name/role labels
│   │   ├── engine/
│   │   │   ├── pathfinding.ts           # BFS on tile grid
│   │   │   ├── camera.ts               # Pan/zoom, phase-driven focus
│   │   │   └── renderer.ts             # Z-sort, layer ordering
│   │   └── tilemap/
│   │       ├── TileMap.ts               # Grid management, walkability
│   │       └── layouts/                 # Pre-designed office layout JSONs
│   └── assets/
│       ├── characters/                  # 14 sprite sheets (112×96 PNG each)
│       ├── tiles/                       # Floor + wall tilesets (16×16)
│       └── furniture/                   # Desk, chair, plant, whiteboard sprites
├── package.json
├── electron-vite.config.ts
├── tsconfig.json
└── docs/
    └── superpowers/specs/
```

---

## Data Flow Summary

```
[Claude API]  [JSONL Files]  [OpenCode SQLite]
     │              │               │
     ▼              ▼               ▼
[SDK Adapter] [Transcript Adapter] [OpenCode Adapter]
     │              │               │
     └──────────────┼───────────────┘
                    ▼
           [Session Manager]
                    │
                    ▼ IPC (contextBridge)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  [OfficeStore] [ChatStore] [KanbanStore]
        │           │           │
        ▼           ▼           ▼
  [PixiJS Canvas] [Chat UI]  [Whiteboard]
```

---

## Decisions

1. **Sprite art sourcing** — start with free CC0 16×16 tilesets and modified character sprites. Commission custom pixel art for characters once the game loop and animations are proven. The sprite sheet format and asset pipeline are designed to be drop-in replaceable.
2. **Office plugin integration** — the Electron app coexists with the existing office Claude Code plugin for v1. The plugin continues to work in the terminal; the Electron app is an independent visual layer. Longer term, the app may replace the Flask dashboard.
3. **OpenCode support** — keep the `OpenCodeAdapter` for backward compatibility, but design the `ToolAdapter` interface to easily support Crush (charmbracelet/crush) as the active successor. The adapter is a single file — swapping is low cost.
4. **Session persistence** — no persistence in v1. Sessions are ephemeral; closing the app loses session history. Can be added later via local SQLite.
5. **Window sizing** — minimum window size 1024×640. Chat panel is fixed at 320px. PixiJS canvas fills remaining space and re-renders at the new resolution on resize.
