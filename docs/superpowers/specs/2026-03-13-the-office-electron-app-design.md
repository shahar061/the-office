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
- **Sub-agents** — appear as smaller linked characters near their parent
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

| Group | Agent | Color | Identifier |
|-------|-------|-------|-----------|
| Leadership | CEO | Blue #3b82f6 | Suit + tie |
| Leadership | Product Manager | Cyan #06b6d4 | Clipboard |
| Leadership | Market Researcher | Green #22c55e | Magnifier |
| Leadership | Chief Architect | Orange #f97316 | Blueprint |
| Coordination | Agent Organizer | Purple #a855f7 | Gears |
| Coordination | Project Manager | Cyan #06b6d4 | Gantt chart |
| Coordination | Team Lead | Orange #f97316 | Target |
| Engineering | Backend Engineer | Green #22c55e | Terminal |
| Engineering | Frontend Engineer | Blue #3b82f6 | Palette |
| Engineering | Mobile Developer | Purple #a855f7 | Phone |
| Engineering | UI/UX Expert | Orange #f97316 | Pen tool |
| Engineering | Data Engineer | Cyan #06b6d4 | Database |
| Engineering | DevOps | Red #ef4444 | Wrench |
| Engineering | Automation Dev | Red #ef4444 | Robot |

### Sprite Sheet Format

Per character: 16×32px frames, 7 columns × 4 rows (112×128 PNG per character)

| Row | Direction | Frames |
|-----|-----------|--------|
| 0 | Down | walk1, walk2, walk3, type1, type2, read1, read2 |
| 1 | Up | (same layout) |
| 2 | Right | (same layout) |
| 3 | Left | (flipped from Right at runtime) |

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

- Reads from KanbanStore (sourced from tasks.yaml / build state)
- Four columns: Queued / Active / Review / Done
- Each task rendered as a tiny color-coded bar
- Phase name and completion % at bottom
- Updates in real-time

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
│   │   │   ├── OfficeScene.ts           # Main scene: tilemap + furniture + characters
│   │   │   └── BoardroomScene.ts        # Boardroom focus view
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
│       ├── characters/                  # 14 sprite sheets (112×128 PNG each)
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

## Open Questions for Implementation

1. **Sprite art sourcing** — commission custom 16×32 character sprites or start with modified CC0 assets?
2. **Office plugin integration** — should the Electron app replace the office plugin's Flask dashboard, or coexist?
3. **OpenCode deprecation** — OpenCode is archived; should we target Crush (charmbracelet/crush) from the start instead?
