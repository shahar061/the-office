# Canvas Tool Bubble — Design Spec

## Overview

Add a floating tool bubble above each agent's sprite on the canvas map that shows what tool the agent is currently using and what file/target it's operating on. The bubble is a dark semi-transparent rounded pill with an icon + filename, using the linger-with-timeout pattern for smooth transitions.

## Requirements

- Show a floating bubble above the agent sprite when a tool is in use
- Content: tool icon + target filename/command (e.g. `✏ plan.md`)
- Modern semi-transparent pill style (not pixel art)
- Linger 2s after tool:done before fading — seamless update if next tool starts during linger
- All active agents get bubbles simultaneously (including parallel TL clones)
- Reuse existing event stream and store data — no new IPC or backend changes

## ToolBubble Component

New PixiJS class: `src/renderer/src/office/characters/ToolBubble.ts`

### Visual Specs

- **Background**: `Graphics` rounded rect, fill `0x000000` alpha `0.75`, corner radius 6px
- **Text**: `Text` object, white (`#e0e0e0`), monospace, font-size 7px
- **Content format**: `{icon} {target}` — e.g. `✏ plan.md`, `▶ npm test`
- **Padding**: 4px horizontal, 2px vertical
- **Max width**: 100px — text truncated with ellipsis if longer
- **Position**: centered above the sprite, ~4px gap above the 32px character height. Since the sprite anchor is `(0.5, 1)`, the bubble's y position is `-(32 + 4 + bubbleHeight)` relative to the sprite container origin.
- **Auto-sizes** to text content width (up to max)

### Tool Icon Map

| Tool | Icon |
|------|------|
| Write | ✏ |
| Edit | ✏ |
| Read | 👁 |
| Bash | ▶ |
| Grep | 🔍 |
| Glob | 🔍 |
| Agent | 🤖 |
| other | ⚙ |

### Lifecycle (Linger with Timeout)

```
tool:start → show(icon, target)
  - If hidden: fade in (opacity 0→1, 150ms)
  - If already visible: swap text content, reset linger timer (no fade)

tool:done → startLinger()
  - Start 2s countdown
  - If new tool:start arrives during countdown: cancel, update content, reset timer
  - If countdown expires: fade out (opacity 1→0, 300ms), then hide

agent:closed / phase end → immediate hide (no linger)
```

### API

```typescript
class ToolBubble {
  readonly container: Container;

  constructor();
  show(icon: string, target: string): void;   // fade in or update content
  startLinger(): void;                         // begin 2s countdown to fade out
  hide(): void;                                // immediate hide (no fade)
  update(dt: number): void;                    // drive fade animations
  destroy(): void;
}
```

Internal state machine: `hidden → fading-in → visible → lingering → fading-out → hidden`

## Data Flow

### Store: Add `toolTarget` to CharacterInfo

In `office.store.ts`, extend `CharacterInfo`:

```typescript
export interface CharacterInfo {
  role: AgentRole;
  state: CharacterState;
  toolName?: string;
  toolTarget?: string;   // NEW — extracted target for bubble display
  lastActive: number;
}
```

Populate on `agent:tool:start`:

```typescript
chars.set(role, {
  role,
  state: charState,
  toolName: event.toolName,
  toolTarget: extractToolTarget(event),   // already imported
  lastActive: event.timestamp,
});
```

Clear on `agent:tool:done`:

```typescript
chars.set(role, { ...existing, state: 'idle', toolName: undefined, toolTarget: undefined, lastActive: event.timestamp });
```

### Scene Sync: Drive Bubble from Store

In `useSceneSync.ts`, extend the character state diff to also check `toolTarget`:

```typescript
if (prevInfo && prevInfo.state === info.state && prevInfo.toolName === info.toolName && prevInfo.toolTarget === info.toolTarget) {
  continue;
}
```

When state changes to `typing` or `reading` with a `toolName`:

```typescript
case 'typing':
  character.setWorking('type');
  if (info.toolName && info.toolTarget) {
    character.showToolBubble(info.toolName, info.toolTarget);
  }
  break;
case 'reading':
  character.setWorking('read');
  if (info.toolName && info.toolTarget) {
    character.showToolBubble(info.toolName, info.toolTarget);
  }
  break;
```

When state changes to `idle`:

```typescript
case 'idle':
  if (prevInfo && prevInfo.state !== 'idle') {
    character.setIdle();
    character.hideToolBubble();  // starts linger, not immediate
  }
  break;
```

## Character Integration

### New Methods on Character

```typescript
showToolBubble(toolName: string, target: string): void {
  const icon = TOOL_ICONS[toolName] ?? '⚙';
  this.toolBubble.show(icon, target);
}

hideToolBubble(): void {
  this.toolBubble.startLinger();
}
```

### Constructor Changes

- Create `ToolBubble` instance
- Add `toolBubble.container` as child of `sprite.container`

### Destroy

- `Character.destroy()` also calls `toolBubble.destroy()`

### Update Loop

- `Character.update(dt)` also calls `toolBubble.update(dt)` to drive fade animations

### Clone Support

Clones are `Character` instances — they get a `ToolBubble` automatically. No special handling needed. During parallel TL work, each clone's bubble updates independently.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/office/characters/ToolBubble.ts` | **New** — PixiJS component: dark pill with icon + text, fade in/out, linger timer |
| `src/renderer/src/office/characters/Character.ts` | Create `ToolBubble` in constructor, add `showToolBubble()` / `hideToolBubble()`, call `toolBubble.update(dt)` |
| `src/renderer/src/stores/office.store.ts` | Add `toolTarget` to `CharacterInfo`, populate from `extractToolTarget()` on `tool:start`, clear on `tool:done` |
| `src/renderer/src/office/useSceneSync.ts` | On typing/reading with toolName: call `showToolBubble()`. On idle: call `hideToolBubble()`. Add `toolTarget` to diff check. |

## Edge Cases

- **Rapid tool calls**: Content swaps instantly, linger timer resets. No flicker.
- **Long filenames**: Truncated at 100px with ellipsis via PixiJS Text wordWrap or manual truncation.
- **Agent walks while bubble visible**: Bubble is a child of the sprite container, so it follows automatically.
- **Clone cleanup**: `destroyClone()` calls `character.destroy()` which destroys the bubble.
- **Phase end / agent closed**: `character.setIdle()` triggers `hideToolBubble()` → linger → fade. If character is hidden (fade out), bubble fades with it since it's a child container.
- **No toolName on event**: If `toolName` is missing, bubble is not shown — only the sprite animation plays.
- **Multiple agents**: Each character has its own independent `ToolBubble` instance. No shared state.
