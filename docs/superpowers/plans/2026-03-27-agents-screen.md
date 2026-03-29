# Agents Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Agents screen accessible via a third tab and canvas character clicks, showing agent definitions in grid or org chart views with a detail panel.

**Architecture:** New IPC channel to load agent markdown definitions from disk. New Zustand store merges definitions with static config. AgentsScreen component with grid/org chart toggle and detail panel. Character click popup in PixiJS canvas navigates to agents tab.

**Tech Stack:** React, TypeScript, Zustand, PixiJS 8, Electron IPC

---

## File Structure

| File | Responsibility | Changed By |
|------|---------------|------------|
| `shared/types.ts` | New IPC channel, AgentDefinition type, OfficeAPI extension | Task 1 |
| `electron/main.ts` | IPC handler for GET_AGENT_DEFINITIONS | Task 1 |
| `electron/preload.ts` | Expose getAgentDefinitions() | Task 1 |
| `src/renderer/src/stores/ui.store.ts` | Extend activeTab to include 'agents' | Task 2 |
| `src/renderer/src/components/TabBar/TabBar.tsx` | Add agents tab | Task 2 |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Render AgentsScreen, TopBar agents button, character-click handler | Tasks 2, 6 |
| `src/renderer/src/stores/agents.store.ts` | New store for agent data + selection | Task 3 |
| `src/renderer/src/components/AgentsScreen/AgentCard.tsx` | Reusable agent card component | Task 3 |
| `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx` | Main container with view toggle | Task 3 |
| `src/renderer/src/components/AgentsScreen/AgentGrid.tsx` | Grid view grouped by role group | Task 3 |
| `src/renderer/src/components/AgentsScreen/AgentDetailPanel.tsx` | Slide-in detail panel | Task 4 |
| `src/renderer/src/components/AgentsScreen/AgentOrgChart.tsx` | Org chart view with tier layout | Task 5 |
| `src/renderer/src/office/characters/Character.ts` | Add click interactivity | Task 6 |
| `src/renderer/src/office/OfficeScene.ts` | Character popup management | Task 6 |

---

### Task 1: Data Layer — IPC Channel & Types

**Files:**
- Modify: `shared/types.ts`
- Modify: `electron/main.ts:36` (near existing IPC handlers)
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add AgentDefinition type and IPC channel**

In `shared/types.ts`, add the type after the existing `ArtifactAvailablePayload` interface (around line 150):

```typescript
export interface AgentDefinitionPayload {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
}
```

Add the new IPC channel to the `IPC_CHANNELS` object (after `GET_ARTIFACT_STATUS`):

```typescript
// Agents
GET_AGENT_DEFINITIONS: 'office:get-agent-definitions',
```

Add to the `OfficeAPI` interface (after `getArtifactStatus`):

```typescript
getAgentDefinitions(): Promise<Record<string, AgentDefinitionPayload>>;
```

- [ ] **Step 2: Add IPC handler in main.ts**

In `electron/main.ts`, add a new IPC handler. Find the section with other `ipcMain.handle` calls (around line 440, after the `OPEN_EXTERNAL` handler) and add:

```typescript
ipcMain.handle(IPC_CHANNELS.GET_AGENT_DEFINITIONS, async () => {
  const { loadAllAgents } = await import('./sdk/agent-loader');
  const agents = loadAllAgents(agentsDir);
  // Map to payload format with tools always as array
  const result: Record<string, any> = {};
  for (const [name, def] of Object.entries(agents)) {
    result[name] = {
      name,
      description: def.description,
      prompt: def.prompt,
      tools: def.tools ?? [],
    };
  }
  return result;
});
```

- [ ] **Step 3: Expose in preload.ts**

In `electron/preload.ts`, add after the `getArtifactStatus` line (line 70):

```typescript
// Agents
getAgentDefinitions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AGENT_DEFINITIONS),
```

Also add `AgentDefinitionPayload` to the type imports at the top of the file.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts electron/main.ts electron/preload.ts
git commit -m "feat: add GET_AGENT_DEFINITIONS IPC channel and types"
```

---

### Task 2: Navigation — Tab Bar & UI Store

**Files:**
- Modify: `src/renderer/src/stores/ui.store.ts`
- Modify: `src/renderer/src/components/TabBar/TabBar.tsx`
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Extend UI store activeTab type**

Replace the entire `src/renderer/src/stores/ui.store.ts` with:

```typescript
import { create } from 'zustand';

export type AppTab = 'chat' | 'office' | 'agents';

interface UIStore {
  isExpanded: boolean;
  activeTab: AppTab;
  toggleExpanded: () => void;
  setActiveTab: (tab: AppTab) => void;
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

- [ ] **Step 2: Update TabBar to include agents tab**

Replace the entire `src/renderer/src/components/TabBar/TabBar.tsx` with:

```typescript
import type { CSSProperties } from 'react';
import type { AppTab } from '../../stores/ui.store';

interface TabBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: { id: AppTab; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'office', label: 'OFFICE' },
  { id: 'agents', label: 'AGENTS' },
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

- [ ] **Step 3: Add agents button to TopBar and render placeholder AgentsScreen**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`:

**A)** Add an agents button in the TopBar, inside the `<div style={styles.topBar}>` block, right before the auth dot div. Add this button:

```typescript
<button
  onClick={() => {
    if (!isExpanded) toggleExpanded();
    // Small delay to let expansion happen, then switch tab
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

**B)** In the expanded content area, add the agents tab alongside the existing chat and office tabs. After the office tab `<div>` (the one with `display: activeTab === 'office'`), add:

```typescript
{/* Agents tab */}
<div style={{
  ...styles.expandedChatPanel,
  display: activeTab === 'agents' ? 'flex' : 'none',
  alignItems: 'center',
  justifyContent: 'center',
}}>
  <div style={{ color: '#64748b', fontSize: '14px' }}>
    Agents screen coming soon...
  </div>
</div>
```

This is a temporary placeholder — Task 3 will replace it with the real AgentsScreen component.

- [ ] **Step 4: Verify build and test navigation**

Run: `npm run build`
Expected: Clean build. The tab bar should now show CHAT | OFFICE | AGENTS. Clicking AGENTS in expanded mode shows the placeholder. The TopBar ⊞ button expands and switches to agents tab.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/ui.store.ts src/renderer/src/components/TabBar/TabBar.tsx src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: add agents tab to navigation and UI store"
```

---

### Task 3: Agents Store, Card & Grid View

**Files:**
- Create: `src/renderer/src/stores/agents.store.ts`
- Create: `src/renderer/src/components/AgentsScreen/AgentCard.tsx`
- Create: `src/renderer/src/components/AgentsScreen/AgentGrid.tsx`
- Create: `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx`
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx` (replace placeholder)

- [ ] **Step 1: Create the agents store**

Create `src/renderer/src/stores/agents.store.ts`:

```typescript
import { create } from 'zustand';
import type { AgentRole } from '../../../../shared/types';
import { AGENT_COLORS } from '../../../../shared/types';
import { AGENT_CONFIGS } from '../office/characters/agents.config';

import adamUrl from '../assets/characters/Adam_walk.png?url';
import alexUrl from '../assets/characters/Alex_walk.png?url';
import ameliaUrl from '../assets/characters/Amelia_walk.png?url';
import bobUrl from '../assets/characters/Bob_walk.png?url';

const SPRITE_SHEET_URLS: Record<string, string> = {
  adam: adamUrl,
  alex: alexUrl,
  amelia: ameliaUrl,
  bob: bobUrl,
};

export interface AgentInfo {
  role: AgentRole;
  displayName: string;
  description: string;
  prompt: string;
  tools: string[];
  color: string;
  group: 'leadership' | 'coordination' | 'engineering';
  spriteVariant: string;
  idleZone: string;
  spriteSheetUrl: string;
}

interface AgentsStore {
  agents: AgentInfo[];
  selectedAgent: AgentRole | null;
  loaded: boolean;
  loadAgents: () => Promise<void>;
  selectAgent: (role: AgentRole) => void;
  clearSelection: () => void;
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: [],
  selectedAgent: null,
  loaded: false,

  loadAgents: async () => {
    if (get().loaded) return;
    const defs = await window.office.getAgentDefinitions();
    const agents: AgentInfo[] = [];

    for (const [name, def] of Object.entries(defs)) {
      const config = AGENT_CONFIGS[name as AgentRole];
      if (!config) continue;

      agents.push({
        role: name as AgentRole,
        displayName: config.displayName,
        description: def.description,
        prompt: def.prompt,
        tools: def.tools,
        color: AGENT_COLORS[name as AgentRole],
        group: config.group,
        spriteVariant: config.spriteVariant,
        idleZone: config.idleZone,
        spriteSheetUrl: SPRITE_SHEET_URLS[config.spriteVariant] ?? '',
      });
    }

    set({ agents, loaded: true });
  },

  selectAgent: (role) => set({ selectedAgent: role }),
  clearSelection: () => set({ selectedAgent: null }),
}));
```

- [ ] **Step 2: Create AgentCard component**

Create `src/renderer/src/components/AgentsScreen/AgentCard.tsx`:

```typescript
import type { AgentInfo } from '../../stores/agents.store';

interface AgentCardProps {
  agent: AgentInfo;
  onClick: () => void;
  compact?: boolean;
}

const styles = {
  card: (color: string) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderLeft: `3px solid ${color}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    transition: 'border-color 0.15s, background 0.15s',
    width: '100%',
  }),
  sprite: {
    width: '32px',
    height: '64px',
    objectFit: 'none' as const,
    objectPosition: '0 0',
    imageRendering: 'pixelated' as const,
    flexShrink: 0,
    transform: 'scale(2)',
    transformOrigin: 'top left',
    marginRight: '20px',
  },
  spriteWrapper: {
    width: '32px',
    height: '48px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  name: (color: string) => ({
    fontSize: '13px',
    fontWeight: 700,
    color,
  }),
  description: {
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '180px',
  },
  group: {
    fontSize: '9px',
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  info: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
};

export function AgentCard({ agent, onClick, compact }: AgentCardProps) {
  return (
    <button style={styles.card(agent.color)} onClick={onClick}>
      <div style={styles.spriteWrapper}>
        <img
          src={agent.spriteSheetUrl}
          alt={agent.displayName}
          style={styles.sprite}
          draggable={false}
        />
      </div>
      <div style={styles.info}>
        <span style={styles.name(agent.color)}>{agent.displayName}</span>
        {!compact && <span style={styles.description}>{agent.description}</span>}
        <span style={styles.group}>{agent.group}</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Create AgentGrid component**

Create `src/renderer/src/components/AgentsScreen/AgentGrid.tsx`:

```typescript
import type { AgentInfo } from '../../stores/agents.store';
import { AgentCard } from './AgentCard';

interface AgentGridProps {
  agents: AgentInfo[];
  onSelect: (agent: AgentInfo) => void;
}

const GROUP_ORDER: { key: AgentInfo['group']; label: string }[] = [
  { key: 'leadership', label: 'Leadership' },
  { key: 'coordination', label: 'Coordination' },
  { key: 'engineering', label: 'Engineering' },
];

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    padding: '16px 24px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  groupHeader: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '10px',
  },
};

export function AgentGrid({ agents, onSelect }: AgentGridProps) {
  return (
    <div style={styles.container}>
      {GROUP_ORDER.map(({ key, label }) => {
        const groupAgents = agents.filter((a) => a.group === key);
        if (groupAgents.length === 0) return null;
        return (
          <div key={key}>
            <div style={styles.groupHeader}>{label}</div>
            <div style={styles.grid}>
              {groupAgents.map((agent) => (
                <AgentCard
                  key={agent.role}
                  agent={agent}
                  onClick={() => onSelect(agent)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create AgentsScreen container**

Create `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useAgentsStore } from '../../stores/agents.store';
import { AgentGrid } from './AgentGrid';
import { AgentDetailPanel } from './AgentDetailPanel';

type View = 'grid' | 'orgchart';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: '#0f0f1a',
    overflow: 'hidden',
    paddingTop: '48px',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 24px 0',
    flexShrink: 0,
  },
  toggle: {
    display: 'flex',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  toggleBtn: (active: boolean) => ({
    padding: '6px 16px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    background: active ? '#2a2a4a' : 'transparent',
    color: active ? '#e5e5e5' : '#666',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  }),
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
    fontSize: '14px',
  },
};

export function AgentsScreen() {
  const { agents, loaded, loadAgents, selectedAgent, selectAgent, clearSelection } = useAgentsStore();
  const [view, setView] = useState<View>('grid');

  useEffect(() => {
    loadAgents();
  }, []);

  const selectedInfo = selectedAgent
    ? agents.find((a) => a.role === selectedAgent) ?? null
    : null;

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div style={styles.toggle}>
          <button style={styles.toggleBtn(view === 'grid')} onClick={() => setView('grid')}>
            Grid
          </button>
          <button style={styles.toggleBtn(view === 'orgchart')} onClick={() => setView('orgchart')}>
            Org Chart
          </button>
        </div>
      </div>

      {!loaded ? (
        <div style={styles.placeholder}>Loading agents...</div>
      ) : view === 'grid' ? (
        <AgentGrid agents={agents} onSelect={(a) => selectAgent(a.role)} />
      ) : (
        <div style={styles.placeholder}>Org chart view coming next...</div>
      )}

      {selectedInfo && (
        <AgentDetailPanel agent={selectedInfo} onClose={clearSelection} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Replace placeholder in OfficeView with real AgentsScreen**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`:

Add import at the top:
```typescript
import { AgentsScreen } from '../AgentsScreen/AgentsScreen';
```

Replace the placeholder agents tab div (the one with "Agents screen coming soon...") with:

```typescript
{/* Agents tab */}
<div style={{
  ...styles.expandedChatPanel,
  display: activeTab === 'agents' ? 'flex' : 'none',
}}>
  <AgentsScreen />
</div>
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Clean build. Agents tab should show the grid with all 14 agents organized by group.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/stores/agents.store.ts src/renderer/src/components/AgentsScreen/ src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: add agents store, card component, and grid view"
```

---

### Task 4: Agent Detail Panel

**Files:**
- Create: `src/renderer/src/components/AgentsScreen/AgentDetailPanel.tsx`

- [ ] **Step 1: Create AgentDetailPanel component**

Create `src/renderer/src/components/AgentsScreen/AgentDetailPanel.tsx`:

```typescript
import { useState, useEffect } from 'react';
import type { AgentInfo } from '../../stores/agents.store';
import { MarkdownContent } from '../OfficeView/MarkdownContent';

interface AgentDetailPanelProps {
  agent: AgentInfo;
  onClose: () => void;
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  panel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    width: '400px',
    height: '100%',
    background: '#0f0f1a',
    borderLeft: '1px solid #333',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: (color: string) => ({
    padding: '20px 20px 16px',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexShrink: 0,
  }),
  spriteWrapper: {
    width: '48px',
    height: '64px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sprite: {
    width: '48px',
    height: '96px',
    objectFit: 'none' as const,
    objectPosition: '0 0',
    imageRendering: 'pixelated' as const,
    transform: 'scale(3)',
    transformOrigin: 'top left',
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: 0,
  },
  displayName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  badge: (color: string) => ({
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: 600,
    color,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  }),
  groupLabel: {
    fontSize: '11px',
    color: '#64748b',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '12px',
    right: '12px',
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px 8px',
    fontFamily: 'inherit',
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  description: {
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: 1.5,
  },
  toolsList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  toolPill: {
    padding: '3px 8px',
    fontSize: '10px',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#94a3b8',
  },
  metaRow: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  promptToggle: (color: string) => ({
    background: 'none',
    border: 'none',
    color,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    padding: '8px 0',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  }),
  promptContent: {
    background: '#111122',
    borderRadius: '8px',
    padding: '16px',
    maxHeight: '400px',
    overflowY: 'auto' as const,
  },
};

export function AgentDetailPanel({ agent, onClose }: AgentDetailPanelProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Reset prompt state when agent changes
  useEffect(() => {
    setPromptExpanded(false);
  }, [agent.role]);

  const groupLabel =
    agent.group === 'leadership' ? 'Leadership' :
    agent.group === 'coordination' ? 'Coordination' : 'Engineering';

  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={styles.panel}>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          ✕
        </button>

        <div style={styles.header(agent.color)}>
          <div style={styles.spriteWrapper}>
            <img
              src={agent.spriteSheetUrl}
              alt={agent.displayName}
              style={styles.sprite}
              draggable={false}
            />
          </div>
          <div style={styles.headerInfo}>
            <span style={styles.displayName}>{agent.displayName}</span>
            <span style={styles.badge(agent.color)}>{agent.role}</span>
            <span style={styles.groupLabel}>{groupLabel}</span>
          </div>
        </div>

        <div style={styles.body}>
          <div style={styles.section}>
            <span style={styles.sectionLabel}>Description</span>
            <span style={styles.description}>{agent.description}</span>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionLabel}>Tools</span>
            <div style={styles.toolsList}>
              {agent.tools.map((tool) => (
                <span key={tool} style={styles.toolPill}>{tool}</span>
              ))}
              {agent.tools.length === 0 && (
                <span style={{ fontSize: '12px', color: '#475569' }}>No tools defined</span>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <span style={styles.sectionLabel}>Details</span>
            <span style={styles.metaRow}>
              Sprite: {agent.spriteVariant} &nbsp;·&nbsp; Zone: {agent.idleZone}
            </span>
          </div>

          <div style={styles.section}>
            <button
              style={styles.promptToggle(agent.color)}
              onClick={() => setPromptExpanded(!promptExpanded)}
            >
              {promptExpanded ? '▼ Hide full prompt' : '▶ View full prompt'}
            </button>
            {promptExpanded && (
              <div style={styles.promptContent}>
                <MarkdownContent text={agent.prompt} role="agent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. Clicking an agent card in the grid opens the detail panel.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/AgentsScreen/AgentDetailPanel.tsx
git commit -m "feat: add agent detail panel with metadata and expandable prompt"
```

---

### Task 5: Org Chart View

**Files:**
- Create: `src/renderer/src/components/AgentsScreen/AgentOrgChart.tsx`
- Modify: `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx` (replace placeholder)

- [ ] **Step 1: Create AgentOrgChart component**

Create `src/renderer/src/components/AgentsScreen/AgentOrgChart.tsx`:

```typescript
import type { AgentInfo } from '../../stores/agents.store';
import type { AgentRole } from '../../../../../shared/types';

interface AgentOrgChartProps {
  agents: AgentInfo[];
  onSelect: (agent: AgentInfo) => void;
}

const TIERS: { label: string; roles: AgentRole[]; annotations?: Record<string, string> }[] = [
  {
    label: 'Leadership',
    roles: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
    annotations: {
      'ceo': 'Vision Brief',
      'product-manager': 'PRD',
      'market-researcher': 'Market Analysis',
      'chief-architect': 'System Design',
    },
  },
  {
    label: 'Coordination',
    roles: ['agent-organizer', 'project-manager', 'team-lead'],
  },
  {
    label: 'Engineering',
    roles: [
      'backend-engineer', 'frontend-engineer', 'mobile-developer',
      'ui-ux-expert', 'data-engineer', 'devops', 'automation-developer', 'freelancer',
    ],
  },
];

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  tier: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  tierLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  tierNodes: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: '10px',
  },
  connector: {
    width: '2px',
    height: '20px',
    background: '#333',
    margin: '0 auto',
  },
  node: (color: string) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '10px 14px',
    background: '#1a1a2e',
    border: `1px solid ${color}44`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
    minWidth: '90px',
  }),
  nodeSpriteWrapper: {
    width: '32px',
    height: '48px',
    overflow: 'hidden',
  },
  nodeSprite: {
    width: '32px',
    height: '64px',
    objectFit: 'none' as const,
    objectPosition: '0 0',
    imageRendering: 'pixelated' as const,
    transform: 'scale(2)',
    transformOrigin: 'top left',
  },
  nodeName: (color: string) => ({
    fontSize: '11px',
    fontWeight: 600,
    color,
    textAlign: 'center' as const,
  }),
  annotation: {
    fontSize: '9px',
    color: '#475569',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
};

export function AgentOrgChart({ agents, onSelect }: AgentOrgChartProps) {
  const agentMap = new Map(agents.map((a) => [a.role, a]));

  return (
    <div style={styles.container}>
      {TIERS.map((tier, i) => (
        <div key={tier.label}>
          {i > 0 && <div style={styles.connector} />}
          <div style={styles.tier}>
            <span style={styles.tierLabel}>{tier.label}</span>
            <div style={styles.tierNodes}>
              {tier.roles.map((role) => {
                const agent = agentMap.get(role);
                if (!agent) return null;
                const annotation = tier.annotations?.[role];
                return (
                  <button
                    key={role}
                    style={styles.node(agent.color)}
                    onClick={() => onSelect(agent)}
                  >
                    <div style={styles.nodeSpriteWrapper}>
                      <img
                        src={agent.spriteSheetUrl}
                        alt={agent.displayName}
                        style={styles.nodeSprite}
                        draggable={false}
                      />
                    </div>
                    <span style={styles.nodeName(agent.color)}>{agent.displayName}</span>
                    {annotation && <span style={styles.annotation}>{annotation} →</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire org chart into AgentsScreen**

In `src/renderer/src/components/AgentsScreen/AgentsScreen.tsx`, add import:

```typescript
import { AgentOrgChart } from './AgentOrgChart';
```

Replace the org chart placeholder line:
```typescript
<div style={styles.placeholder}>Org chart view coming next...</div>
```

With:
```typescript
<AgentOrgChart agents={agents} onSelect={(a) => selectAgent(a.role)} />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. The Grid/Org Chart toggle switches between views. Org chart shows 3 tiers with nodes and annotations.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/AgentsScreen/AgentOrgChart.tsx src/renderer/src/components/AgentsScreen/AgentsScreen.tsx
git commit -m "feat: add org chart view with tiered agent layout"
```

---

### Task 6: Canvas Character Popup

**Files:**
- Modify: `src/renderer/src/office/characters/Character.ts`
- Modify: `src/renderer/src/office/OfficeScene.ts`
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Add click interactivity to Character**

In `src/renderer/src/office/characters/Character.ts`, add a method to enable click handling. Add this after the `show()` method (around line 128):

```typescript
enableClick(): void {
  this.sprite.container.eventMode = 'static';
  this.sprite.container.cursor = 'pointer';
  this.sprite.container.on('pointertap', () => {
    window.dispatchEvent(new CustomEvent('character-click', {
      detail: { role: this.role, state: this.state },
    }));
  });
}
```

Update the `show()` method to call `enableClick()` after making the character visible. Add `this.enableClick();` right after `parent.addChild(this.sprite.container);` (line 124):

```typescript
show(parent: import('pixi.js').Container): void {
  if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  this.isVisible = true;
  this.sprite.setAlpha(0);
  parent.addChild(this.sprite.container);
  this.enableClick();
  this.fadeDirection = 'in';
  this.fadeDuration = 0.5;
  this.fadeElapsed = 0;
}
```

- [ ] **Step 2: Add character popup to OfficeScene**

In `src/renderer/src/office/OfficeScene.ts`, add imports at the top:

```typescript
import { Text, Graphics, Container as PixiContainer } from 'pixi.js';
```

Update the existing `import { Application, Assets, Container, Texture } from 'pixi.js'` to include `Graphics` and `Text` if not already there.

Add a character popup field to the class (after `private interactiveObjects!: InteractiveObjects;`):

```typescript
private characterPopup: PixiContainer | null = null;
```

Add a method to show the character popup:

```typescript
showCharacterPopup(role: AgentRole): void {
  this.dismissCharacterPopup();

  const character = this.characters.get(role);
  if (!character || !character.isVisible) return;

  const config = AGENT_CONFIGS[role];
  const color = parseInt(config.color.slice(1), 16);
  const pos = character.getPixelPosition();

  const popup = new Container();
  popup.label = 'character-popup';

  const bgW = 120;
  const bgH = 52;
  const bg = new Graphics();
  bg.setStrokeStyle({ width: 1, color });
  bg.roundRect(0, 0, bgW, bgH, 4);
  bg.fill({ color: 0x1a1a2e, alpha: 0.95 });
  bg.stroke();

  const nameText = new Text({
    text: config.displayName,
    style: { fontSize: 9, fill: config.color, fontWeight: 'bold', fontFamily: 'monospace' },
  });
  nameText.x = 8;
  nameText.y = 6;

  const stateText = new Text({
    text: character.getState(),
    style: { fontSize: 8, fill: '#94a3b8', fontFamily: 'monospace' },
  });
  stateText.x = 8;
  stateText.y = 20;

  const linkText = new Text({
    text: 'View details →',
    style: { fontSize: 8, fill: '#6366f1', fontFamily: 'monospace' },
  });
  linkText.x = 8;
  linkText.y = 35;
  linkText.eventMode = 'static';
  linkText.cursor = 'pointer';
  linkText.on('pointertap', () => {
    window.dispatchEvent(new CustomEvent('character-view-details', { detail: { role } }));
  });

  popup.addChild(bg, nameText, stateText, linkText);

  // Position above character
  popup.x = pos.x - bgW / 2;
  popup.y = pos.y - 48 - bgH - 4;

  this.worldContainer.addChild(popup);
  this.characterPopup = popup;
}

dismissCharacterPopup(): void {
  if (this.characterPopup) {
    this.characterPopup.parent?.removeChild(this.characterPopup);
    this.characterPopup.destroy({ children: true });
    this.characterPopup = null;
  }
}
```

In the `init()` method, after the existing event listeners, add a listener for character clicks and canvas background clicks:

```typescript
// Character popup: show on character click, dismiss on background click
window.addEventListener('character-click', (e: Event) => {
  const { role } = (e as CustomEvent).detail;
  this.showCharacterPopup(role);
});

this.app.stage.eventMode = 'static';
this.app.stage.on('pointertap', () => {
  this.dismissCharacterPopup();
});
```

- [ ] **Step 3: Handle character-view-details in OfficeView**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, add a `useEffect` to listen for the `character-view-details` event (near the other event listeners around line 382):

```typescript
// Handle character view-details click from Pixi canvas
useEffect(() => {
  function handleViewDetails(e: Event) {
    const { role } = (e as CustomEvent).detail;
    const { selectAgent } = useAgentsStore.getState();
    selectAgent(role);
    if (!isExpanded) toggleExpanded();
    setTimeout(() => useUIStore.getState().setActiveTab('agents'), 50);
  }
  window.addEventListener('character-view-details', handleViewDetails);
  return () => window.removeEventListener('character-view-details', handleViewDetails);
}, [isExpanded, toggleExpanded]);
```

Add the import for `useAgentsStore` at the top of the file:
```typescript
import { useAgentsStore } from '../../stores/agents.store';
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build. Clicking a visible character in the canvas shows a popup. "View details" navigates to agents tab.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/office/characters/Character.ts src/renderer/src/office/OfficeScene.ts src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: add character click popup with view-details navigation"
```
