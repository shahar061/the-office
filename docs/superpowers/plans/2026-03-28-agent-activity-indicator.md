# Agent Activity Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real-time tool-level activity in the chat panel when an agent is working, replacing the input area with a timeline of recent actions.

**Architecture:** Add `agentActivity` state to the existing `useOfficeStore` (same store that tracks character animations from agent events). A new `ActivityIndicator` component reads this state and renders a vertical timeline. `ChatPanel` conditionally renders the indicator instead of the input area when an agent is active.

**Tech Stack:** React, Zustand, TypeScript, CSS-in-JS (inline styles matching existing codebase patterns)

---

### Task 1: Add `extractToolTarget` utility

**Files:**
- Modify: `src/renderer/src/utils.ts`

- [ ] **Step 1: Add `extractToolTarget` function**

Append to `src/renderer/src/utils.ts`:

```typescript
import type { AgentEvent } from '@shared/types';

export function extractToolTarget(event: AgentEvent): string {
  const tool = event.toolName ?? '';
  const msg = event.message ?? '';

  if (!msg) return tool || 'Working';

  const FILE_TOOLS = ['Read', 'Write', 'Edit'];
  if (FILE_TOOLS.includes(tool)) {
    const segments = msg.split('/');
    return segments[segments.length - 1] || msg;
  }

  if (tool === 'Bash') {
    const trimmed = msg.trim();
    return trimmed.length > 40 ? trimmed.slice(0, 40) + '\u2026' : trimmed;
  }

  if (tool === 'Grep' || tool === 'Glob') {
    return msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg;
  }

  // Fallback: show tool name or truncated message
  return tool || (msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg);
}
```

Note: The existing `import type` for `AgentEvent` needs to be added at the top of the file. The file currently has no imports.

- [ ] **Step 2: Verify the file compiles**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors related to `utils.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/utils.ts
git commit -m "feat: add extractToolTarget utility for agent activity indicator"
```

---

### Task 2: Add `agentActivity` state to office store

**Files:**
- Modify: `src/renderer/src/stores/office.store.ts`

- [ ] **Step 1: Add ActivityAction type and agentActivity state**

Add the `ActivityAction` interface after the existing `CharacterInfo` interface, extend the `OfficeStore` interface, and add initial state + update logic.

Replace the full contents of `src/renderer/src/stores/office.store.ts` with:

```typescript
import { create } from 'zustand';
import type { AgentRole, AgentEvent } from '@shared/types';
import { extractToolTarget } from '../utils';

export type CharacterState = 'idle' | 'walking' | 'typing' | 'reading';

export interface CharacterInfo {
  role: AgentRole;
  state: CharacterState;
  toolName?: string;
  lastActive: number;
}

export interface ActivityAction {
  id: string;
  toolName: string;
  target: string;
  status: 'running' | 'done';
}

interface AgentActivity {
  isActive: boolean;
  agentRole: AgentRole | null;
  actions: ActivityAction[];
}

interface OfficeStore {
  characters: Map<AgentRole, CharacterInfo>;
  activeAgents: Set<AgentRole>;
  agentActivity: AgentActivity;
  handleAgentEvent: (event: AgentEvent) => void;
  clearAgentActivity: () => void;
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);

const INITIAL_ACTIVITY: AgentActivity = {
  isActive: false,
  agentRole: null,
  actions: [],
};

export const useOfficeStore = create<OfficeStore>((set) => ({
  characters: new Map(),
  activeAgents: new Set(),
  agentActivity: { ...INITIAL_ACTIVITY },

  clearAgentActivity: () => set({ agentActivity: { ...INITIAL_ACTIVITY } }),

  handleAgentEvent: (event) => set((state) => {
    const chars = new Map(state.characters);
    const active = new Set(state.activeAgents);
    const role = event.agentRole;
    let activity = state.agentActivity;

    if (event.type === 'agent:created') {
      chars.set(role, { role, state: 'idle', lastActive: event.timestamp });
      active.add(role);
      if (event.isTopLevel) {
        activity = { isActive: true, agentRole: role, actions: [] };
      }
    } else if (event.type === 'agent:tool:start') {
      const charState = READ_TOOLS.has(event.toolName || '') ? 'reading' : 'typing';
      chars.set(role, { role, state: charState, toolName: event.toolName, lastActive: event.timestamp });

      const newAction: ActivityAction = {
        id: event.toolId ?? `${event.timestamp}`,
        toolName: event.toolName ?? 'Tool',
        target: extractToolTarget(event),
        status: 'running',
      };
      const updatedActions = [...activity.actions, newAction].slice(-3);
      activity = { isActive: true, agentRole: role, actions: updatedActions };
    } else if (event.type === 'agent:tool:done') {
      const existing = chars.get(role);
      if (existing) chars.set(role, { ...existing, state: 'idle', toolName: undefined, lastActive: event.timestamp });

      const updatedActions = activity.actions.map((a) =>
        a.id === event.toolId ? { ...a, status: 'done' as const } : a,
      );
      activity = { ...activity, actions: updatedActions };
    } else if (event.type === 'agent:closed') {
      const existing = chars.get(role);
      if (existing) chars.set(role, { ...existing, state: 'idle', lastActive: event.timestamp });
      active.delete(role);
    }

    return { characters: chars, activeAgents: active, agentActivity: activity };
  }),
}));
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/office.store.ts
git commit -m "feat: add agentActivity state to office store"
```

---

### Task 3: Clear agent activity on phase completion

**Files:**
- Modify: `src/renderer/src/stores/project.store.ts`

- [ ] **Step 1: Add clearAgentActivity call to setPhaseInfo**

In `src/renderer/src/stores/project.store.ts`, add an import for `useOfficeStore` and call `clearAgentActivity()` when phase reaches a terminal status.

Add this import at the top of the file, after the existing imports:

```typescript
import { useOfficeStore } from './office.store';
```

Then update the `setPhaseInfo` method. Find the current implementation:

```typescript
  setPhaseInfo: (info) =>
    set((state) => {
      const ps = state.projectState;
      if (!ps) return { currentPhase: info };

      const completedPhases =
        info.status === 'completed' && !ps.completedPhases.includes(info.phase)
          ? [...ps.completedPhases, info.phase]
          : ps.completedPhases;

      return {
        currentPhase: info,
        projectState: {
          ...ps,
          currentPhase: info.phase,
          completedPhases,
        },
      };
    }),
```

Replace with:

```typescript
  setPhaseInfo: (info) =>
    set((state) => {
      const ps = state.projectState;

      const TERMINAL = ['completed', 'failed', 'interrupted'];
      if (TERMINAL.includes(info.status)) {
        useOfficeStore.getState().clearAgentActivity();
      }

      if (!ps) return { currentPhase: info };

      const completedPhases =
        info.status === 'completed' && !ps.completedPhases.includes(info.phase)
          ? [...ps.completedPhases, info.phase]
          : ps.completedPhases;

      return {
        currentPhase: info,
        projectState: {
          ...ps,
          currentPhase: info.phase,
          completedPhases,
        },
      };
    }),
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/project.store.ts
git commit -m "feat: clear agent activity on phase completion"
```

---

### Task 4: Create ActivityIndicator component

**Files:**
- Create: `src/renderer/src/components/OfficeView/ActivityIndicator.tsx`

- [ ] **Step 1: Create the component file**

Create `src/renderer/src/components/OfficeView/ActivityIndicator.tsx`:

```typescript
import { useOfficeStore } from '../../stores/office.store';
import type { ActivityAction } from '../../stores/office.store';
import { AGENT_COLORS } from '@shared/types';
import { agentDisplayName } from '../../utils';
import { colors } from '../../theme';

function ActionRow({ action, agentColor }: { action: ActivityAction; agentColor: string }) {
  const isDone = action.status === 'done';

  return (
    <div style={styles.actionRow}>
      {isDone ? (
        <span style={styles.checkmark}>{'\u2713'}</span>
      ) : (
        <span
          style={{
            ...styles.spinner,
            borderColor: `${agentColor}33`,
            borderTopColor: agentColor,
          }}
        />
      )}
      <span style={isDone ? styles.actionTextDone : styles.actionTextRunning}>
        {action.toolName} {action.target}
        {!isDone && '...'}
      </span>
    </div>
  );
}

export function ActivityIndicator() {
  const { agentRole, actions } = useOfficeStore((s) => s.agentActivity);

  if (!agentRole) return null;

  const agentColor = AGENT_COLORS[agentRole] ?? colors.textMuted;
  const displayName = agentDisplayName(agentRole);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ ...styles.dot, background: agentColor }} />
        <span style={{ ...styles.agentName, color: agentColor }}>{displayName}</span>
      </div>
      <div style={{ ...styles.timeline, borderLeftColor: `${agentColor}4D` }}>
        {actions.length === 0 ? (
          <div style={styles.actionRow}>
            <span
              style={{
                ...styles.spinner,
                borderColor: `${agentColor}33`,
                borderTopColor: agentColor,
              }}
            />
            <span style={styles.actionTextRunning}>Thinking...</span>
          </div>
        ) : (
          actions.map((action) => (
            <ActionRow key={action.id} action={action} agentColor={agentColor} />
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '8px 12px 12px',
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  } as React.CSSProperties,
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  } as React.CSSProperties,
  agentName: {
    fontSize: '11px',
    fontWeight: 600,
  } as React.CSSProperties,
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    paddingLeft: '14px',
    borderLeft: '2px solid',
  } as React.CSSProperties,
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  checkmark: {
    fontSize: '10px',
    color: colors.success,
    width: '10px',
    textAlign: 'center' as const,
    flexShrink: 0,
  } as React.CSSProperties,
  spinner: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    border: '2px solid',
    borderTopColor: 'transparent',
    flexShrink: 0,
    animation: 'activity-spin 0.8s linear infinite',
  } as React.CSSProperties,
  actionTextDone: {
    fontSize: '10px',
    color: colors.textDark,
  } as React.CSSProperties,
  actionTextRunning: {
    fontSize: '10px',
    color: colors.text,
    fontWeight: 500,
  } as React.CSSProperties,
};
```

- [ ] **Step 2: Add the spinner keyframes to OfficeView.tsx**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, find the existing `<style>` block (around line 197) that contains `@keyframes pulse-border`. Add the spinner keyframes inside the same `<style>` tag, after the existing `blink-indicator` keyframes:

Find:
```
        .blink-indicator {
          animation: blink-indicator 1s step-end infinite;
        }
      `}</style>
```

Replace with:
```
        .blink-indicator {
          animation: blink-indicator 1s step-end infinite;
        }
        @keyframes activity-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/OfficeView/ActivityIndicator.tsx src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: add ActivityIndicator timeline component"
```

---

### Task 5: Wire ActivityIndicator into ChatPanel

**Files:**
- Modify: `src/renderer/src/components/OfficeView/ChatPanel.tsx`

- [ ] **Step 1: Import ActivityIndicator and useOfficeStore**

In `src/renderer/src/components/OfficeView/ChatPanel.tsx`, add imports at the top. Find the existing import block:

```typescript
import { PhaseActionButton } from './PhaseActionButton';
```

Add after it:

```typescript
import { ActivityIndicator } from './ActivityIndicator';
import { useOfficeStore } from '../../stores/office.store';
```

- [ ] **Step 2: Read agentActivity from store**

Inside the `ChatPanel` component function, after the existing store subscriptions (around line 131, after `const projectState = useProjectStore(...)`), add:

```typescript
  const agentActive = useOfficeStore((s) => s.agentActivity.isActive);
```

- [ ] **Step 3: Conditionally render ActivityIndicator instead of input area**

Find the input area render block (around lines 384-405):

```tsx
      {/* Input area */}
      <div style={styles.inputArea}>
        <div style={inputRowStyle}>
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
```

Replace with:

```tsx
      {/* Input area / Activity indicator */}
      {agentActive && !waitingForResponse ? (
        <ActivityIndicator />
      ) : (
        <div style={styles.inputArea}>
          <div style={inputRowStyle}>
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
      )}
```

- [ ] **Step 4: Verify the file compiles**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit --pretty 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/ChatPanel.tsx
git commit -m "feat: wire ActivityIndicator into ChatPanel, replacing input when agent is active"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npm run dev`

- [ ] **Step 2: Open a project and trigger /imagine**

Type a prompt like "Create a hello world app" and press Enter. Verify:
1. The input area is replaced by the ActivityIndicator
2. The indicator shows the agent's display name with their color
3. Tool actions appear as they happen (Read, Write, Bash, etc.) with file targets
4. Completed actions show a green checkmark and dimmed text
5. The current action shows a spinning indicator
6. Max 3 actions visible at a time
7. When the agent asks a question, the input area returns
8. When the phase completes, the input area returns

- [ ] **Step 3: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "fix: activity indicator tweaks from smoke test"
```
