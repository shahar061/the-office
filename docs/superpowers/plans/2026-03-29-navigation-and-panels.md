# Navigation & Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent icon rail navigation, phase-aware toolbox, live log viewer, and about page to The Office.

**Architecture:** A 40px vertical icon rail replaces the current ad-hoc navigation. Clicking icons swaps the 320px panel content (chat, agents, logs, about) while the PixiJS canvas stays visible. A new log store buffers session transcript entries in memory, with event-based flushes to a `.log` file via IPC.

**Tech Stack:** React 19, Zustand 5, TypeScript, Electron IPC, Node fs

**Design spec:** `docs/superpowers/specs/2026-03-29-navigation-and-panels-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/renderer/src/components/IconRail/IconRail.tsx` | 40px vertical navigation bar with icons, tooltips, badges |
| `src/renderer/src/components/LogViewer/LogViewer.tsx` | Live-scrolling session transcript panel |
| `src/renderer/src/components/AboutPanel/AboutPanel.tsx` | App info + interactive phase guide |
| `src/renderer/src/stores/log.store.ts` | Log entry buffer, unread tracking, flush serialization |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/src/stores/ui.store.ts` | Add `'logs' \| 'about'` to `AppTab` |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Add IconRail, content switcher, remove ⊞ button, adjust canvas offset |
| `src/renderer/src/components/OfficeView/ArtifactToolbox.tsx` | Phase-aware: show war room documents when in warroom phase |
| `src/renderer/src/components/TabBar/TabBar.tsx` | Remove (replaced by icon rail) |
| `shared/types.ts` | Add `FLUSH_LOGS` IPC channel, `flushLogs` to OfficeAPI |
| `electron/preload.ts` | Expose `flushLogs` bridge method |
| `electron/ipc/phase-handlers.ts` | Register `FLUSH_LOGS` handler |
| `electron/main.ts` | Flush logs on app close |

---

### Task 1: Extend UI Store with New Tabs

**Files:**
- Modify: `src/renderer/src/stores/ui.store.ts`

- [ ] **Step 1: Update AppTab type and default behavior**

In `src/renderer/src/stores/ui.store.ts`, change the `AppTab` type and update the `toggleExpanded` logic:

```typescript
export type AppTab = 'chat' | 'office' | 'agents' | 'logs' | 'about';
```

The existing store logic already handles `activeTab` generically, so only the type needs to change. The `toggleExpanded` reset to `'chat'` on expand is still correct.

- [ ] **Step 2: Verify the app still compiles**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit`
Expected: No errors (existing code only uses `'chat' | 'office' | 'agents'` which are still valid)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/ui.store.ts
git commit -m "feat: extend AppTab type with logs and about tabs"
```

---

### Task 2: Create Icon Rail Component

**Files:**
- Create: `src/renderer/src/components/IconRail/IconRail.tsx`

- [ ] **Step 1: Create the IconRail component**

Create `src/renderer/src/components/IconRail/IconRail.tsx`:

```tsx
import { useState } from 'react';
import type { AppTab } from '../../stores/ui.store';
import { useOfficeStore } from '../../stores/office.store';
import { useLogStore } from '../../stores/log.store';
import { colors } from '../../theme';

interface IconRailProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

interface NavItem {
  id: AppTab;
  icon: string;
  label: string;
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'office', icon: '🖥️', label: 'Office' },
  { id: 'agents', icon: '👥', label: 'Agents' },
];

const UTILITY_ITEMS: NavItem[] = [
  { id: 'logs', icon: '📋', label: 'Logs' },
  { id: 'about', icon: 'ℹ️', label: 'About' },
];

const styles = {
  rail: {
    width: '40px',
    minWidth: '40px',
    background: colors.bgDark,
    borderRight: `1px solid ${colors.borderLight}`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: '8px',
    gap: '2px',
    flexShrink: 0,
    zIndex: 2,
  },
  divider: {
    width: '20px',
    height: '1px',
    background: colors.borderLight,
    margin: '4px 0',
  },
  iconButton: (active: boolean) => ({
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
    borderLeft: active ? `2px solid ${colors.accent}` : '2px solid transparent',
    borderRight: 'none',
    borderTop: 'none',
    borderBottom: 'none',
    borderRadius: '0 4px 4px 0',
    opacity: active ? 1 : 0.45,
    cursor: 'pointer',
    position: 'relative' as const,
    padding: 0,
    fontFamily: 'inherit',
    transition: 'opacity 0.15s, background 0.15s',
  }),
  tooltip: {
    position: 'absolute' as const,
    left: '42px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    color: colors.text,
    whiteSpace: 'nowrap' as const,
    zIndex: 100,
    pointerEvents: 'none' as const,
  },
  badge: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: colors.warning,
  },
  countBadge: {
    position: 'absolute' as const,
    top: '1px',
    right: '1px',
    minWidth: '14px',
    height: '14px',
    borderRadius: '7px',
    background: colors.accent,
    color: '#fff',
    fontSize: '8px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    lineHeight: 1,
  },
} as const;

function IconButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      style={{
        ...styles.iconButton(active),
        opacity: active ? 1 : hovered ? 0.75 : 0.45,
        background: active
          ? 'rgba(59,130,246,0.1)'
          : hovered
            ? colors.surface
            : 'transparent',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={item.label}
    >
      {item.icon}
      {badge}
      {hovered && !active && <div style={styles.tooltip}>{item.label}</div>}
    </button>
  );
}

export function IconRail({ activeTab, onTabChange }: IconRailProps) {
  const agentActive = useOfficeStore((s) => s.agentActivity.isActive);
  const unreadCount = useLogStore((s) => s.unreadCount);

  return (
    <div style={styles.rail}>
      {PRIMARY_ITEMS.map((item) => (
        <IconButton
          key={item.id}
          item={item}
          active={activeTab === item.id}
          badge={
            item.id === 'agents' && agentActive && activeTab !== 'agents'
              ? <div style={styles.badge} />
              : undefined
          }
          onClick={() => onTabChange(item.id)}
        />
      ))}
      <div style={styles.divider} />
      {UTILITY_ITEMS.map((item) => (
        <IconButton
          key={item.id}
          item={item}
          active={activeTab === item.id}
          badge={
            item.id === 'logs' && unreadCount > 0 && activeTab !== 'logs'
              ? <div style={styles.countBadge}>{unreadCount > 99 ? '99+' : unreadCount}</div>
              : undefined
          }
          onClick={() => onTabChange(item.id)}
        />
      ))}
    </div>
  );
}
```

Note: This references `useLogStore` which doesn't exist yet. It will be created in Task 4. For now, the import will cause a type error — that's expected and will resolve after Task 4.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/IconRail/IconRail.tsx
git commit -m "feat: add IconRail navigation component"
```

---

### Task 3: Create About Panel

**Files:**
- Create: `src/renderer/src/components/AboutPanel/AboutPanel.tsx`

- [ ] **Step 1: Create the AboutPanel component**

Create `src/renderer/src/components/AboutPanel/AboutPanel.tsx`:

```tsx
import { useState } from 'react';
import { AGENT_COLORS, AGENT_ROLES } from '@shared/types';
import type { AgentRole } from '@shared/types';
import { colors } from '../../theme';

interface PhaseCard {
  name: string;
  color: string;
  tagline: string;
  description: string;
  agents: AgentRole[];
  outputs: string[];
}

const PHASES: PhaseCard[] = [
  {
    name: 'Imagine',
    color: '#f97316',
    tagline: 'Discovery & product definition',
    description:
      'The CEO hosts a discovery phase, exploring your idea through collaborative dialogue. The team then produces four key documents: a Vision Brief capturing the core concept, a PRD detailing requirements, a Market Analysis assessing the landscape, and a System Design outlining the technical architecture.',
    agents: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
    outputs: ['Vision Brief', 'PRD', 'Market Analysis', 'System Design'],
  },
  {
    name: 'War Room',
    color: '#0ea5e9',
    tagline: 'Planning & architecture',
    description:
      'The Project Manager and Team Lead take the design spec and break it into an actionable implementation plan. Milestones are defined, tasks are decomposed with dependencies and acceptance criteria, and a DevOps engineer plans the environment. The result is a battle-ready plan with clear execution order.',
    agents: ['project-manager', 'team-lead', 'devops'],
    outputs: ['Milestones', 'Implementation Plan', 'Task Breakdown'],
  },
  {
    name: 'Build',
    color: '#22c55e',
    tagline: 'Implementation',
    description:
      'Autonomous subagents execute the plan task-by-task. Each agent works in an isolated worktree, with two-stage code review (spec compliance + quality). The full engineering team — frontend, backend, mobile, data, DevOps — collaborates to build the software, with only critical blockers escalated to you.',
    agents: [
      'agent-organizer', 'backend-engineer', 'frontend-engineer',
      'mobile-developer', 'ui-ux-expert', 'data-engineer',
      'devops', 'automation-developer',
    ],
    outputs: ['Working Software', 'Tests', 'Documentation'],
  },
];

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflowY: 'auto' as const,
    padding: '16px 12px',
    gap: '16px',
  },
  header: {
    textAlign: 'center' as const,
    paddingBottom: '12px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: colors.text,
  },
  tagline: {
    fontSize: '11px',
    color: colors.textDim,
    marginTop: '4px',
  },
  version: {
    fontSize: '10px',
    color: colors.textDark,
    marginTop: '2px',
  },
  sectionLabel: {
    fontSize: '9px',
    color: colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  card: (expanded: boolean, phaseColor: string) => ({
    background: colors.surface,
    border: `1px solid ${expanded ? phaseColor + '4D' : colors.borderLight}`,
    borderRadius: '6px',
    padding: '8px 10px',
    cursor: 'pointer',
  }),
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  phaseNumber: (color: string) => ({
    fontSize: '11px',
    fontWeight: 600,
    color,
  }),
  chevron: {
    fontSize: '11px',
    color: colors.textDim,
    width: '12px',
  },
  dots: {
    display: 'flex',
    gap: '2px',
    marginLeft: 'auto',
  },
  dot: (color: string) => ({
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: color,
  }),
  expandedBody: {
    marginTop: '8px',
    fontSize: '11px',
    color: colors.textMuted,
    lineHeight: 1.5,
  },
  outputTags: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
    marginTop: '8px',
  },
  outputTag: {
    background: colors.bg,
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '9px',
    color: colors.textDim,
  },
  footer: {
    textAlign: 'center' as const,
    paddingTop: '8px',
    borderTop: `1px solid ${colors.borderLight}`,
  },
  footerText: {
    fontSize: '10px',
    color: colors.textDark,
  },
  footerLink: {
    fontSize: '10px',
    color: colors.accent,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    marginTop: '2px',
  },
} as const;

function PhaseCardComponent({ phase, index }: { phase: PhaseCard; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={styles.card(expanded, phase.color)} onClick={() => setExpanded(!expanded)}>
      <div style={styles.cardHeader}>
        <span style={styles.chevron}>{expanded ? '▼' : '▶'}</span>
        <span style={styles.phaseNumber(phase.color)}>
          {index + 1}. {phase.name}
        </span>
        {!expanded && (
          <span style={{ fontSize: '10px', color: colors.textDark, marginLeft: '4px' }}>
            {phase.tagline}
          </span>
        )}
        <div style={styles.dots}>
          {phase.agents.map((role) => (
            <div key={role} style={styles.dot(AGENT_COLORS[role])} title={role} />
          ))}
        </div>
      </div>
      {expanded && (
        <>
          <div style={styles.expandedBody}>{phase.description}</div>
          <div style={styles.outputTags}>
            {phase.outputs.map((o) => (
              <span key={o} style={styles.outputTag}>{o}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AboutPanel() {
  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>🏢 The Office</div>
        <div style={styles.tagline}>Watch your AI team build software</div>
        <div style={styles.version}>v{__APP_VERSION__}</div>
      </div>

      <div style={styles.sectionLabel}>How It Works</div>

      {PHASES.map((phase, i) => (
        <PhaseCardComponent key={phase.name} phase={phase} index={i} />
      ))}

      <div style={styles.footer}>
        <div style={styles.footerText}>Powered by Claude Code</div>
        <button
          style={styles.footerLink}
          onClick={() => window.office.openExternal('https://github.com/shahar061/office')}
        >
          GitHub →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Define `__APP_VERSION__` in Vite config**

In `electron.vite.config.ts`, add a `define` entry to the renderer config so `__APP_VERSION__` resolves at build time. Find the `renderer` section and add:

```typescript
define: {
  __APP_VERSION__: JSON.stringify(require('./package.json').version),
},
```

Add it inside the `renderer: { ... }` block alongside existing config like `resolve`.

- [ ] **Step 3: Add the type declaration for `__APP_VERSION__`**

In `src/renderer/src/env.d.ts` (or create it if it doesn't exist), add:

```typescript
declare const __APP_VERSION__: string;
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/AboutPanel/AboutPanel.tsx electron.vite.config.ts src/renderer/src/env.d.ts
git commit -m "feat: add AboutPanel with interactive phase guide"
```

---

### Task 4: Create Log Store

**Files:**
- Create: `src/renderer/src/stores/log.store.ts`

- [ ] **Step 1: Create the log store**

Create `src/renderer/src/stores/log.store.ts`:

```typescript
import { create } from 'zustand';
import type { AgentRole } from '@shared/types';
import { agentDisplayName, extractToolTarget } from '../utils';
import type { AgentEvent } from '@shared/types';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'tool-start' | 'tool-done' | 'agent-message' | 'user-message' | 'agent-lifecycle' | 'phase-transition';
  agentRole?: AgentRole;
  toolName?: string;
  target?: string;
  text?: string;
}

interface LogStore {
  entries: LogEntry[];
  unreadCount: number;
  /** Index of the last entry that was flushed to disk */
  lastFlushedIndex: number;

  addEntry: (entry: LogEntry) => void;
  clearUnread: () => void;
  markFlushed: () => void;

  /** Convenience: create log entries from an AgentEvent */
  logAgentEvent: (event: AgentEvent) => void;
  /** Convenience: log a chat message */
  logMessage: (role: 'user' | 'agent', text: string, agentRole?: AgentRole) => void;
  /** Convenience: log a phase transition */
  logPhaseTransition: (phase: string) => void;

  /** Serialize unflushed entries to plain text for .log file */
  serializeUnflushed: () => string;

  reset: () => void;
}

let entryCounter = 0;

function nextId(): string {
  return `log-${Date.now()}-${++entryCounter}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function serializeEntry(entry: LogEntry): string {
  const time = formatTimestamp(entry.timestamp);
  const agent = entry.agentRole ? agentDisplayName(entry.agentRole) : 'System';

  switch (entry.type) {
    case 'tool-start':
      return `[${time}] ${agent} ⟳ ${entry.toolName ?? 'Tool'} ${entry.target ?? ''}`.trimEnd();
    case 'tool-done':
      return `[${time}] ${agent} ✓ ${entry.toolName ?? 'Tool'} ${entry.target ?? ''}`.trimEnd();
    case 'agent-message': {
      const preview = entry.text && entry.text.length > 80
        ? entry.text.slice(0, 80) + '…'
        : entry.text ?? '';
      return `[${time}] ${agent} → message\n    "${preview}"`;
    }
    case 'user-message': {
      const preview = entry.text && entry.text.length > 80
        ? entry.text.slice(0, 80) + '…'
        : entry.text ?? '';
      return `[${time}] You → message\n    "${preview}"`;
    }
    case 'agent-lifecycle':
      return `[${time}] ${agent} — ${entry.text ?? 'event'}`;
    case 'phase-transition':
      return `═══ Phase: ${entry.text ?? 'Unknown'} ═══`;
    default:
      return `[${time}] ${entry.text ?? ''}`;
  }
}

export const useLogStore = create<LogStore>((set, get) => ({
  entries: [],
  unreadCount: 0,
  lastFlushedIndex: -1,

  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, entry],
      unreadCount: state.unreadCount + 1,
    })),

  clearUnread: () => set({ unreadCount: 0 }),

  markFlushed: () =>
    set((state) => ({ lastFlushedIndex: state.entries.length - 1 })),

  logAgentEvent: (event) => {
    const { addEntry } = get();
    const ts = event.timestamp;
    const role = event.agentRole;

    if (event.type === 'agent:created' && event.isTopLevel) {
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'agent-lifecycle',
        agentRole: role,
        text: 'agent started',
      });
    } else if (event.type === 'agent:tool:start') {
      const toolName = event.toolName ?? 'Tool';
      if (toolName === 'AskUserQuestion') return;
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'tool-start',
        agentRole: role,
        toolName,
        target: extractToolTarget(event),
      });
    } else if (event.type === 'agent:tool:done') {
      const toolName = event.toolName ?? 'Tool';
      if (toolName === 'AskUserQuestion') return;
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'tool-done',
        agentRole: role,
        toolName,
        target: extractToolTarget(event),
      });
    } else if (event.type === 'agent:message' && event.message) {
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'agent-message',
        agentRole: role,
        text: event.message,
      });
    } else if (event.type === 'agent:closed') {
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'agent-lifecycle',
        agentRole: role,
        text: 'agent closed',
      });
    }
  },

  logMessage: (role, text, agentRole) => {
    get().addEntry({
      id: nextId(),
      timestamp: Date.now(),
      type: role === 'user' ? 'user-message' : 'agent-message',
      agentRole,
      text,
    });
  },

  logPhaseTransition: (phase) => {
    get().addEntry({
      id: nextId(),
      timestamp: Date.now(),
      type: 'phase-transition',
      text: phase,
    });
  },

  serializeUnflushed: () => {
    const { entries, lastFlushedIndex } = get();
    const unflushed = entries.slice(lastFlushedIndex + 1);
    if (unflushed.length === 0) return '';
    return unflushed.map(serializeEntry).join('\n') + '\n';
  },

  reset: () =>
    set({
      entries: [],
      unreadCount: 0,
      lastFlushedIndex: -1,
    }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/stores/log.store.ts
git commit -m "feat: add log store with entry buffer and serialization"
```

---

### Task 5: Create Log Viewer Component

**Files:**
- Create: `src/renderer/src/components/LogViewer/LogViewer.tsx`

- [ ] **Step 1: Create the LogViewer component**

Create `src/renderer/src/components/LogViewer/LogViewer.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useLogStore, type LogEntry } from '../../stores/log.store';
import { AGENT_COLORS } from '@shared/types';
import { agentDisplayName } from '../../utils';
import { colors } from '../../theme';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.borderLight}`,
    fontSize: '9px',
    color: colors.textDim,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '8px 10px',
    fontFamily: 'monospace',
    fontSize: '10px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderTop: `1px solid ${colors.borderLight}`,
    flexShrink: 0,
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: colors.success,
  },
  footerText: {
    fontSize: '9px',
    color: colors.textDark,
  },
} as const;

function EntryRow({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const agentColor = entry.agentRole ? AGENT_COLORS[entry.agentRole] ?? colors.textMuted : colors.accent;
  const agentName = entry.agentRole ? agentDisplayName(entry.agentRole) : 'You';

  if (entry.type === 'phase-transition') {
    return (
      <div style={{ padding: '6px 0', color: colors.textDim, fontSize: '10px', textAlign: 'center', borderTop: `1px solid ${colors.borderLight}`, borderBottom: `1px solid ${colors.borderLight}`, margin: '4px 0' }}>
        ═══ Phase: {entry.text} ═══
      </div>
    );
  }

  if (entry.type === 'user-message') {
    return (
      <div style={{ padding: '2px 0' }}>
        <div>
          <span style={{ color: colors.textDark }}>{time}</span>
          {' '}
          <span style={{ color: colors.accent, fontWeight: 600 }}>You</span>
          <span style={{ color: colors.textDim }}> → message</span>
        </div>
        {entry.text && (
          <div style={{ paddingLeft: '60px', color: colors.textDim, fontStyle: 'italic', fontSize: '9px' }}>
            &ldquo;{entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text}&rdquo;
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'agent-message') {
    return (
      <div style={{ padding: '2px 0' }}>
        <div>
          <span style={{ color: colors.textDark }}>{time}</span>
          {' '}
          <span style={{ color: agentColor, fontWeight: 600 }}>{agentName}</span>
          <span style={{ color: colors.textDim }}> → message</span>
        </div>
        {entry.text && (
          <div style={{ paddingLeft: '60px', color: colors.textDim, fontStyle: 'italic', fontSize: '9px' }}>
            &ldquo;{entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text}&rdquo;
          </div>
        )}
      </div>
    );
  }

  if (entry.type === 'tool-start' || entry.type === 'tool-done') {
    const isDone = entry.type === 'tool-done';
    return (
      <div style={{ padding: '2px 0' }}>
        <span style={{ color: colors.textDark }}>{time}</span>
        {' '}
        <span style={{ color: agentColor, fontWeight: 600 }}>{agentName}</span>
        {' '}
        <span style={{ color: isDone ? colors.success : colors.warning }}>
          {isDone ? '✓' : '⟳'}
        </span>
        {' '}
        <span style={{ color: isDone ? colors.success : colors.warning }}>
          {entry.toolName}
        </span>
        {' '}
        <span style={{ color: colors.textDim }}>
          {entry.target !== entry.toolName ? entry.target : ''}
        </span>
      </div>
    );
  }

  // agent-lifecycle
  return (
    <div style={{ padding: '2px 0' }}>
      <span style={{ color: colors.textDark }}>{time}</span>
      {' '}
      <span style={{ color: agentColor, fontWeight: 600 }}>{agentName}</span>
      <span style={{ color: colors.textDim }}> — {entry.text}</span>
    </div>
  );
}

export function LogViewer() {
  const entries = useLogStore((s) => s.entries);
  const clearUnread = useLogStore((s) => s.clearUnread);
  const listRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Clear unread on mount
  useEffect(() => {
    clearUnread();
  }, []);

  // Also clear unread whenever entries change while this component is mounted
  useEffect(() => {
    clearUnread();
  }, [entries.length]);

  // Auto-scroll when new entries arrive, if user is at bottom
  useEffect(() => {
    if (isAtBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  function handleScroll() {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    isAtBottomRef.current = scrollTop + clientHeight >= scrollHeight - 50;
  }

  const sessionDate = entries.length > 0
    ? new Date(entries[0].timestamp).toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })
    : new Date().toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });

  const sessionTime = entries.length > 0
    ? new Date(entries[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        SESSION LOG — {sessionDate}{sessionTime ? ` ${sessionTime}` : ''}
      </div>
      <div ref={listRef} style={styles.list} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <div style={{ color: colors.textDark, textAlign: 'center', padding: '24px', fontSize: '11px' }}>
            No log entries yet. Activity will appear here as agents work.
          </div>
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>
      <div style={styles.footer}>
        <div style={styles.liveDot} />
        <span style={styles.footerText}>Live — auto-scrolling</span>
        <span style={{ ...styles.footerText, marginLeft: 'auto' }}>{entries.length} entries</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/LogViewer/LogViewer.tsx
git commit -m "feat: add LogViewer component with live-scrolling transcript"
```

---

### Task 6: Add Log Flush IPC Channel

**Files:**
- Modify: `shared/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc/phase-handlers.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Add IPC channel constant and API method**

In `shared/types.ts`, add the new IPC channel inside `IPC_CHANNELS` (after the `WARROOM_INTRO_DONE` line):

```typescript
  // Logs
  FLUSH_LOGS: 'office:flush-logs',
```

In the `OfficeAPI` interface, add after `warRoomIntroDone`:

```typescript
  // Logs
  flushLogs(logText: string): Promise<void>;
```

- [ ] **Step 2: Expose in preload**

In `electron/preload.ts`, add at the end of the `contextBridge.exposeInMainWorld('office', { ... })` object, after the `warRoomIntroDone` line:

```typescript
  // Logs
  flushLogs: (logText: string) => ipcRenderer.invoke(IPC_CHANNELS.FLUSH_LOGS, logText),
```

- [ ] **Step 3: Register the IPC handler**

In `electron/ipc/phase-handlers.ts`, add an import for `fs` and `path` at the top (if not already imported), then add a handler inside the `initPhaseHandlers` function:

```typescript
  ipcMain.handle(IPC_CHANNELS.FLUSH_LOGS, async (_event, logText: string) => {
    if (!currentProjectDir || !logText) return;
    const date = new Date().toISOString().slice(0, 10);
    const logPath = path.join(currentProjectDir, `session-${date}.log`);
    fs.appendFileSync(logPath, logText, 'utf-8');
  });
```

Import `currentProjectDir` from `./state` if not already imported.

- [ ] **Step 4: Flush logs on app close**

In `electron/main.ts`, in the `window-all-closed` handler, add log flushing before the `app.quit()` call. Since the renderer may already be destroyed at this point, the flush should be triggered by the renderer before the window closes. Add a `before-quit` handler instead:

In `electron/main.ts`, after the `app.whenReady()` block, add:

```typescript
app.on('before-quit', () => {
  // Send a signal to renderer to flush logs before quitting
  // The renderer listens for this and calls flushLogs()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('office:app-closing');
  }
});
```

The renderer will handle this in the OfficeView wiring (Task 8).

- [ ] **Step 5: Verify compilation**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts electron/preload.ts electron/ipc/phase-handlers.ts electron/main.ts
git commit -m "feat: add flush-logs IPC channel for .log file persistence"
```

---

### Task 7: Make ArtifactToolbox Phase-Aware

**Files:**
- Modify: `src/renderer/src/components/OfficeView/ArtifactToolbox.tsx`

- [ ] **Step 1: Refactor ArtifactToolbox to support both phases**

Replace the entire content of `src/renderer/src/components/OfficeView/ArtifactToolbox.tsx` with:

```tsx
import React from 'react';
import { useArtifactStore, type ArtifactInfo } from '../../stores/artifact.store';
import { useWarTableStore } from '../../stores/war-table.store';
import { useProjectStore } from '../../stores/project.store';
import { AGENT_COLORS } from '@shared/types';

// ── Shared styles ──

const toolboxStyle: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  background: 'rgba(15,15,26,0.92)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  zIndex: 10,
  minWidth: '140px',
};

const headerStyle: React.CSSProperties = {
  fontSize: '9px',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '0 4px 4px',
  borderBottom: '1px solid #222',
  fontWeight: 600,
};

function rowStyle(available: boolean, borderColor: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 6px',
    background: available ? '#1a1a2e' : 'transparent',
    border: available ? `1px solid ${borderColor}44` : '1px dashed #333',
    borderRadius: '4px',
    cursor: available ? 'pointer' : 'default',
    opacity: available ? 1 : 0.4,
    fontFamily: 'inherit',
  };
}

function agentInitials(role: string): string {
  return role.split('-').map((w) => w[0].toUpperCase()).join('');
}

// ── Imagine Artifacts ──

function ImagineToolbox() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const openArtifact = useArtifactStore((s) => s.openArtifact);
  const openDocument = useArtifactStore((s) => s.openDocument);
  const closeDocument = useArtifactStore((s) => s.closeDocument);

  const hasAny = artifacts.some((a) => a.available);
  if (!hasAny) return null;

  async function handleClick(artifact: ArtifactInfo) {
    if (!artifact.available) return;
    if (openArtifact?.key === artifact.key) {
      closeDocument();
      return;
    }
    const result = await window.office.readArtifact(artifact.filename);
    if ('content' in result) {
      openDocument(artifact.key, result.content);
    }
  }

  return (
    <div style={toolboxStyle}>
      <div style={headerStyle}>Artifacts</div>
      {artifacts.map((a) => {
        const color = AGENT_COLORS[a.agentRole];
        return (
          <div key={a.key} style={rowStyle(a.available, color)} onClick={() => handleClick(a)}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: a.available ? '#cbd5e1' : '#475569', fontWeight: 500, flex: 1 }}>
              {a.label}
            </span>
            <span style={{ fontSize: '8px', color: a.available ? color : '#475569' }}>
              {a.available ? agentInitials(a.agentRole) : '...'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── War Room Documents ──

interface WarRoomDoc {
  key: string;
  label: string;
  icon: string;
  filename: string;
  artifact: 'plan' | 'tasks';
}

const WAR_ROOM_DOCS: WarRoomDoc[] = [
  { key: 'milestones', label: 'Milestones', icon: '🎯', filename: 'milestones.md', artifact: 'plan' },
  { key: 'plan', label: 'Plan', icon: '🗺️', filename: 'plan.md', artifact: 'plan' },
  { key: 'tasks', label: 'Tasks', icon: '✅', filename: 'tasks.yaml', artifact: 'tasks' },
];

function WarRoomToolbox() {
  const reviewContent = useWarTableStore((s) => s.reviewContent);
  const reviewOpen = useWarTableStore((s) => s.reviewOpen);
  const setReviewContent = useWarTableStore((s) => s.setReviewContent);
  const closeReview = useWarTableStore((s) => s.closeReview);
  const visualState = useWarTableStore((s) => s.visualState);

  // Only show when war table has content
  const hasContent = visualState !== 'empty';
  if (!hasContent) return null;

  async function handleClick(doc: WarRoomDoc) {
    // Toggle if already open
    if (reviewOpen) {
      closeReview();
      return;
    }
    const result = await window.office.readArtifact(doc.filename);
    if ('content' in result) {
      setReviewContent(result.content, doc.artifact);
    }
  }

  const available = visualState === 'review' || visualState === 'complete' || visualState === 'persisted';
  const borderColor = '#0ea5e9';

  return (
    <div style={toolboxStyle}>
      <div style={headerStyle}>War Room</div>
      {WAR_ROOM_DOCS.map((doc) => (
        <div
          key={doc.key}
          style={rowStyle(available, borderColor)}
          onClick={() => available && handleClick(doc)}
        >
          <span style={{ fontSize: '10px', width: '14px', textAlign: 'center' }}>{doc.icon}</span>
          <span style={{ fontSize: '10px', color: available ? '#cbd5e1' : '#475569', fontWeight: 500, flex: 1 }}>
            {doc.label}
          </span>
          <span style={{ fontSize: '8px', color: available ? '#0ea5e9' : '#475569' }}>
            {available ? 'PM' : '...'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Phase-Aware Wrapper ──

export function ArtifactToolbox() {
  const phase = useProjectStore((s) => s.projectState?.currentPhase ?? 'idle');

  if (phase === 'imagine') return <ImagineToolbox />;
  if (phase === 'warroom') return <WarRoomToolbox />;
  return null;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/OfficeView/ArtifactToolbox.tsx
git commit -m "feat: make ArtifactToolbox phase-aware with war room documents"
```

---

### Task 8: Wire Everything into OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

This is the integration task — adding the icon rail, content switcher, log wiring, and removing old navigation.

- [ ] **Step 1: Add imports**

At the top of `OfficeView.tsx`, add these imports (alongside existing ones):

```typescript
import { IconRail } from '../IconRail/IconRail';
import { LogViewer } from '../LogViewer/LogViewer';
import { AboutPanel } from '../AboutPanel/AboutPanel';
import { useLogStore } from '../../stores/log.store';
```

Remove the `TabBar` import:

```typescript
// DELETE: import { TabBar } from '../TabBar/TabBar';
```

- [ ] **Step 2: Wire log store to agent events and chat messages**

Inside the `OfficeView` component function, add effect hooks to feed the log store. Add these after the existing `useEffect` blocks:

```typescript
  // Feed log store from agent events
  useEffect(() => {
    const unsub = window.office.onAgentEvent((event) => {
      useLogStore.getState().logAgentEvent(event);
    });
    return unsub;
  }, []);

  // Feed log store from chat messages
  useEffect(() => {
    const unsub = window.office.onChatMessage((msg) => {
      if (msg.role === 'agent' && msg.agentRole) {
        // Agent messages are already logged via agent events, skip duplicates
      } else if (msg.role === 'user') {
        useLogStore.getState().logMessage('user', msg.text);
      }
    });
    return unsub;
  }, []);

  // Log phase transitions
  useEffect(() => {
    if (phase && phase !== 'idle') {
      useLogStore.getState().logPhaseTransition(phase);
    }
  }, [phase]);

  // Flush logs on phase transitions
  useEffect(() => {
    const unsub = window.office.onPhaseChange(async () => {
      const logText = useLogStore.getState().serializeUnflushed();
      if (logText) {
        await window.office.flushLogs(logText);
        useLogStore.getState().markFlushed();
      }
    });
    return unsub;
  }, []);

  // Flush logs on app closing
  useEffect(() => {
    const handler = async () => {
      const logText = useLogStore.getState().serializeUnflushed();
      if (logText) {
        await window.office.flushLogs(logText);
        useLogStore.getState().markFlushed();
      }
    };
    // Listen for the app-closing signal from main process
    const ipcHandler = () => { handler(); };
    window.addEventListener('beforeunload', ipcHandler);
    return () => window.removeEventListener('beforeunload', ipcHandler);
  }, []);

  // Clear unread when switching to logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      useLogStore.getState().clearUnread();
    }
  }, [activeTab]);
```

- [ ] **Step 3: Update the "back to project picker" handler to flush logs**

Find the existing back button `onClick` handler and add log flushing:

Replace:
```typescript
            onClick={() => {
              useChatStore.getState().clearMessages();
              useArtifactStore.getState().reset();
              useWarTableStore.getState().reset();
              useProjectStore.getState().setProjectState(null);
            }}
```

With:
```typescript
            onClick={async () => {
              // Flush logs before leaving
              const logText = useLogStore.getState().serializeUnflushed();
              if (logText) {
                await window.office.flushLogs(logText);
                useLogStore.getState().markFlushed();
              }
              useLogStore.getState().reset();
              useChatStore.getState().clearMessages();
              useArtifactStore.getState().reset();
              useWarTableStore.getState().reset();
              useProjectStore.getState().setProjectState(null);
            }}
```

- [ ] **Step 4: Remove the ⊞ agents button from top bar**

Delete the entire agents button block from the top bar (the `<button>` with `⊞`):

Remove:
```tsx
        <button
          onClick={() => {
            if (!isExpanded) toggleExpanded();
            setTimeout(() => useUIStore.getState().setActiveTab('agents'), 50);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 13,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'inherit',
          }}
          title="View agents"
        >
          ⊞
        </button>
```

- [ ] **Step 5: Restructure the main area with icon rail and content switcher**

Replace the entire `{/* Main area */}` section (from `<div style={{ ...styles.main, position: 'relative' }}>` to its closing `</div>`) with the new layout that includes the icon rail:

```tsx
      {/* Main area */}
      <div style={{ ...styles.main, position: 'relative' }}>
        {/* Icon Rail — always visible */}
        <IconRail activeTab={activeTab} onTabChange={setActiveTab} />

        {/* PixiJS canvas -- single instance, always mounted */}
        <div style={{
          ...styles.canvasArea,
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          left: activeTab === 'office'
            ? 40  // rail only
            : isExpanded
              ? 40  // rail only, canvas hidden behind panel
              : 380, // rail(40) + panel(320) + chevron(20)
          zIndex: 0,
          visibility: isExpanded && activeTab !== 'office' ? 'hidden' : 'visible',
        }}>
          <OfficeCanvas onSceneReady={handleSceneReady} />
          <ArtifactToolbox />
          <AudioControls />
          <ArtifactOverlay />
          <PlanOverlay />
          {showIntro && (
            <IntroSequence
              steps={CEO_INTRO_STEPS}
              speaker="CEO"
              onComplete={handleIntroComplete}
              onHighlightChange={handleHighlightChange}
              onChatHighlightChange={handleChatHighlightChange}
              onStepChange={handleStepChange}
            />
          )}
          {showWarRoomIntro && showWarRoomDialog && (
            <IntroSequence
              steps={warRoomSteps}
              speaker={WARROOM_SPEAKER}
              speakerColor={WARROOM_SPEAKER_COLOR}
              onComplete={handleWarRoomIntroComplete}
              onHighlightChange={handleWarRoomHighlightChange}
              onChatHighlightChange={() => {}}
              onStepChange={() => {}}
            />
          )}
        </div>

        {activeTab !== 'office' && (
          <>
            {isExpanded ? (
              <>
                {/* Collapse chevron */}
                <button
                  style={{ ...styles.chevronButton, zIndex: 2, position: 'relative' }}
                  onClick={toggleExpanded}
                  title="Collapse to side-by-side"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2a2a4a';
                    e.currentTarget.style.color = '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.surface;
                    e.currentTarget.style.color = '#666';
                  }}
                >
                  ‹
                </button>

                {/* Expanded content area */}
                <div style={{ ...styles.expandedContent, zIndex: 1 }}>
                  {/* Chat tab */}
                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'chat' ? 'flex' : 'none',
                  }}>
                    <ChatPanel isExpanded={true} />
                  </div>

                  {/* Agents tab */}
                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'agents' ? 'flex' : 'none',
                  }}>
                    <AgentsScreen />
                  </div>

                  {/* Logs tab */}
                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'logs' ? 'flex' : 'none',
                  }}>
                    <LogViewer />
                  </div>

                  {/* About tab */}
                  <div style={{
                    ...styles.expandedChatPanel,
                    display: activeTab === 'about' ? 'flex' : 'none',
                  }}>
                    <AboutPanel />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Collapsed: show active panel in 320px */}
                <div style={{
                  display: activeTab === 'chat' ? 'flex' : 'none',
                  flexDirection: 'column',
                  width: '320px',
                  minWidth: '320px',
                  zIndex: 1,
                  position: 'relative',
                }}>
                  <ChatPanel
                    isExpanded={false}
                    highlightClassName={introChatHighlight ? 'chat-panel-highlight' : undefined}
                  />
                </div>

                <div style={{
                  display: activeTab === 'agents' ? 'flex' : 'none',
                  flexDirection: 'column',
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative',
                }}>
                  <AgentsScreen />
                </div>

                <div style={{
                  display: activeTab === 'logs' ? 'flex' : 'none',
                  flexDirection: 'column',
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative',
                }}>
                  <LogViewer />
                </div>

                <div style={{
                  display: activeTab === 'about' ? 'flex' : 'none',
                  flexDirection: 'column',
                  width: '320px',
                  minWidth: '320px',
                  overflow: 'hidden',
                  background: colors.bg,
                  borderRight: `1px solid ${colors.border}`,
                  zIndex: 1,
                  position: 'relative',
                }}>
                  <AboutPanel />
                </div>

                {/* Expand chevron */}
                <button
                  style={{ ...styles.chevronButton, zIndex: 1, position: 'relative' }}
                  onClick={toggleExpanded}
                  title="Expand to full width"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#2a2a4a';
                    e.currentTarget.style.color = '#e5e5e5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.surface;
                    e.currentTarget.style.color = '#666';
                  }}
                >
                  ›
                </button>
              </>
            )}
          </>
        )}
      </div>
```

- [ ] **Step 6: Update the character view-details handler**

The existing `handleViewDetails` effect expands and switches to agents tab. Update it to work without `toggleExpanded` needing the agents tab — just set the tab directly:

Find:
```typescript
      if (!isExpanded) toggleExpanded();
      setTimeout(() => useUIStore.getState().setActiveTab('agents'), 50);
```

Replace:
```typescript
      useUIStore.getState().setActiveTab('agents');
```

The icon rail now handles navigation — no need to force expand to see agents.

- [ ] **Step 7: Verify compilation**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: integrate icon rail, content switcher, log wiring into OfficeView"
```

---

### Task 9: Remove TabBar Component

**Files:**
- Modify: `src/renderer/src/components/TabBar/TabBar.tsx`

- [ ] **Step 1: Delete or empty TabBar**

Since the icon rail replaces TabBar, and OfficeView no longer imports it, delete the file:

```bash
rm src/renderer/src/components/TabBar/TabBar.tsx
```

If other files import it, the TypeScript check will catch that. Run:

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit`
Expected: No errors (TabBar import was removed in Task 8)

- [ ] **Step 2: Commit**

```bash
git add -A src/renderer/src/components/TabBar/
git commit -m "refactor: remove TabBar component (replaced by IconRail)"
```

---

### Task 10: Handle AgentsScreen in Narrow Layout

**Files:**
- Modify: `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx`

The AgentsScreen currently has `paddingTop: '48px'` (for the old floating TabBar). This needs adjustment since the TabBar is gone.

- [ ] **Step 1: Remove paddingTop and adjust for narrow layout**

In `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx`, update the root style:

Replace:
```typescript
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: '#0f0f1a',
    overflow: 'hidden',
    paddingTop: '48px',
  },
```

With:
```typescript
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: '#0f0f1a',
    overflow: 'hidden',
    paddingTop: '8px',
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/AgentsScreen/AgentsScreen.tsx
git commit -m "fix: adjust AgentsScreen padding after TabBar removal"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Type check**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Build check**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run existing tests**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 4: Manual verification checklist**

Launch the app and verify:
- [ ] Icon rail visible on left (40px) with 5 icons + divider
- [ ] Chat icon active by default, chat panel shows
- [ ] Clicking Office icon hides panel, canvas goes full-width
- [ ] Clicking Agents shows agent grid in 320px panel
- [ ] Clicking Logs shows empty log viewer with "No log entries yet"
- [ ] Clicking About shows app info with expandable phase cards
- [ ] Chevron still works for expand/collapse
- [ ] Tooltips appear on icon hover
- [ ] Agent activity badge appears when agents are active
- [ ] ArtifactToolbox shows "Artifacts" in imagine phase
- [ ] ArtifactToolbox shows "War Room" with 🎯🗺️✅ icons in warroom phase
- [ ] Log entries appear in real-time as agents work
- [ ] Log auto-scrolls; pauses when user scrolls up
- [ ] `.log` file created in project directory after phase transition
- [ ] No ⊞ button in top bar
- [ ] No floating TabBar in expanded mode
