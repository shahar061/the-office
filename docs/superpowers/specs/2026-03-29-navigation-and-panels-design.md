# Navigation & Panels — Design Spec

**Date:** 2026-03-29
**Scope:** Icon rail navigation, phase-aware toolbox, live log viewer, about page

---

## Overview

Four features that together give The Office a proper navigation system and new content panels. The core change is a persistent **icon rail** on the far left that replaces the current ad-hoc navigation (top-bar ⊞ button, expand-to-tab-bar flow) with a consistent, always-visible navigation surface.

## 1. Icon Rail

### What It Is

A 40px vertical bar pinned to the far left edge of the main area (below top bar and phase tracker). Always visible in both collapsed and expanded modes.

### Layout (Collapsed Mode)

```
[Icon Rail 40px] [Panel 320px] [Chevron 20px] [Canvas]
```

When "Office" is selected, the panel and chevron hide:

```
[Icon Rail 40px] [Canvas]
```

### Layout (Expanded Mode)

```
[Icon Rail 40px] [Chevron 20px] [Full-width panel content]
```

The existing floating TabBar in expanded mode is removed — the icon rail serves as navigation in both modes. In expanded mode:
- **Chat/Agents/Logs/About:** panel takes full width (minus rail + chevron), canvas hidden
- **Office:** same as collapsed "Office" — canvas takes full width, no panel. Clicking chevron is a no-op (nothing to expand)

### Icons (Top to Bottom)

| Icon | Tab ID   | Label (tooltip) | Notes |
|------|----------|-----------------|-------|
| 💬   | `chat`   | Chat            | Default on launch |
| 🖥️   | `office` | Office          | Hides panel, canvas goes full-width |
| 👥   | `agents` | Agents          | Activity badge when agents are active |
| —    | —        | (divider)       | 1px line separator |
| 📋   | `logs`   | Logs            | Counter badge for new entries |
| ℹ️   | `about`  | About           | — |

### Visual Treatment

- **Rail background:** `#0d0d1a` (bgDark) — slightly darker than chat panel
- **Rail border:** `1px solid #2a2a4a` on right edge
- **Icon hit targets:** 32x32px centered in 40px width
- **Inactive icon:** `opacity: 0.45`
- **Hover:** `opacity: 0.75`, subtle background highlight
- **Active icon:** `opacity: 1`, `2px solid #3b82f6` left border, faint blue background tint `rgba(59,130,246,0.1)`
- **Tooltips:** On hover, small tooltip to the right of the icon showing the label name

### Activity Badges

- **Agents icon:** When any agent is active (`agentActivity.isActive` in office store), show a 6px pulsing dot in amber (`#f59e0b`) at top-right corner of the icon
- **Logs icon:** Show a small count badge when new log entries arrive while the user is on a different tab. Clear when the user switches to logs.

### Changes to Existing Navigation

- Remove the `⊞` button from the top bar (redundant)
- Remove the floating `TabBar` component in expanded mode (rail replaces it)
- The expand/collapse chevron remains — it only toggles panel width, not navigation

### Store Changes

Extend `AppTab` type in `ui.store.ts`:

```typescript
export type AppTab = 'chat' | 'office' | 'agents' | 'logs' | 'about';
```

## 2. Phase-Aware Toolbox

### What It Is

The existing `ArtifactToolbox` component (top-right of canvas) becomes phase-aware. It shows different documents depending on the current phase.

### Phase Content

**Imagine phase** (unchanged from current behavior):

| Label | Agent Role | Indicator |
|-------|-----------|-----------|
| Vision Brief | ceo | Colored dot |
| PRD | product-manager | Colored dot |
| Market Analysis | market-researcher | Colored dot |
| System Design | chief-architect | Colored dot |

**War Room phase** (new):

| Label | Icon | Source |
|-------|------|--------|
| Milestones | 🎯 | milestones.md |
| Plan | 🗺️ | plan.md |
| Tasks | ✅ | tasks.yaml (parsed to readable list) |

**Build phase:** No toolbox shown. The build phase focuses on the canvas and agent activity — no floating panel clutter.

### Visual Differences

- Imagine: agent-colored dots (existing)
- War Room: tactical emoji icons instead of dots — reinforces the war room metaphor
- Header text: "Artifacts" for imagine, "War Room" for war room
- Same row layout, same click-to-open overlay behavior

### Interaction

Clicking a war room document opens it in the existing `PlanOverlay` component (shared document viewer). The war table click on the canvas continues to open `plan.md` as it does today.

### Implementation Approach

Refactor `ArtifactToolbox` to accept phase-specific document lists rather than hardcoding imagine artifacts. The toolbox reads the current phase from `useProjectStore` and renders the appropriate list. Availability state comes from:
- Imagine: `useArtifactStore` (existing)
- War Room: `useWarTableStore` (extend to track document availability)

## 3. Live Log Viewer

### What It Is

A full session transcript displayed as a live-scrolling stream in the 320px panel (accessed via the 📋 icon in the rail).

### Log Entry Types

| Type | Format | Example |
|------|--------|---------|
| Tool call (done) | `[HH:MM:SS] AGENT ✓ ToolName target` | `[14:32:08] CEO ✓ Read package.json` |
| Tool call (running) | `[HH:MM:SS] AGENT ⟳ ToolName target` | `[14:32:12] CEO ⟳ Write src/nav.tsx` |
| Agent message | `[HH:MM:SS] AGENT → message` + truncated preview on next line | `[14:32:15] CEO → message` / `"Here's the vision brief..."` |
| User message | `[HH:MM:SS] You → message` + truncated preview | `[14:32:05] You → message` / `"A task management app..."` |
| Agent lifecycle | `[HH:MM:SS] AGENT — started/closed` | `[14:32:20] PM — agent started` |
| Phase transition | `[HH:MM:SS] ═══ Phase: War Room ═══` | Phase separator line |

### Visual Treatment

- Monospace font, terminal-style aesthetic
- Timestamps in `#475569` (dim)
- Agent names in their `AGENT_COLORS`
- Tool status: `✓` in green (`#22c55e`), `⟳` in yellow (`#eab308`)
- Message previews in dim italic, indented, truncated to ~80 chars
- User messages highlighted in blue (`#3b82f6`)
- Session header at top: `SESSION LOG — YYYY-MM-DD HH:MM`
- Footer bar: green dot + "Live — auto-scrolling" + entry count

### Scrolling Behavior

- Auto-scrolls to bottom as new entries arrive
- If the user scrolls up, auto-scroll pauses (they're reading history)
- Auto-scroll resumes when the user scrolls back to the bottom
- Detection: if `scrollTop + clientHeight >= scrollHeight - threshold` (e.g., 50px), consider at bottom

### Data Architecture

**In-memory buffer (renderer):**
- New Zustand store: `log.store.ts`
- Stores an array of `LogEntry` objects
- Fed by agent events from the office store's `handleAgentEvent` + chat messages from `chat.store`
- Keeps all entries for the session (no truncation — sessions are finite)

```typescript
interface LogEntry {
  id: string;
  timestamp: number;
  type: 'tool-start' | 'tool-done' | 'agent-message' | 'user-message' | 'agent-lifecycle' | 'phase-transition';
  agentRole?: AgentRole;
  toolName?: string;
  target?: string;
  text?: string;  // message content for message types
}
```

**Unread tracking:**
- The log store tracks `unreadCount` — incremented when entries arrive while the logs tab is not active
- Reset to 0 when the user switches to the logs tab
- The icon rail reads this for the badge display

### File Persistence

- Log entries are serialized to a plain text `.log` file
- File path: `<project-dir>/session-YYYY-MM-DD.log`
- Write events (flush buffer to disk):
  - Phase transition (imagine → war room → build → complete)
  - Project exit (back button to project picker)
  - App close (window close / quit)
- Append-only: each flush appends new entries since last flush
- Format: human-readable plain text matching the in-app display format

```
[14:32:01] CEO → message: "Let me understand what you're building..."
[14:32:05] You → message: "A task management app with..."
[14:32:08] CEO ✓ Read package.json
[14:32:09] CEO ✓ Grep "export default"
[14:32:12] CEO ✓ Write src/vision-brief.md
[14:32:15] CEO → message: "Here's the vision brief for your review..."
[14:32:20] PM — agent started
═══ Phase: War Room ═══
```

### IPC

- New IPC channel: `office:flush-logs` — main process triggers flush (or renderer initiates on navigation/close)
- The main process handles file writing since renderer doesn't have direct fs access
- On flush: renderer sends accumulated log text to main, main appends to `.log` file

## 4. About Page

### What It Is

A scrollable panel in the 320px area (accessed via ℹ️ icon) with app identity, interactive phase guide, and credits.

### Sections

**App Identity (header):**
- App name: "The Office" with 🏢 emoji
- Tagline: "Watch your AI team build software"
- Version number (read from `package.json` via IPC or hardcoded)
- Compact: ~80px tall

**Phase Guide (main content):**

Three expandable cards, one per phase. Each card has:
- **Collapsed state:** Phase number, name (color-coded), one-liner description, agent role dots on the right
- **Expanded state:** Full paragraph description of what happens, list of artifacts/outputs produced (as small tags), agent roles involved with their colors

Phase colors:
- Imagine: `#f97316` (orange)
- War Room: `#0ea5e9` (sky blue)
- Build: `#22c55e` (green)

Card styling:
- Collapsed: `background: #1a1a2e`, `border: 1px solid #2a2a4a`
- Expanded: same background, border color matches phase color at 30% opacity
- Toggle indicator: `▶` collapsed, `▼` expanded
- Default: all collapsed (user explores on their own)

**Credits (footer):**
- "Powered by Claude Code"
- Link to GitHub repo
- Compact, centered, dim text

### No External Dependencies

The about page is fully static — no API calls, no data fetching. Content is hardcoded in the component. Version can be read from `package.json` at build time via Vite's `define` config or an IPC call.

## Architecture Summary

### New Files

| File | Purpose |
|------|---------|
| `src/renderer/src/components/IconRail/IconRail.tsx` | Icon rail navigation component |
| `src/renderer/src/components/LogViewer/LogViewer.tsx` | Live log viewer panel |
| `src/renderer/src/components/AboutPanel/AboutPanel.tsx` | About page panel |
| `src/renderer/src/stores/log.store.ts` | Log entries buffer + unread tracking |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/src/stores/ui.store.ts` | Extend `AppTab` with `'logs' \| 'about'` |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Add icon rail, content switcher for panel, remove ⊞ button, adjust canvas offset |
| `src/renderer/src/components/OfficeView/ArtifactToolbox.tsx` | Phase-aware: show different documents per phase |
| `src/renderer/src/stores/war-table.store.ts` | Track document availability for war room toolbox items |
| `src/renderer/src/components/TabBar/TabBar.tsx` | Remove (replaced by icon rail) or simplify |
| `electron/main.ts` or `electron/ipc/` | New IPC handler for log file writing |

### Data Flow

```
Agent Events (IPC) → office.store → log.store (buffer)
                                   → LogViewer (renders)
                                   → Icon Rail badge (unread count)

Phase change → log.store flush → IPC → main process → .log file

Chat Messages → chat.store → log.store (also buffered)
```

### No Map Changes

No Tiled map modifications. No new interactive objects on the canvas. The war table click behavior remains unchanged. All new features are UI-panel-level changes.
