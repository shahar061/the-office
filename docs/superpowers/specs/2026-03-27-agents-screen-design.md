# Agents Screen Design

A new screen for viewing agent definitions, organized as a grid or org chart, with character click-to-view from the Office canvas.

---

## Data Layer

### New IPC Channel

Add `GET_AGENT_DEFINITIONS` to `IPC_CHANNELS` in `shared/types.ts`. The backend handler calls the existing `loadAllAgents(agentsDir)` from `electron/sdk/agent-loader.ts` and returns the result to the renderer.

### New Type

In `shared/types.ts`:

```typescript
interface AgentDefinition {
  name: string;          // agent ID, e.g. "ceo"
  description: string;   // from YAML frontmatter
  prompt: string;        // full markdown body (agent instructions)
  tools: string[];       // from frontmatter allowedTools
}
```

### New OfficeAPI Method

Add `getAgentDefinitions(): Promise<Record<string, AgentDefinition>>` to the `OfficeAPI` interface and implement in `preload.ts`.

### New Zustand Store: `agents.store.ts`

Holds the merged agent data:

- Loads agent definitions via `window.office.getAgentDefinitions()` on first access
- Merges with static `AGENT_CONFIGS` from `agents.config.ts` (sprite variant, display name, group, idle zone)
- Merges with `AGENT_COLORS` from `shared/types.ts`
- Produces a unified `AgentInfo` per agent combining all metadata
- Produces a unified `AgentInfo` type:
  ```typescript
  interface AgentInfo {
    role: AgentRole;
    displayName: string;
    description: string;
    prompt: string;           // full markdown body
    tools: string[];
    color: string;            // from AGENT_COLORS
    group: 'leadership' | 'coordination' | 'engineering';
    spriteVariant: string;    // adam, alex, amelia, or bob
    idleZone: string;
    spriteSheetUrl: string;   // resolved import URL for the sprite sheet image
  }
  ```
- State: `agents: AgentInfo[]`, `selectedAgent: AgentRole | null`, `loaded: boolean`
- Methods: `loadAgents()`, `selectAgent(role)`, `clearSelection()`

### UI Store Extension

`activeTab` type changes from `'chat' | 'office'` to `'chat' | 'office' | 'agents'`. Existing `setActiveTab()` works unchanged.

### Files Changed

- `shared/types.ts` — new IPC channel, `AgentDefinition` type, `OfficeAPI` extension
- `electron/main.ts` — new IPC handler for `GET_AGENT_DEFINITIONS`
- `electron/preload.ts` — expose `getAgentDefinitions()`
- `src/renderer/src/stores/agents.store.ts` — new store (create)
- `src/renderer/src/stores/ui.store.ts` — extend `activeTab` type

---

## Agents Screen Component

### `AgentsScreen.tsx`

New top-level component rendered when `activeTab === 'agents'`. Lives in `src/renderer/src/components/AgentsScreen/`.

**Layout:**
- View toggle at top (Grid | Org Chart) — small pill-style toggle buttons
- Below: either the grid or org chart view
- AgentDetailPanel overlays from the right when an agent is selected

### Files

- `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx` — main container, view toggle, detail panel integration
- `src/renderer/src/components/AgentsScreen/AgentGrid.tsx` — grid view
- `src/renderer/src/components/AgentsScreen/AgentOrgChart.tsx` — org chart view
- `src/renderer/src/components/AgentsScreen/AgentDetailPanel.tsx` — slide-in detail panel
- `src/renderer/src/components/AgentsScreen/AgentCard.tsx` — reusable card component (used in grid and org chart)

---

## Grid View

### `AgentGrid.tsx`

Three sections with group headers: **Leadership**, **Coordination**, **Engineering**.

Each section contains agent cards in a responsive grid (3-4 columns depending on width).

### Agent Card (compact)

- Agent color accent (left border)
- Sprite preview — a single static frame from the character's sprite sheet, rendered as an `<img>` with CSS `object-fit` and `object-position` to crop the first frame from the sheet (each frame is 16x32px). The sprite sheet URL is available via `AgentInfo.spriteSheetUrl`. Apply `image-rendering: pixelated` for crisp pixel art scaling.
- Agent display name (bold)
- Short description (one line, truncated with ellipsis)
- Role group badge (small, dimmed text)
- Click → sets `selectedAgent` in agents store, opens AgentDetailPanel

### Styling

Follows existing dark theme: `#0f0f1a` background, `#1a1a2e` card surfaces, `#333` borders, role colors from `AGENT_COLORS`.

---

## Org Chart View

### `AgentOrgChart.tsx`

Static tree layout showing agent hierarchy across 3 tiers.

**Tier 1 — Leadership:**
- CEO at the top
- PM, Market Researcher, Chief Architect below

**Tier 2 — Coordination:**
- Agent Organizer, Project Manager, Team Lead

**Tier 3 — Engineering:**
- Backend Engineer, Frontend Engineer, Mobile Developer, UI/UX Expert, Data Engineer, DevOps, Automation Developer, Freelancer

**Each node** is a mini agent card: sprite frame, name, color accent. Click → opens AgentDetailPanel (same as grid).

**Connecting lines** between tiers drawn with CSS borders/pseudo-elements or simple inline SVG. Static positions, no drag or zoom.

**Phase workflow annotations:** subtle labels on connecting lines between leadership agents showing handoff flow: "Vision Brief →", "PRD →", "Market Analysis →", "System Design →".

---

## Agent Detail Panel

### `AgentDetailPanel.tsx`

Slides in from the right when `selectedAgent` is set. Overlays on top of the agents screen content.

**Width:** ~400px, right-aligned.

**Backdrop:** semi-transparent dark overlay (`rgba(0,0,0,0.4)`) on the rest of the screen. Click backdrop or press Escape to close.

**Layout (top to bottom):**

1. **Header**
   - Sprite preview (larger frame, ~48px)
   - Display name (bold, large)
   - Color-coded role badge
   - Group label (Leadership / Coordination / Engineering)

2. **Metadata section**
   - Description text (from frontmatter)
   - Tools list — pill badges for each allowed tool
   - Idle zone — where agent hangs out in the office
   - Sprite variant — which character sheet (Adam/Alex/Amelia/Bob), future home for sprite selector

3. **Full prompt section**
   - Collapsed by default
   - "View full prompt" toggle button
   - Expands to show the full markdown body rendered via the existing `MarkdownContent` component
   - Scrollable within the panel

4. **Close button** (X) in the top-right corner

---

## Canvas Character Popup

When a visible character sprite is clicked in the Office canvas:

1. A small popup appears anchored near the character (positioned above, or below if near top edge)
2. Popup contents:
   - Agent display name (color-coded)
   - Current status text (idle, walking, typing, reading)
   - "View details →" clickable text
3. Clicking "View details" dispatches a DOM event that:
   - Sets `selectedAgent` in agents store
   - Sets `activeTab` to `'agents'`
   - If in compact mode, expands to show the agents tab
4. Clicking elsewhere or pressing Escape dismisses the popup
5. Only one popup at a time (clicking another character replaces the previous)

### Character Interactivity

Characters are currently not interactive. This adds:
- `eventMode: 'static'` and `cursor: 'pointer'` on visible character sprites
- `pointertap` handler that dispatches a `character-click` custom DOM event (similar pattern to `artifact-click`)

### Popup Implementation

A PixiJS Container with:
- Dark background graphics (`#1a1a2e`, rounded rect)
- Color-coded border (agent's color)
- Text elements for name, status
- A "View details →" text with separate hit area that dispatches the navigation event

### Files Changed

- `src/renderer/src/office/characters/Character.ts` — add click interactivity to visible characters
- `src/renderer/src/office/OfficeScene.ts` — manage character popup container, handle character-click events
- `src/renderer/src/components/OfficeView/OfficeView.tsx` — listen for `character-click` events, navigate to agents tab

---

## Navigation: TabBar & TopBar

### TabBar Update

Add `'agents'` as a third tab: `CHAT | OFFICE | AGENTS`.

Same styling pattern, same `setActiveTab()` call. Visible in expanded mode.

### TopBar Update (Compact Mode Access)

Add a small icon/button in the TopBar (right side, near the auth status dot) that switches to expanded mode with the agents tab active. This ensures the agents screen is reachable from compact mode without relying solely on the canvas character popup.

### OfficeView Integration

`OfficeView.tsx` renders `AgentsScreen` when `activeTab === 'agents'` in the expanded content area, alongside the existing chat and office tabs.

### Files Changed

- `src/renderer/src/components/TabBar/TabBar.tsx` — add agents tab
- `src/renderer/src/components/OfficeView/OfficeView.tsx` — render AgentsScreen in expanded mode, add TopBar agents button, handle character-click navigation
