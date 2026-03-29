# UI/UX Improvements — Resize Fix, Expandable Chat, Chat Bubbles

## Overview

Three targeted improvements to The Office Electron app's UI/UX:

1. **Canvas auto-resize** — fix the PixiJS canvas not adjusting when the container resizes without a window resize event (e.g., DevTools open/close, panel expand/collapse)
2. **Expandable chat panel** — allow the user to toggle the chat panel to full-width with a tab bar to switch between Chat and Office views
3. **Chat bubbles** — wrap messages in tinted containers with colored left-border accents per sender type

---

## 1. Canvas Auto-Resize Fix

### Problem

The current implementation in `OfficeCanvas.tsx` uses `window.addEventListener('resize')` to detect size changes. This only fires when the browser/Electron window itself resizes. When the container changes size for other reasons (DevTools panel opening/closing, chat panel expanding/collapsing), the canvas stays at its previous dimensions.

### Solution

Replace the window resize listener with a `ResizeObserver` on the canvas container element.

**Current flow:**
```
window resize event → scene.onResize(container.clientWidth, container.clientHeight)
```

**New flow:**
```
ResizeObserver on container div
  → entry.contentRect provides width/height
  → scene.onResize(width, height)
  → camera.setViewSize() recalculates bounds
  → smooth LERP interpolation to new dimensions
```

### Affected Files

- `src/renderer/src/office/OfficeCanvas.tsx` — replace `window.addEventListener('resize')` with `ResizeObserver`

### Details

- Create `ResizeObserver` in the `useEffect` that initializes the PixiJS app
- Observe the container ref element
- On each entry, call `scene.onResize(width, height)` — but **guard against zero dimensions** (which occur when the container is hidden via `display: none` during tab switching). Skip the `onResize` call when width or height is zero.
- Disconnect the observer in the cleanup function
- Remove the existing `window.addEventListener('resize')` listener
- Remove the `resizeTo: container` PixiJS option. Instead, manually call `app.renderer.resize(width, height)` inside the same `ResizeObserver` callback, followed by `scene.onResize(width, height)`. This ensures the canvas element and the scene/camera update atomically in the same callback, avoiding frame-level timing mismatches.

This fix also enables the expandable chat feature — when the chat panel expands or collapses, the canvas container resizes and the observer fires automatically.

### PixiJS Ticker When Canvas Is Hidden

When the Office canvas is hidden in expanded mode (Chat tab active), the PixiJS ticker continues running. This is acceptable for v1 — the ticker is lightweight (camera LERP + character animation updates) and the cost is negligible. Pausing/resuming the ticker can be added as a follow-up optimization if needed.

---

## 2. Expandable Chat Panel

### Layout Modes

**Default mode** (side-by-side, current behavior):

```
┌──────────────────────────────────────────────┐
│ Top Bar                                      │
├──────────┬─┬─────────────────────────────────┤
│ Chat     │›│     Pixel Office Canvas         │
│ (320px)  │ │                                 │
│          │ │                                 │
└──────────┴─┴─────────────────────────────────┘
```

- Chat panel fixed at 320px, canvas fills remaining space
- Small `›` chevron button on the right edge of the chat panel
- No tab bar visible

**Expanded mode** (full-width with tab switching):

```
┌──────────────────────────────────────────────┐
│ Top Bar                                      │
│        ┌─────────────────────┐               │
│        │  Chat  │  Office    │               │
│        └─────────────────────┘               │
├─┬────────────────────────────────────────────┤
│‹│                                            │
│ │  Full-width active tab content             │
│ │  (Chat or Office canvas)                   │
│ │                                            │
└─┴────────────────────────────────────────────┘
```

- Floating tab bar centered at top of the main content area with padding
- Pill-shaped container with two segments: "Chat" and "Office"
- Active tab has a brighter/highlighted background
- `‹` chevron on the left edge to collapse back to default mode
- Only the active tab's content is rendered; the other is hidden (`display: none`)

### Behavior

- Clicking `›` expands the chat. The default active tab when expanding is **Chat**.
- Clicking `‹` collapses back to side-by-side. The active tab selection is irrelevant in default mode.
- The tab bar only appears in expanded mode.
- Tab switching is instant (no transition animation for content swap).
- The chevron button is always at the right edge of the chat panel in default mode, and at the left edge of the content area in expanded mode.

### State

New Zustand store: `ui.store.ts`

```typescript
interface UIStore {
  isExpanded: boolean;
  activeTab: 'chat' | 'office';
  toggleExpanded: () => void;
  setActiveTab: (tab: 'chat' | 'office') => void;
}
```

- `isExpanded` defaults to `false`
- `activeTab` defaults to `'chat'`
- `toggleExpanded()` flips `isExpanded`. When expanding, sets `activeTab` to `'chat'`.

### Affected Files

- `src/renderer/src/stores/ui.store.ts` — **new file**, UI layout state
- `src/renderer/src/components/OfficeView/OfficeView.tsx` — layout logic, chevron button, conditional rendering
- `src/renderer/src/components/TabBar/TabBar.tsx` — **new file**, floating tab bar component

### Tab Bar Styling

- Position: absolute, centered horizontally, top of main content area with 12px top padding
- Container: pill-shaped (border-radius 8px), background `#1a1a2e`, border `1px solid #333`
- Segments: each tab is a button, padding 8px 20px, font-size 12px, uppercase
- Active segment: background `#2a2a4a`, color `#e5e5e5`
- Inactive segment: background transparent, color `#666`
- z-index above content but below modals

### Chevron Button Styling

- Width: 20px, full height of the main content area
- Background: `#1a1a2e`, border: `1px solid #333`
- Chevron icon: `›` or `‹`, color `#666`, hover: `#e5e5e5`
- Hover: background `#2a2a4a`
- Positioned at the right edge of chat panel (default mode) or left edge of content area (expanded mode)

---

## 3. Chat Bubbles

### Design

Terminal-style tinted containers — keep the current left-aligned message layout but wrap each message in a subtle rounded container with a colored left-border accent.

### Message Types

**User messages:**
- Background: `#1a2a3a` (blue-tinted dark)
- Left border: 3px solid `#3b82f6` (blue)
- Sender label: "You" in `#3b82f6`

**Agent messages:**
- Background: `#1a1a2e` (purple-tinted dark)
- Left border: 3px solid agent's color from `AGENT_COLORS`
- Sender label: agent name in their assigned color (already exists)

**System messages** (phase changes, connection status, errors):
- Background: `#1a1a1a` (neutral dark)
- Left border: 3px solid `#666` (gray)
- Sender label: "System" in `#999`

### Shared Bubble Styling

- Border radius: 8px
- Padding: 10px 12px
- Margin between bubbles: 8px
- Message text: `#cbd5e1` (current color, unchanged)
- Font size: 12px (current, unchanged)
- Timestamp: 10px, color `#666`, aligned bottom-right of bubble

### Message Type Detection

The `ChatMessage` type in `shared/types.ts` currently defines `role: 'user' | 'agent'`. This must be extended to support system messages:

```typescript
// shared/types.ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentRole?: AgentRole;
  text: string;
  timestamp: number;
}
```

Detection logic:
- `role: 'user'` → user bubble style
- `role: 'agent'` with `agentRole` → agent bubble style with agent-specific color
- `role: 'system'` → system bubble style

### Timestamp Format

Timestamps are formatted as short time (e.g., "2:35 PM") using `Date.toLocaleTimeString()` with `{ hour: 'numeric', minute: '2-digit' }`. Always visible (not hover-only).

### Chat Input in Expanded Mode

When the chat is in expanded full-width mode, the input area stretches to full width but the input row itself is capped at `max-width: 720px` and centered. This prevents the input from becoming uncomfortably wide on large screens while still feeling expansive.

### Existing ChatPanel/ Components

The codebase contains a `src/renderer/src/components/ChatPanel/` directory with `ChatPanel.tsx`, `MessageBubble.tsx`, etc. These are legacy components that are **not currently rendered** — `OfficeView.tsx` has its own inline chat implementation. The legacy `ChatPanel/` components should be **deleted** to avoid confusion. All chat rendering lives in `OfficeView.tsx`.

### Affected Files

- `src/renderer/src/components/OfficeView/OfficeView.tsx` — update message rendering with bubble styles
- `shared/types.ts` — add `'system'` to `ChatMessage.role` union type
- `src/renderer/src/components/ChatPanel/` — **delete** (legacy, unused)

---

## Summary of New/Modified Files

| File | Action | Purpose |
|------|--------|---------|
| `src/renderer/src/office/OfficeCanvas.tsx` | Modify | Replace window resize listener with ResizeObserver, remove `resizeTo` |
| `src/renderer/src/stores/ui.store.ts` | Create | Expanded/tab state management |
| `src/renderer/src/components/TabBar/TabBar.tsx` | Create | Floating tab bar component |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Modify | Layout logic, chevron, chat bubbles |
| `shared/types.ts` | Modify | Add `'system'` to `ChatMessage.role` union |
| `src/renderer/src/components/ChatPanel/` | Delete | Legacy unused components |
