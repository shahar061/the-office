# Canvas Tool Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating tool bubble above each agent sprite on the canvas map showing what tool/file the agent is working on.

**Architecture:** New `ToolBubble` PixiJS component owned by each `Character`, driven by existing store state with one new field (`toolTarget`). Scene sync bridges store changes to bubble show/hide calls.

**Tech Stack:** PixiJS (Graphics, Text, Container), Zustand store, React hook (useSceneSync)

---

## File Structure

| File | Role |
|------|------|
| `src/renderer/src/office/characters/ToolBubble.ts` | **Create** — PixiJS component: dark pill with icon + text, fade animations, linger timer |
| `src/renderer/src/office/characters/Character.ts` | **Modify** — Own a ToolBubble, expose `showToolBubble()` / `hideToolBubble()` |
| `src/renderer/src/stores/office.store.ts` | **Modify** — Add `toolTarget` field to `CharacterInfo` |
| `src/renderer/src/office/useSceneSync.ts` | **Modify** — Drive bubble from character state changes |

---

### Task 1: Create ToolBubble Component

**Files:**
- Create: `src/renderer/src/office/characters/ToolBubble.ts`

- [ ] **Step 1: Create `ToolBubble.ts` with the full component**

```typescript
import { Container, Graphics, Text } from 'pixi.js';

const TOOL_ICONS: Record<string, string> = {
  Write: '✏',
  Edit: '✏',
  Read: '👁',
  Bash: '▶',
  Grep: '🔍',
  Glob: '🔍',
  Agent: '🤖',
};

const DEFAULT_ICON = '⚙';

const PADDING_X = 4;
const PADDING_Y = 2;
const CORNER_RADIUS = 6;
const MAX_WIDTH = 100;
const BG_COLOR = 0x000000;
const BG_ALPHA = 0.75;
const TEXT_COLOR = '#e0e0e0';
const FONT_SIZE = 7;
const OFFSET_Y = -36; // 32px sprite height + 4px gap, relative to anchor(0.5, 1)
const FADE_IN_DURATION = 0.15;
const FADE_OUT_DURATION = 0.3;
const LINGER_DURATION = 2.0;

type BubbleState = 'hidden' | 'fading-in' | 'visible' | 'lingering' | 'fading-out';

export function toolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] ?? DEFAULT_ICON;
}

export class ToolBubble {
  readonly container: Container;
  private bg: Graphics;
  private label: Text;
  private state: BubbleState = 'hidden';
  private fadeElapsed = 0;
  private lingerElapsed = 0;

  constructor() {
    this.container = new Container();
    this.container.alpha = 0;
    this.container.visible = false;

    this.bg = new Graphics();
    this.label = new Text({
      text: '',
      style: {
        fontSize: FONT_SIZE,
        fill: TEXT_COLOR,
        fontFamily: 'monospace',
      },
    });
    this.label.x = PADDING_X;
    this.label.y = PADDING_Y;

    this.container.addChild(this.bg, this.label);
  }

  show(icon: string, target: string): void {
    const displayText = `${icon} ${target}`;
    this.label.text = displayText;

    // Truncate if too wide
    if (this.label.width > MAX_WIDTH - PADDING_X * 2) {
      let truncated = displayText;
      while (truncated.length > 3 && this.label.width > MAX_WIDTH - PADDING_X * 2) {
        truncated = truncated.slice(0, -2) + '…';
        this.label.text = truncated;
      }
    }

    // Redraw background to fit text
    const bgW = Math.min(this.label.width + PADDING_X * 2, MAX_WIDTH);
    const bgH = this.label.height + PADDING_Y * 2;
    this.bg.clear();
    this.bg.roundRect(0, 0, bgW, bgH, CORNER_RADIUS);
    this.bg.fill({ color: BG_COLOR, alpha: BG_ALPHA });

    // Center above sprite
    this.container.x = -bgW / 2;
    this.container.y = OFFSET_Y - bgH;

    if (this.state === 'hidden' || this.state === 'fading-out') {
      // Start fade in
      this.state = 'fading-in';
      this.fadeElapsed = 0;
      this.container.visible = true;
    } else {
      // Already visible or lingering — just update content, stay visible
      this.state = 'visible';
      this.container.alpha = 1;
    }

    this.lingerElapsed = 0;
  }

  startLinger(): void {
    if (this.state === 'hidden') return;
    this.state = 'lingering';
    this.lingerElapsed = 0;
  }

  hide(): void {
    this.state = 'hidden';
    this.container.alpha = 0;
    this.container.visible = false;
  }

  update(dt: number): void {
    switch (this.state) {
      case 'fading-in': {
        this.fadeElapsed += dt;
        const t = Math.min(this.fadeElapsed / FADE_IN_DURATION, 1);
        this.container.alpha = t;
        if (t >= 1) this.state = 'visible';
        break;
      }
      case 'lingering': {
        this.lingerElapsed += dt;
        if (this.lingerElapsed >= LINGER_DURATION) {
          this.state = 'fading-out';
          this.fadeElapsed = 0;
        }
        break;
      }
      case 'fading-out': {
        this.fadeElapsed += dt;
        const t = Math.min(this.fadeElapsed / FADE_OUT_DURATION, 1);
        this.container.alpha = 1 - t;
        if (t >= 1) this.hide();
        break;
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src/renderer && npx tsc --noEmit`
Expected: No errors related to ToolBubble.ts

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/characters/ToolBubble.ts
git commit -m "feat: add ToolBubble PixiJS component for canvas activity indicator"
```

---

### Task 2: Integrate ToolBubble into Character

**Files:**
- Modify: `src/renderer/src/office/characters/Character.ts:1-255`

- [ ] **Step 1: Add import and ToolBubble instance**

Add import at top of file (after existing imports):

```typescript
import { ToolBubble, toolIcon } from './ToolBubble';
```

Add field to `Character` class (after `private hideTimer` on line 48):

```typescript
private toolBubble: ToolBubble;
```

- [ ] **Step 2: Create ToolBubble in constructor**

At the end of the constructor (after line 66 `this.sprite.setPosition(this.px, this.py);`), add:

```typescript
    this.toolBubble = new ToolBubble();
    this.sprite.container.addChild(this.toolBubble.container);
```

- [ ] **Step 3: Add showToolBubble and hideToolBubble methods**

Add after the `enableClick()` method (after line 131):

```typescript
  showToolBubble(toolName: string, target: string): void {
    this.toolBubble.show(toolIcon(toolName), target);
  }

  hideToolBubble(): void {
    this.toolBubble.startLinger();
  }
```

- [ ] **Step 4: Drive bubble animation in update loop**

In the `update(dt)` method (line 154), add after the fade animation block and before the visibility check. Insert after line 169 (`}`), before line 171 (`if (!this.isVisible) return;`):

```typescript
    this.toolBubble.update(dt);
```

- [ ] **Step 5: Clean up bubble on destroy**

In the `destroy()` method (line 251), add before `this.sprite.destroy()`:

```typescript
    this.toolBubble.destroy();
```

- [ ] **Step 6: Verify it compiles**

Run: `cd src/renderer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/office/characters/Character.ts
git commit -m "feat: integrate ToolBubble into Character class"
```

---

### Task 3: Add toolTarget to Store

**Files:**
- Modify: `src/renderer/src/stores/office.store.ts:1-95`

- [ ] **Step 1: Add `toolTarget` to `CharacterInfo` interface**

On line 10 (after `toolName?: string;`), add:

```typescript
  toolTarget?: string;
```

- [ ] **Step 2: Populate `toolTarget` on `tool:start`**

On line 66, the existing `chars.set` call is:

```typescript
      chars.set(role, { role, state: charState, toolName: event.toolName, lastActive: event.timestamp });
```

Replace with:

```typescript
      chars.set(role, { role, state: charState, toolName: event.toolName, toolTarget: extractToolTarget(event), lastActive: event.timestamp });
```

- [ ] **Step 3: Clear `toolTarget` on `tool:done`**

On line 81, the existing line is:

```typescript
      if (existing) chars.set(role, { ...existing, state: 'idle', toolName: undefined, lastActive: event.timestamp });
```

Replace with:

```typescript
      if (existing) chars.set(role, { ...existing, state: 'idle', toolName: undefined, toolTarget: undefined, lastActive: event.timestamp });
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src/renderer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/office.store.ts
git commit -m "feat: add toolTarget field to CharacterInfo for bubble display"
```

---

### Task 4: Drive Bubble from Scene Sync

**Files:**
- Modify: `src/renderer/src/office/useSceneSync.ts:1-329`

- [ ] **Step 1: Extend the state diff check**

On line 30, the existing check is:

```typescript
        if (prevInfo && prevInfo.state === info.state && prevInfo.toolName === info.toolName) {
```

Replace with:

```typescript
        if (prevInfo && prevInfo.state === info.state && prevInfo.toolName === info.toolName && prevInfo.toolTarget === info.toolTarget) {
```

- [ ] **Step 2: Show bubble on typing/reading state**

Replace the `switch` body (lines 34-46) with:

```typescript
        switch (info.state) {
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
          case 'idle':
            if (prevInfo && prevInfo.state !== 'idle') {
              character.setIdle();
              character.hideToolBubble();
            }
            break;
          // 'walking' is handled internally by Character.moveTo()
        }
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src/renderer && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Manual verification**

Run the app (`npm run dev`), start a session, and verify:
1. When an agent starts using a tool (e.g. Read), a dark pill appears above their sprite with icon + filename
2. When the tool finishes, the bubble lingers for ~2 seconds then fades out
3. Rapid tool calls update the bubble content without flicker
4. Multiple agents (e.g. parallel TL clones) each show their own bubble independently
5. The bubble follows the character if they move

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/useSceneSync.ts
git commit -m "feat: drive tool bubble from character state changes in scene sync"
```
