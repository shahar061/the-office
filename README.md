# The Office

A pixel-art Electron app that visualizes AI agent activity as animated characters in a virtual office. Think GameDev Tycoon meets AI coding assistants.

![Electron](https://img.shields.io/badge/Electron-41-blue) ![React](https://img.shields.io/badge/React-19-blue) ![PixiJS](https://img.shields.io/badge/PixiJS-8-orange) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)

## What Is This?

The Office turns your AI coding sessions into a live pixel-art scene. It monitors [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [OpenCode](https://github.com/sst/opencode) sessions and maps their activity to 15 animated characters — each representing a specialized agent role (CEO, Architect, Frontend Engineer, etc.).

When an agent reads a file, their character walks to a desk and starts reading. When they write code, they type. When they're idle, they wander around the office.

The app extends the [office](https://github.com/shahar061/office) Claude Code plugin — a virtual startup team with three workflow phases:
- **Imagine** — discovery and product definition (boardroom)
- **War Room** — architecture and planning (open work area)
- **Build** — implementation with autonomous subagents (full office)

## Features

- **Live agent visualization** — 15 pixel-art characters animate based on real AI tool activity
- **Multi-source monitoring** — watches Claude Code transcripts and OpenCode SQLite databases simultaneously
- **Chat interface** — send prompts directly to Claude Code or OpenCode from within the app
- **Phase-aware camera** — auto-focuses on the relevant office zone based on workflow phase
- **Session browser** — lobby screen lists all active/recent sessions across tools
- **Cost & token tracking** — real-time usage stats in the top bar
- **Configurable terminals** — launch sessions in iTerm2, Warp, Kitty, Alacritty, Ghostty, and more

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Renderer (React + PixiJS)                          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Chat Panel│  │ Pixel Office │  │  Top Bar /    │  │
│  │(prompts +│  │ (Tiled maps, │  │  Stats        │  │
│  │ messages)│  │  characters) │  │               │  │
│  └──────────┘  └──────────────┘  └──────────────┘  │
│            Zustand Stores (app, office, chat)       │
├─────────────── IPC Bridge (preload.ts) ─────────────┤
│  Main Process                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │           Session Manager                     │   │
│  │  ┌────────────────┐  ┌───────────────────┐   │   │
│  │  │ Claude Code     │  │ OpenCode          │   │   │
│  │  │ Transcript      │  │ SQLite Adapter    │   │   │
│  │  │ Adapter         │  │                   │   │   │
│  │  └───────┬────────┘  └────────┬──────────┘   │   │
│  └──────────┼────────────────────┼──────────────┘   │
├─────────────┼────────────────────┼──────────────────┤
│  External   │                    │                   │
│  ~/.claude/projects/*.jsonl    .opencode/opencode.db │
└─────────────────────────────────────────────────────┘
```

### Adapter Pattern

Each AI tool integration implements the `ToolAdapter` interface:

| Adapter | Source | Method |
|---------|--------|--------|
| Claude Code Transcript | `~/.claude/projects/<dir>/*.jsonl` | Chokidar file watcher |
| OpenCode | `.opencode/opencode.db` | SQLite polling (1s interval) |
| Claude Code Process | `claude` CLI subprocess | JSON stream parsing |

All adapters emit unified `AgentEvent` objects, making it trivial to add support for new tools.

### Agent Roles

15 characters, each with a distinct sprite and color:

| Group | Roles |
|-------|-------|
| Leadership | CEO, Product Manager, Market Researcher, Chief Architect |
| Coordination | Agent Organizer, Project Manager, Team Lead |
| Engineering | Frontend, Backend, Mobile, DevOps, Data Engineer, UI/UX Expert, Automation Developer, Freelancer |

## Project Structure

```
the-office/
├── electron/                    # Main process
│   ├── main.ts                 # App bootstrap + IPC handlers
│   ├── preload.ts              # Secure context bridge (window.office)
│   ├── session-manager.ts      # Adapter orchestration + event hub
│   ├── settings.ts             # Terminal config persistence
│   └── adapters/               # Tool integrations
│       ├── types.ts            # ToolAdapter interface
│       ├── claude-transcript.adapter.ts
│       ├── opencode.adapter.ts
│       └── claude-code-process.ts
├── src/renderer/src/            # Renderer (React + PixiJS)
│   ├── screens/                # Lobby + Office screens
│   ├── office/                 # PixiJS scene, characters, engine
│   │   ├── characters/         # Character entity, sprite, config
│   │   └── engine/             # Tiled map renderer, camera, pathfinding
│   ├── components/             # ChatPanel, SessionPanel, TopBar, etc.
│   └── stores/                 # Zustand state (app, office, chat, session)
├── shared/                      # Types shared between main + renderer
│   └── types.ts                # AgentRole, AgentEvent, IPC channels
├── scripts/
│   └── generate-maps.ts        # Tiled map generation helper
└── tests/                       # Vitest test suite
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install & Run

```bash
npm install
npm run dev
```

This starts the Electron app in development mode with hot reload.

### Build

```bash
npm run build
```

### Test

```bash
npm run test          # Single run
npm run test:watch    # Watch mode
```

## How It Works

1. **Lobby** — browse all detected sessions from Claude Code and OpenCode. Create a new session or click an existing one.
2. **Office** — the selected session's activity drives the pixel-art scene. Characters walk to desks, type, read, or idle based on real tool invocations.
3. **Chat** — send prompts and view agent responses. Phase tabs filter by workflow stage.

### Agent Animation Mapping

| Tool Activity | Character Animation |
|---------------|---------------------|
| Read, Grep, Glob, WebFetch, WebSearch, Agent | Walk to desk, **read** |
| Write, Edit, Bash, and other tools | Walk to desk, **type** |
| Waiting for input | **Idle**, wander around office |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop framework | Electron 41 |
| UI framework | React 19 |
| 2D rendering | PixiJS 8 (WebGL/WebGPU) |
| State management | Zustand 5 |
| Build tooling | Vite 6 + electron-vite 5 |
| Database access | better-sqlite3 / sql.js |
| File watching | Chokidar 5 |
| Testing | Vitest 1.6 |
| Map format | Tiled JSON (.tmj) |
| Sprite format | LimeZu pixel-art character sheets |

## License

ISC
