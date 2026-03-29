# UI/UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix canvas auto-resize, add expandable chat panel with tab switching, and style chat messages as tinted bubbles.

**Architecture:** Three independent improvements that share a common layout component (`OfficeView.tsx`). The ResizeObserver fix enables the expandable panel (container resize triggers canvas resize). A new `ui.store.ts` manages expanded/tab state. Chat bubbles are a styling-only change to the existing message renderer.

**Tech Stack:** React 19, TypeScript, PixiJS 8, Zustand 5, Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-ui-ux-improvements-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `shared/types.ts` | Modify | Add `'system'` to `ChatMessage.role` union |
| `src/renderer/src/stores/ui.store.ts` | Create | `isExpanded`, `activeTab` state + actions |
| `src/renderer/src/office/OfficeCanvas.tsx` | Modify | Replace window resize listener with ResizeObserver, remove `resizeTo` |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Modify | Chat bubble styles, expandable layout, chevron toggle |
| `src/renderer/src/components/TabBar/TabBar.tsx` | Create | Floating pill-shaped tab bar for expanded mode |
| `src/renderer/src/components/ChatPanel/` | Delete | Legacy unused directory (ChatPanel.tsx, MessageBubble.tsx, MessageThread.tsx, PromptInput.tsx) |
| `tests/stores/ui.store.test.ts` | Create | Unit tests for UI store |
| `vitest.config.ts` | Modify | Add `@shared` alias for test module resolution |

---

## Chunk 1: Foundation (Type Change + Vitest Config + UI Store + ResizeObserver)

### Task 1: Add `'system'` to ChatMessage Role Type and Fix Vitest Config

**Files:**
- Modify: `shared/types.ts:100-106`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Update the ChatMessage type**

In `shared/types.ts`, change line 102 from:
```typescript
  role: 'user' | 'agent';
```
to:
```typescript
  role: 'user' | 'agent' | 'system';
```

- [ ] **Step 2: Add `@shared` alias to `vitest.config.ts`**

The renderer code imports from `@shared/types` but the Vitest config is missing this alias (it's only defined in `electron.vite.config.ts`). Without this, any test that transitively imports from `@shared` will fail.

In `vitest.config.ts`, add the `@shared` alias to the existing resolve.alias section:

```typescript
    alias: {
      '@': resolve(process.cwd(), 'src'),
      '@electron': resolve(process.cwd(), 'electron'),
      '@shared': resolve(process.cwd(), 'shared'),
    },
```

- [ ] **Step 3: Run existing tests to make sure nothing breaks**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All existing tests PASS (the type change is additive, no existing code uses `'system'`).

- [ ] **Step 4: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add shared/types.ts vitest.config.ts
git commit -m "feat: add 'system' role to ChatMessage type, fix @shared vitest alias"
```

---

### Task 2: Create UI Store

**Files:**
- Create: `src/renderer/src/stores/ui.store.ts`
- Create: `tests/stores/ui.store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/stores/ui.store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../src/renderer/src/stores/ui.store';

describe('UIStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useUIStore.setState({ isExpanded: false, activeTab: 'chat' });
  });

  it('defaults to collapsed with chat tab', () => {
    const state = useUIStore.getState();
    expect(state.isExpanded).toBe(false);
    expect(state.activeTab).toBe('chat');
  });

  it('toggleExpanded expands and defaults to chat tab', () => {
    useUIStore.getState().toggleExpanded();
    const state = useUIStore.getState();
    expect(state.isExpanded).toBe(true);
    expect(state.activeTab).toBe('chat');
  });

  it('toggleExpanded collapses when already expanded', () => {
    useUIStore.setState({ isExpanded: true, activeTab: 'office' });
    useUIStore.getState().toggleExpanded();
    const state = useUIStore.getState();
    expect(state.isExpanded).toBe(false);
  });

  it('toggleExpanded resets activeTab to chat when expanding', () => {
    // Start collapsed with office tab (shouldn't happen, but tests the reset)
    useUIStore.setState({ isExpanded: false, activeTab: 'office' });
    useUIStore.getState().toggleExpanded();
    expect(useUIStore.getState().activeTab).toBe('chat');
  });

  it('setActiveTab changes the active tab', () => {
    useUIStore.getState().setActiveTab('office');
    expect(useUIStore.getState().activeTab).toBe('office');
    useUIStore.getState().setActiveTab('chat');
    expect(useUIStore.getState().activeTab).toBe('chat');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run tests/stores/ui.store.test.ts`
Expected: FAIL — module `../src/renderer/src/stores/ui.store` not found.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/stores/ui.store.ts`:
```typescript
import { create } from 'zustand';

interface UIStore {
  isExpanded: boolean;
  activeTab: 'chat' | 'office';
  toggleExpanded: () => void;
  setActiveTab: (tab: 'chat' | 'office') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isExpanded: false,
  activeTab: 'chat' as const,
  toggleExpanded: () =>
    set((state) => ({
      isExpanded: !state.isExpanded,
      // Always reset to chat tab when expanding
      activeTab: state.isExpanded ? state.activeTab : 'chat',
    })),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run tests/stores/ui.store.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/stores/ui.store.ts tests/stores/ui.store.test.ts
git commit -m "feat: add UI store for expanded/tab layout state"
```

---

### Task 3: Fix Canvas Auto-Resize with ResizeObserver

**Files:**
- Modify: `src/renderer/src/office/OfficeCanvas.tsx`

**Context:** The current code at line 34 uses `resizeTo: container` and at lines 70-75 uses `window.addEventListener('resize')`. Both need to be replaced with a single `ResizeObserver` that manually resizes both the PixiJS renderer and the scene/camera.

- [ ] **Step 1: Remove `resizeTo` from PixiJS init**

In `src/renderer/src/office/OfficeCanvas.tsx`, change the `app.init()` call (lines 32-38) from:
```typescript
      await app.init({
        background: '#1a1a2e',
        resizeTo: container,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });
```
to:
```typescript
      await app.init({
        background: '#1a1a2e',
        width: container.clientWidth,
        height: container.clientHeight,
        antialias: false,
        roundPixels: true,
        resolution: 1,
      });
```

- [ ] **Step 2: Replace window resize listener with ResizeObserver**

Replace the resize listener block (lines 70-75):
```typescript
    const onResize = () => {
      if (sceneRef.current && container) {
        sceneRef.current.onResize(container.clientWidth, container.clientHeight);
      }
    };
    window.addEventListener('resize', onResize);
```

with a ResizeObserver:
```typescript
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Guard: skip when container is hidden (display: none → 0×0)
        if (width === 0 || height === 0) continue;
        // Resize renderer and scene/camera atomically
        if (appRef.current) {
          appRef.current.renderer.resize(width, height);
        }
        if (sceneRef.current) {
          sceneRef.current.onResize(width, height);
        }
      }
    });
    resizeObserver.observe(container);
```

- [ ] **Step 3: Update the cleanup function**

In the cleanup return (lines 77-90), replace:
```typescript
      window.removeEventListener('resize', onResize);
```
with:
```typescript
      resizeObserver.disconnect();
```

- [ ] **Step 4: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/office/OfficeCanvas.tsx
git commit -m "fix: use ResizeObserver for canvas auto-resize on container change"
```

---

## Chunk 2: Chat Bubbles

### Task 4: Style Chat Messages as Tinted Bubbles

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

**Context:** The current message rendering (lines 320-344 of `OfficeView.tsx`) uses flat `messageItem` + `messageSender` + `messageText` styles. We replace this with tinted bubble containers with colored left-border accents.

- [ ] **Step 1: Add bubble style helpers to the styles object**

In `OfficeView.tsx`, add these new style entries after the existing `messageText` style (after line 126):

```typescript
  // Chat bubble styles
  messageBubble: (role: 'user' | 'agent' | 'system', accentColor: string) => ({
    padding: '10px 12px',
    borderRadius: '8px',
    borderLeft: `3px solid ${accentColor}`,
    background: role === 'user' ? '#1a2a3a' : role === 'system' ? '#1a1a1a' : '#1a1a2e',
    marginBottom: '0px', // gap handled by parent flex gap
  }),
  messageTimestamp: {
    fontSize: '10px',
    color: '#666',
    textAlign: 'right' as const,
    marginTop: '4px',
  },
```

- [ ] **Step 2: Add a timestamp formatter helper**

Add this helper function near the other helpers at the top of the file (after `agentDisplayName`):

```typescript
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}
```

- [ ] **Step 3: Add a `renderMessage` helper function inside the component**

This helper will be reused in both the default and expanded layouts (Task 6), avoiding duplication. Add it inside the `OfficeView` component function, after the existing helper variables (`showEmpty`, etc.):

```typescript
  function renderMessage(msg: ChatMessage) {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    const senderLabel = isUser
      ? 'You'
      : isSystem
        ? 'System'
        : msg.agentRole
          ? agentDisplayName(msg.agentRole)
          : 'Agent';
    const accentColor = isUser
      ? '#3b82f6'
      : isSystem
        ? '#666'
        : msg.agentRole
          ? AGENT_COLORS[msg.agentRole]
          : '#94a3b8';
    const senderColor = isUser
      ? '#3b82f6'
      : isSystem
        ? '#999'
        : msg.agentRole
          ? AGENT_COLORS[msg.agentRole]
          : '#94a3b8';

    return (
      <div key={msg.id} style={styles.messageBubble(msg.role, accentColor)}>
        <span style={styles.messageSender(senderColor)}>
          {senderLabel}
        </span>
        <span style={styles.messageText}>{msg.text}</span>
        <div style={styles.messageTimestamp}>{formatTime(msg.timestamp)}</div>
      </div>
    );
  }
```

You also need to add the `ChatMessage` import. Update the existing import from `@shared/types` to include it:

```typescript
import { AGENT_COLORS } from '@shared/types';
import type { AgentRole, ChatMessage } from '@shared/types';
```

- [ ] **Step 4: Update the message rendering to use the helper**

Replace the message map block (the `{messages.map((msg) => { ... })}` block, lines 321-342) with:

```typescript
              {messages.map(renderMessage)}
```

- [ ] **Step 5: Update messageList gap**

Change the `messageList` style's `gap` from `'10px'` to `'8px'` to match the spec's 8px margin between bubbles.

In the `messageList` style object (around line 104), change:
```typescript
    gap: '10px',
```
to:
```typescript
    gap: '8px',
```

- [ ] **Step 6: Remove the old messageItem style**

Delete the `messageItem` style from the styles object (lines 108-112) since it's no longer used:
```typescript
  messageItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
```

- [ ] **Step 7: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 8: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 9: Manual visual test**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite dev`

Verify in the running app:
- Send a message — it should appear in a blue-tinted bubble with blue left border
- Agent responses should appear in purple-tinted bubbles with the agent's color accent
- Timestamps should appear bottom-right of each bubble
- The overall dark aesthetic should feel cohesive

- [ ] **Step 10: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: style chat messages as tinted bubbles with colored accents"
```

---

## Chunk 3: Expandable Chat Layout

### Task 5: Create the TabBar Component

**Files:**
- Create: `src/renderer/src/components/TabBar/TabBar.tsx`

- [ ] **Step 1: Create the TabBar component**

Create `src/renderer/src/components/TabBar/TabBar.tsx`:

```typescript
import type { CSSProperties } from 'react';

type Tab = 'chat' | 'office';

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'office', label: 'OFFICE' },
];

const styles = {
  wrapper: {
    position: 'absolute' as const,
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  container: {
    display: 'flex',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  tab: (active: boolean): CSSProperties => ({
    padding: '8px 20px',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    background: active ? '#2a2a4a' : 'transparent',
    color: active ? '#e5e5e5' : '#666',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  }),
};

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={styles.tab(tab.id === activeTab)}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds (component is created but not yet imported — tree-shaking won't error).

- [ ] **Step 3: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/components/TabBar/TabBar.tsx
git commit -m "feat: add floating TabBar component for expanded mode"
```

---

### Task 6: Implement Expandable Chat Layout in OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

**Context:** This is the biggest change. We need to:
1. Import `useUIStore` and `TabBar`
2. Add the chevron toggle button
3. Conditionally render side-by-side vs full-width layout
4. Show the tab bar only in expanded mode
5. Cap the chat input at `max-width: 720px` in expanded mode

- [ ] **Step 1: Add imports**

At the top of `OfficeView.tsx`, add these imports (after the existing imports):

```typescript
import { useUIStore } from '../../stores/ui.store';
import { TabBar } from '../TabBar/TabBar';
```

- [ ] **Step 2: Add chevron button style to the styles object**

Add to the styles object (after `sendButton`):

```typescript
  // Chevron toggle button
  chevronButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    background: '#1a1a2e',
    border: 'none',
    borderLeft: '1px solid #333',
    borderRight: '1px solid #333',
    color: '#666',
    cursor: 'pointer',
    fontSize: '14px',
    flexShrink: 0,
    transition: 'background 0.15s, color 0.15s',
    fontFamily: 'inherit',
  },
```

- [ ] **Step 3: Add expanded-mode styles**

Add to the styles object:

```typescript
  // Expanded mode: full-width content area
  expandedContent: {
    position: 'relative' as const,
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  // Expanded chat panel (full width)
  expandedChatPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    background: '#0f0f1a',
    overflow: 'hidden',
  },
  // Expanded input row capped at 720px
  expandedInputRow: {
    display: 'flex',
    alignItems: 'center',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden',
    maxWidth: '720px',
    margin: '0 auto',
    width: '100%',
  },
```

- [ ] **Step 4: Wire up state in the component**

Inside the `OfficeView` component function (after existing useState/useRef declarations), add:

```typescript
  const { isExpanded, activeTab, toggleExpanded, setActiveTab } = useUIStore();
```

- [ ] **Step 5: Replace the main area JSX**

Replace the entire `{/* Main area */}` section (the `<div style={styles.main}>...</div>` block, lines 306-375) with the new layout that handles both default and expanded modes:

```typescript
      {/* Main area */}
      <div style={styles.main}>
        {isExpanded ? (
          <>
            {/* Collapse chevron */}
            <button
              style={styles.chevronButton}
              onClick={toggleExpanded}
              title="Collapse to side-by-side"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2a2a4a';
                e.currentTarget.style.color = '#e5e5e5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a2e';
                e.currentTarget.style.color = '#666';
              }}
            >
              ‹
            </button>

            {/* Expanded content area */}
            <div style={styles.expandedContent}>
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Chat tab (full width) */}
              <div style={{
                ...styles.expandedChatPanel,
                display: activeTab === 'chat' ? 'flex' : 'none',
              }}>
                {showEmpty ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyTitle}>The Office</div>
                    <div style={styles.emptySubtitle}>
                      {isIdle
                        ? 'Describe what you want to build and the team will get to work.'
                        : 'No messages yet.'}
                    </div>
                  </div>
                ) : (
                  <div style={{ ...styles.messageList, paddingTop: '48px' }}>
                    {messages.map(renderMessage)}
                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Input area (capped width) */}
                <div style={styles.inputArea}>
                  <div style={styles.expandedInputRow}>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      style={styles.inputField}
                      placeholder={inputPlaceholder}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      style={styles.sendButton(canSend)}
                      onClick={handleSend}
                      disabled={!canSend}
                      aria-label="Send message"
                    >
                      ↑
                    </button>
                  </div>
                </div>
              </div>

              {/* Office tab (canvas) */}
              <div style={{
                ...styles.canvasArea,
                display: activeTab === 'office' ? 'flex' : 'none',
              }}>
                <OfficeCanvas onSceneReady={handleSceneReady} />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Default: side-by-side layout */}
            <div style={styles.chatPanel}>
              {showEmpty ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyTitle}>The Office</div>
                  <div style={styles.emptySubtitle}>
                    {isIdle
                      ? 'Describe what you want to build and the team will get to work.'
                      : 'No messages yet.'}
                  </div>
                </div>
              ) : (
                <div style={styles.messageList}>
                  {messages.map(renderMessage)}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Input area */}
              <div style={styles.inputArea}>
                <div style={styles.inputRow}>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    style={styles.inputField}
                    placeholder={inputPlaceholder}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    style={styles.sendButton(canSend)}
                    onClick={handleSend}
                    disabled={!canSend}
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>

            {/* Expand chevron */}
            <button
              style={styles.chevronButton}
              onClick={toggleExpanded}
              title="Expand chat to full width"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2a2a4a';
                e.currentTarget.style.color = '#e5e5e5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a2e';
                e.currentTarget.style.color = '#666';
              }}
            >
              ›
            </button>

            {/* PixiJS office canvas */}
            <div style={styles.canvasArea}>
              <OfficeCanvas onSceneReady={handleSceneReady} />
            </div>
          </>
        )}
      </div>
```

**Notes:**
- The `<OfficeCanvas>` is rendered in both branches. React will unmount/remount the canvas when toggling between expanded and default mode — this is acceptable since the PixiJS scene reinitializes cleanly.
- When the canvas is hidden via `display: none` (Chat tab active in expanded mode), the PixiJS ticker continues running. This is acceptable overhead for v1 — the ticker is lightweight. The ResizeObserver's zero-dimension guard (Task 3) prevents resize errors on the hidden canvas.
- The `renderMessage` helper from Task 4 is reused in both branches via `messages.map(renderMessage)` — no duplication.

- [ ] **Step 6: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 8: Manual visual test**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite dev`

Verify in the running app:
- The `›` chevron is visible on the right edge of the chat panel
- Clicking it expands the chat to full width with a floating tab bar at the top
- The tab bar shows "CHAT" (active) and "OFFICE" tabs
- Switching to "OFFICE" tab shows the pixel office canvas
- The `‹` chevron collapses back to side-by-side view
- The canvas properly re-renders at the correct size after toggling
- In expanded chat mode, the input area is centered with a max-width

- [ ] **Step 9: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: add expandable chat panel with tab switching"
```

---

## Chunk 4: Cleanup

### Task 7: Delete Legacy ChatPanel Components

**Files:**
- Delete: `src/renderer/src/components/ChatPanel/ChatPanel.tsx`
- Delete: `src/renderer/src/components/ChatPanel/MessageBubble.tsx`

- [ ] **Step 1: Check for imports of the legacy components**

Search the codebase for any imports of ChatPanel or MessageBubble from the ChatPanel directory. If any files import them, they need to be updated first.

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && grep -r "ChatPanel" src/ --include="*.ts" --include="*.tsx" -l`

Expected: Only `src/renderer/src/components/ChatPanel/ChatPanel.tsx` and `src/renderer/src/components/ChatPanel/MessageBubble.tsx` should appear. If any other files import from ChatPanel/, update those imports before deleting.

- [ ] **Step 2: Check for other files in the ChatPanel directory**

Run: `ls -la "/Users/shahar/Projects/my-projects/office plugin/the-office/src/renderer/src/components/ChatPanel/"`

If there are files beyond `ChatPanel.tsx` and `MessageBubble.tsx` (e.g., `MessageThread.tsx`, `PromptInput.tsx`), delete all of them.

- [ ] **Step 3: Delete the legacy components**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
rm -rf src/renderer/src/components/ChatPanel/
```

- [ ] **Step 4: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx electron-vite build 2>&1 | tail -20`
Expected: Build succeeds — no remaining imports reference the deleted files.

- [ ] **Step 5: Run all tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "/Users/shahar/Projects/my-projects/office plugin/the-office"
git add -A src/renderer/src/components/ChatPanel/
git commit -m "chore: remove legacy ChatPanel components"
```
