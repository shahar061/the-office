# Refactor: KISS, DRY, YAGNI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve readability by splitting large files, removing dead code, and centralizing shared constants.

**Architecture:** Extract sub-components from 3 large files (OfficeView 1089→~150 lines, ProjectPicker 672→~120 lines, electron/main.ts 583→~80 lines). Create shared theme.ts for colors and utils.ts for helpers. No architectural changes — same stores, same PixiJS engine, same types.

**Tech Stack:** React, TypeScript, Zustand, PixiJS, Electron

**Spec:** `docs/superpowers/specs/2026-03-28-refactor-kiss-dry-yagni-design.md`

---

### Task 1: Dead Code Removal

**Files:**
- Delete: `src/renderer/src/office/ui/SpeechBubble.ts`
- Delete: `src/renderer/src/office/ui/AgentLabel.ts`
- Modify: `src/renderer/src/office/characters/agents.config.ts:75-77`

- [ ] **Step 1: Delete unused files**

```bash
rm src/renderer/src/office/ui/SpeechBubble.ts
rm src/renderer/src/office/ui/AgentLabel.ts
rmdir src/renderer/src/office/ui  # remove empty directory
```

- [ ] **Step 2: Remove `getAgentConfig` from agents.config.ts**

Remove lines 75-77 from `src/renderer/src/office/characters/agents.config.ts`:

```typescript
// DELETE these lines:
export function getAgentConfig(role: AgentRole): AgentConfig {
  return AGENT_CONFIGS[role];
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All existing tests pass (nothing imports deleted code).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove dead code (SpeechBubble, AgentLabel, getAgentConfig)"
```

---

### Task 2: Create Shared Theme and Utils

**Files:**
- Create: `src/renderer/src/theme.ts`
- Create: `src/renderer/src/utils.ts`

- [ ] **Step 1: Create theme.ts**

Create `src/renderer/src/theme.ts`:

```typescript
export const colors = {
  bg: '#0f0f1a',
  bgDark: '#0d0d1a',
  surface: '#1a1a2e',
  surfaceLight: '#151528',
  surfaceDark: '#111122',
  border: '#333',
  borderLight: '#2a2a3a',
  text: '#e2e8f0',
  textLight: '#cbd5e1',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  textDark: '#4b5563',
  accent: '#3b82f6',
  accentPurple: '#6366f1',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
} as const;
```

- [ ] **Step 2: Create utils.ts**

Create `src/renderer/src/utils.ts`:

```typescript
export function agentDisplayName(role: string): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatAge(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/theme.ts src/renderer/src/utils.ts
git commit -m "refactor: add shared theme.ts and utils.ts"
```

---

### Task 3: Extract MessageBubble Component

**Files:**
- Create: `src/renderer/src/components/OfficeView/MessageBubble.tsx`
- Reference: `src/renderer/src/components/OfficeView/OfficeView.tsx:646-695` (the `renderMessage` function)

Extract the `renderMessage` function into a standalone component. It renders a single chat message with sender label, text content, timestamp, and waiting indicator.

- [ ] **Step 1: Create MessageBubble.tsx**

Create `src/renderer/src/components/OfficeView/MessageBubble.tsx` containing:
- The `MessageBubble` component that accepts props: `msg: ChatMessage`, `isWaiting: boolean`
- Import `agentDisplayName` and `formatTime` from `../../utils`
- Import `AGENT_COLORS` from `@shared/types`
- Import `MessageRenderer` from `./MessageRenderer`
- Include only the styles it needs: `messageBubble`, `messageSender`, `messageTimestamp`
- Compute `senderLabel`, `accentColor`, `senderColor` from `msg.role` and `msg.agentRole`
- The `hasQuestionBubble` check stays in the parent (ChatPanel) — MessageBubble just receives `isWaiting: boolean`

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep MessageBubble` — should show no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/OfficeView/MessageBubble.tsx
git commit -m "refactor: extract MessageBubble component from OfficeView"
```

---

### Task 4: Extract QuestionBubble Component

**Files:**
- Create: `src/renderer/src/components/OfficeView/QuestionBubble.tsx`
- Reference: `src/renderer/src/components/OfficeView/OfficeView.tsx:740-814` (the `renderQuestionBubble` function)

Extract question rendering into a standalone component. Handles both compact (label buttons) and expanded (rich cards with descriptions/tradeoffs) modes.

- [ ] **Step 1: Create QuestionBubble.tsx**

Create `src/renderer/src/components/OfficeView/QuestionBubble.tsx` containing:
- Props: `question: AskQuestion`, `accentColor: string`, `isExpanded: boolean`, `onSelect: (label: string) => void`
- Import `AskQuestion` type from `@shared/types`
- Include only its styles: `questionBubble`, `questionText`, `questionOption`, `questionOptionsGrid`, `questionHint`, `expandedQuestionCard`, `expandedCardLabel`, `expandedCardDescription`, `expandedCardTradeoffs`, `expandedCardBadge`
- The guard check (`waitingForResponse && waitingQuestions.length > 0`) stays in the parent — QuestionBubble always renders when it receives a question

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/QuestionBubble.tsx
git commit -m "refactor: extract QuestionBubble component from OfficeView"
```

---

### Task 5: Extract PhaseActionButton Component

**Files:**
- Create: `src/renderer/src/components/OfficeView/PhaseActionButton.tsx`
- Reference: `src/renderer/src/components/OfficeView/OfficeView.tsx:697-738` (the `renderPhaseAction` function)

Self-contained component that reads phase state from the project store and renders "Continue to War Room" or "Continue to Build" when appropriate.

- [ ] **Step 1: Create PhaseActionButton.tsx**

Create `src/renderer/src/components/OfficeView/PhaseActionButton.tsx` containing:
- Reads `currentPhase` and `projectState` from `useProjectStore`
- Internal `useState` for `starting` loading state
- Returns `null` if phase status is not 'completed' or phase is not 'imagine'/'warroom'
- Renders centered button with appropriate label and click handler
- Import `colors` from `../../theme` for button colors
- Calls `window.office.startWarroom()` or `window.office.startBuild()` on click

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/PhaseActionButton.tsx
git commit -m "refactor: extract PhaseActionButton component from OfficeView"
```

---

### Task 6: Extract useIntro Hook

**Files:**
- Create: `src/renderer/src/components/OfficeView/useIntro.ts`
- Reference: `src/renderer/src/components/OfficeView/OfficeView.tsx:367-417,480-492` (intro state and camera setup)

Custom hook encapsulating all intro sequence state and logic.

- [ ] **Step 1: Create useIntro.ts**

Create `src/renderer/src/components/OfficeView/useIntro.ts` containing:
- Accepts `projectState` and `phase` as parameters
- Manages: `introHighlights`, `introChatHighlight`, `showIntro`, `showIntroRef`
- Provides: `handleIntroComplete(officeScene)`, `handleHighlightChange`, `handleChatHighlightChange`
- Contains the `useEffect` that snaps camera + spawns CEO when `showIntro && officeScene` are ready
- Contains the `onSceneReady` callback that does immediate camera/CEO setup via ref
- Returns: `{ showIntro, introHighlights, introChatHighlight, handleIntroComplete, handleHighlightChange, handleChatHighlightChange, setupIntroScene }`
- `setupIntroScene(scene)` is called from handleSceneReady in OfficeView

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/useIntro.ts
git commit -m "refactor: extract useIntro hook from OfficeView"
```

---

### Task 7: Extract ChatPanel Component

**Files:**
- Create: `src/renderer/src/components/OfficeView/ChatPanel.tsx`
- Reference: `src/renderer/src/components/OfficeView/OfficeView.tsx` — message list, archived runs, input, question bubble, phase action

The largest extraction. ChatPanel owns the message list, input, archived runs, and renders MessageBubble, QuestionBubble, and PhaseActionButton.

- [ ] **Step 1: Create ChatPanel.tsx**

Create `src/renderer/src/components/OfficeView/ChatPanel.tsx` containing:
- Reads from `useChatStore`: messages, archivedRuns, waitingForResponse, waitingAgentRole, waitingSessionId, waitingQuestions, addMessage, setWaiting
- Reads from `useProjectStore`: projectState (for isIdle check)
- Props: `isExpanded: boolean`, `highlightClassName?: string`
- Owns state: `inputValue`, `expandedArchived`
- Owns refs: `messagesEndRef`, `inputRef`
- Contains: `handleSend`, `handleKeyDown`, `toggleArchived`
- Auto-scroll effect on messages change
- Agent waiting listener effect
- Renders: message list with `MessageBubble`, `QuestionBubble`, `PhaseActionButton`, archived runs, input area
- Styles: `chatPanel`, `messageList`, `emptyState`, `emptyTitle`, `emptySubtitle`, `inputArea`, `inputRow`, `inputField`, `sendButton`, `expandedChatPanel`, `expandedInputRow`
- Import `agentDisplayName` from `../../utils`
- Import `AGENT_COLORS` from `@shared/types`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/ChatPanel.tsx
git commit -m "refactor: extract ChatPanel component from OfficeView"
```

---

### Task 8: Slim Down OfficeView.tsx

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

Replace all extracted code with imports of the new components and hook. OfficeView becomes a layout shell only.

- [ ] **Step 1: Rewrite OfficeView.tsx**

Rewrite `src/renderer/src/components/OfficeView/OfficeView.tsx` to:
- Import: `ChatPanel`, `PhaseTracker`, `IntroSequence`, `OfficeCanvas`, `ArtifactToolbox`, `ArtifactOverlay`, `AgentsScreen`, `TabBar`, `PermissionPrompt`, `useIntro`
- Import: `useProjectStore`, `useUIStore`, `useChatStore`, `useArtifactStore`, `useAgentsStore`
- Import: `useSceneSync`, `OfficeScene`
- Import: `agentDisplayName` from `../../utils`, `colors` from `../../theme`
- State: `officeScene`
- Use `useIntro` hook for intro state
- Use `useUIStore` for expanded/activeTab
- Keep: artifact click handler effect, character view-details effect, chat history load effect
- Keep: `handleSceneReady` (calls `setOfficeScene` + `setupIntroScene`)
- Keep: top bar, phase tracker, CSS keyframes
- Keep: `isExpanded` conditional layout — but delegate chat rendering to `<ChatPanel>`
- Remove: all `renderMessage`, `renderQuestionBubble`, `renderPhaseAction`, `renderArchivedRuns` functions
- Remove: all chat-related state (inputValue, expandedArchived, phaseActionStarting, messagesEndRef, inputRef)
- Remove: all chat-related styles (messageBubble, messageSender, messageTimestamp, questionBubble, etc.)
- Keep styles: root, topBar, topBarLeft, projectName, phaseIndicator, authDot, main, chatPanel (container dimensions only), canvasArea, chevronButton, expandedContent, expandedChatPanel

Target: ~150 lines.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Manually verify the app**

Run: `npm run dev`
Verify: Chat panel, messages, questions, phase actions, intro sequence, expanded/collapsed toggle all work as before.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/OfficeView/
git commit -m "refactor: slim OfficeView.tsx to layout shell (~150 lines)"
```

---

### Task 9: Extract ProjectPicker Sub-Components

**Files:**
- Create: `src/renderer/src/components/ProjectPicker/ApiKeyPanel.tsx`
- Create: `src/renderer/src/components/ProjectPicker/RecentProjects.tsx`
- Create: `src/renderer/src/components/ProjectPicker/NewProjectForm.tsx`
- Modify: `src/renderer/src/components/ProjectPicker/ProjectPicker.tsx`

These are already defined as sub-components in the current file. Move each to its own file with its own styles.

- [ ] **Step 1: Create ApiKeyPanel.tsx**

Move the `ApiKeyPanel` function component (lines 257-315) and its related styles (`apiKeySection`, `row`, `input`, `inputFocused`, `btn`, `errorText`) to `src/renderer/src/components/ProjectPicker/ApiKeyPanel.tsx`.
- Import `useProjectStore` for `setAuthStatus`
- Import `Spinner` — define it locally (3 lines) or export from a shared location
- Export: `ApiKeyPanel` component with props `{ onConnected: () => void }`

- [ ] **Step 2: Create RecentProjects.tsx**

Move the `RecentProjects` function component (lines 327-385) and its related styles (`recentList`, `recentItem`, `recentItemHover`, `recentName`, `recentPath`, `recentTime`, `emptyState`) to `src/renderer/src/components/ProjectPicker/RecentProjects.tsx`.
- Import `formatAge`, `shortPath` from `../../utils`
- Import `ProjectInfo` type from `@shared/types`
- Export: `RecentProjects` component with existing props interface

- [ ] **Step 3: Create NewProjectForm.tsx**

Extract the new project form logic from ProjectPicker (lines 400-405 state, 465-491 handlers, 525-564 JSX) into `src/renderer/src/components/ProjectPicker/NewProjectForm.tsx`.
- Props: `{ connected: boolean, busy: boolean, onProjectOpened: (state: ProjectState) => void }`
- Owns state: `newName`, `newPath`, `newNameFocused`, `newError`, `creating`
- Owns handlers: `handlePickNewDir`, `handleCreateProject`
- Import `shortPath` from `../../utils`
- Include relevant styles: `row`, `input`, `inputFocused`, `btn`, `btnWide`, `pathChip`, `errorText`

- [ ] **Step 4: Slim down ProjectPicker.tsx**

Rewrite `ProjectPicker.tsx` as a layout shell:
- Import `ApiKeyPanel`, `RecentProjects`, `NewProjectForm`
- Import `formatAge`, `shortPath` from `../../utils` (if still needed)
- Keep: layout structure, logo, auth hint, open-project card, status bar, API key popover
- Remove: all sub-component definitions, their styles, and helper functions that moved to utils.ts
- Target: ~120 lines

- [ ] **Step 5: Run tests and verify**

Run: `npx vitest run`
Run: `npm run dev` — verify project picker works: create, open, recent projects, API key flow.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ProjectPicker/
git commit -m "refactor: split ProjectPicker into sub-components (~120 lines)"
```

---

### Task 10: Split electron/main.ts

**Files:**
- Create: `electron/ipc/state.ts`
- Create: `electron/ipc/auth-handlers.ts`
- Create: `electron/ipc/project-handlers.ts`
- Create: `electron/ipc/phase-handlers.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create electron/ipc/state.ts**

Create `electron/ipc/state.ts` — shared mutable runtime state:

```typescript
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { ProjectManager } from '../project/project-manager';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import { AuthManager } from '../auth/auth-manager';
import { PhaseMachine } from '../orchestrator/phase-machine';
import { PermissionHandler } from '../sdk/permission-handler';
import type { AgentRole, Phase, SessionStats } from '../../shared/types';

export const dataDir = path.join(app.getPath('userData'), 'the-office');
export const agentsDir = path.join(__dirname, '../../../agents');

export const authManager = new AuthManager(dataDir);
export const projectManager = new ProjectManager(dataDir);

export let mainWindow: BrowserWindow | null = null;
export let currentProjectDir: string | null = null;
export let artifactStore: ArtifactStore | null = null;
export let chatHistoryStore: ChatHistoryStore | null = null;
export let phaseMachine: PhaseMachine | null = null;
export let permissionHandler: PermissionHandler | null = null;
export let activeAbort: (() => void) | null = null;
export let currentChatPhase: Phase | null = null;
export let currentChatAgentRole: AgentRole | null = null;
export let currentChatRunNumber: number = 0;
export let nextSessionId = 0;

export const sessionStats: SessionStats = {
  totalCost: 0,
  totalTokens: 0,
  sessionTime: 0,
  activeAgents: 0,
};

// Setters for mutable state (modules can't reassign imported `let` bindings)
export function setMainWindow(w: BrowserWindow | null) { mainWindow = w; }
export function setCurrentProjectDir(d: string | null) { currentProjectDir = d; }
export function setArtifactStore(s: ArtifactStore | null) { artifactStore = s; }
export function setChatHistoryStore(s: ChatHistoryStore | null) { chatHistoryStore = s; }
export function setPhaseMachine(p: PhaseMachine | null) { phaseMachine = p; }
export function setPermissionHandler(p: PermissionHandler | null) { permissionHandler = p; }
export function setActiveAbort(a: (() => void) | null) { activeAbort = a; }
export function setCurrentChatPhase(p: Phase | null) { currentChatPhase = p; }
export function setCurrentChatAgentRole(r: AgentRole | null) { currentChatAgentRole = r; }
export function setCurrentChatRunNumber(n: number) { currentChatRunNumber = n; }
export function incrementSessionId(): number { return ++nextSessionId; }

// Pending AskUserQuestion promises
export interface PendingQuestion {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
}
export const pendingQuestions = new Map<string, PendingQuestion>();
```

- [ ] **Step 2: Create shared IPC helpers**

Add helper functions to `electron/ipc/state.ts` (these are used by multiple handler modules):

```typescript
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/types';
import type { AgentEvent, AgentWaitingPayload, AskQuestion, ChatMessage } from '../../shared/types';

export function send(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

export function sendChat(msg: Omit<ChatMessage, 'id' | 'timestamp'>, persist: boolean = true): void {
  const chatMsg: ChatMessage = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...msg,
  };
  send(IPC_CHANNELS.CHAT_MESSAGE, chatMsg);

  if (persist && chatHistoryStore && currentChatPhase && currentChatRunNumber > 0) {
    const agentRole = msg.agentRole ?? currentChatAgentRole;
    if (agentRole) {
      chatHistoryStore.appendMessage(currentChatPhase, agentRole, currentChatRunNumber, chatMsg);
    }
  }
}

export function onSystemMessage(text: string): void {
  sendChat({ role: 'system', text });
}

export function rejectPendingQuestions(reason: string): void {
  for (const [, pending] of pendingQuestions) {
    pending.reject(new Error(reason));
  }
  pendingQuestions.clear();
}

export function onAgentEvent(event: AgentEvent): void {
  send(IPC_CHANNELS.AGENT_EVENT, event);

  if (event.type === 'agent:created' && event.isTopLevel && chatHistoryStore && currentChatPhase) {
    if (event.agentRole !== currentChatAgentRole) {
      currentChatAgentRole = event.agentRole;
      currentChatRunNumber = chatHistoryStore.nextRunNumber(currentChatPhase, event.agentRole);
    }
  }

  if (event.type === 'agent:message' && event.message) {
    sendChat({ role: 'agent', agentRole: event.agentRole, text: event.message });
  }

  if (event.type === 'agent:closed') {
    chatHistoryStore?.flush();
  }

  if (event.type === 'session:cost:update') {
    if (event.cost !== undefined) sessionStats.totalCost += event.cost;
    if (event.tokens !== undefined) sessionStats.totalTokens += event.tokens;
    send(IPC_CHANNELS.STATS_UPDATE, { ...sessionStats });
  }
}

export function handleAgentWaiting(agentRole: AgentRole, questions: AskQuestion[]): Promise<Record<string, string>> {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const sessionId = `session-${incrementSessionId()}`;
    pendingQuestions.set(sessionId, { resolve, reject });
    const payload: AgentWaitingPayload = { sessionId, agentRole, questions };
    send(IPC_CHANNELS.AGENT_WAITING, payload);
  });
}
```

- [ ] **Step 3: Create electron/ipc/auth-handlers.ts**

Create `electron/ipc/auth-handlers.ts`:

```typescript
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import { authManager, agentsDir, send } from './state';

export function initAuthHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_AUTH_STATUS, async () => {
    return authManager.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECT_API_KEY, async (_event, key: string) => {
    const result = authManager.connectApiKey(key);
    if (result.success) {
      send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.DISCONNECT, async () => {
    authManager.disconnect();
    send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
  });

  ipcMain.handle(IPC_CHANNELS.GET_AGENT_DEFINITIONS, async () => {
    const { loadAllAgents } = await import('../sdk/agent-loader');
    const agents = loadAllAgents(agentsDir);
    const result: Record<string, any> = {};
    for (const [name, def] of Object.entries(agents)) {
      result[name] = { name, description: def.description, prompt: def.prompt, tools: def.tools ?? [] };
    }
    return result;
  });
}
```

- [ ] **Step 4: Create electron/ipc/project-handlers.ts**

Create `electron/ipc/project-handlers.ts`:

```typescript
import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type { Phase } from '../../shared/types';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import {
  mainWindow, projectManager, currentProjectDir, artifactStore, chatHistoryStore,
  setCurrentProjectDir, setArtifactStore, setChatHistoryStore,
} from './state';

export function initProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return projectManager.getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_PROJECT, async (_event, projectPath: string) => {
    try {
      projectManager.openProject(projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_PROJECT, async (_event, name: string, projectPath: string) => {
    try {
      projectManager.createProject(name, projectPath);
      setCurrentProjectDir(projectPath);
      setArtifactStore(new ArtifactStore(projectPath));
      chatHistoryStore?.flush();
      setChatHistoryStore(new ChatHistoryStore(projectPath));
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create project';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PICK_DIRECTORY, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_STATE, async () => {
    if (!currentProjectDir) {
      return { name: '', path: '', currentPhase: 'idle', completedPhases: [], interrupted: false, introSeen: true };
    }
    return projectManager.getProjectState(currentProjectDir);
  });

  ipcMain.handle(IPC_CHANNELS.MARK_INTRO_SEEN, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    projectManager.updateProjectState(currentProjectDir, { introSeen: true });
  });

  ipcMain.handle(IPC_CHANNELS.GET_CHAT_HISTORY, async (_event, phase: string) => {
    if (!currentProjectDir || !chatHistoryStore) return [];
    return chatHistoryStore.getPhaseHistory(phase as Phase);
  });

  ipcMain.handle(IPC_CHANNELS.READ_ARTIFACT, async (_event, filename: string) => {
    if (!artifactStore) return { error: 'No project open' };
    try {
      const content = artifactStore.readArtifact(filename);
      return { content };
    } catch {
      return { error: 'Artifact not found' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_ARTIFACT_STATUS, async () => {
    if (!artifactStore) return {};
    const filenames = ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'];
    const status: Record<string, boolean> = {};
    for (const f of filenames) {
      try { artifactStore.readArtifact(f); status[f] = true; } catch { status[f] = false; }
    }
    return status;
  });
}
```

- [ ] **Step 5: Create electron/ipc/phase-handlers.ts**

Create `electron/ipc/phase-handlers.ts` — contains START_IMAGINE, START_WARROOM, START_BUILD, SEND_MESSAGE, USER_RESPONSE, RESPOND_PERMISSION, settings, and external link handlers.

Move the phase IPC handlers (lines 250-500 of current main.ts) into this file. Import state and helpers from `./state`. Use setter functions for mutable state assignments.

- [ ] **Step 6: Slim down electron/main.ts**

Rewrite `electron/main.ts` as app lifecycle shell:

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { IPC_CHANNELS } from '../shared/types';
import {
  mainWindow, setMainWindow, authManager, projectManager,
  phaseMachine, currentProjectDir, chatHistoryStore, activeAbort, setActiveAbort,
  send, rejectPendingQuestions,
} from './ipc/state';
import { initAuthHandlers } from './ipc/auth-handlers';
import { initProjectHandlers } from './ipc/project-handlers';
import { initPhaseHandlers } from './ipc/phase-handlers';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 640,
    title: 'The Office', backgroundColor: '#0f0f1a', fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => setMainWindow(null));
  setMainWindow(win);
}

function fixPath(): void {
  // ... keep existing fixPath implementation unchanged ...
}

app.whenReady().then(async () => {
  fixPath();
  createWindow();
  initAuthHandlers();
  initProjectHandlers();
  initPhaseHandlers();
  await authManager.detectCliAuth();
  send(IPC_CHANNELS.AUTH_STATUS_CHANGE, authManager.getStatus());
});

app.on('window-all-closed', () => {
  chatHistoryStore?.flush();
  if (phaseMachine && phaseMachine.currentPhase !== 'idle' && phaseMachine.currentPhase !== 'complete') {
    phaseMachine.markInterrupted();
    if (currentProjectDir) {
      projectManager.updateProjectState(currentProjectDir, { interrupted: true });
    }
  }
  if (activeAbort) { activeAbort(); setActiveAbort(null); }
  rejectPendingQuestions('App closing');
  app.quit();
});
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add electron/
git commit -m "refactor: split electron/main.ts into ipc handler modules (~80 lines)"
```

---

### Task 11: Replace Hardcoded Colors with Theme Constants

**Files:**
- Modify: All component files created/modified in previous tasks
- Reference: `src/renderer/src/theme.ts`

Go through each component file and replace hardcoded color strings with `colors.xxx` imports from theme.ts. Focus on the most commonly repeated values:

- `'#0f0f1a'` → `colors.bg`
- `'#0d0d1a'` → `colors.bgDark`
- `'#1a1a2e'` → `colors.surface`
- `'#333'` → `colors.border`
- `'#e2e8f0'` → `colors.text`
- `'#94a3b8'` → `colors.textMuted`
- `'#64748b'` → `colors.textDim`
- `'#3b82f6'` → `colors.accent`
- `'#22c55e'` → `colors.success`
- `'#ef4444'` → `colors.error`

Target files (in order):
1. `OfficeView.tsx` (remaining styles)
2. `ChatPanel.tsx`
3. `MessageBubble.tsx`
4. `QuestionBubble.tsx`
5. `PhaseActionButton.tsx`
6. `PhaseTracker.tsx`
7. `ProjectPicker.tsx`
8. `NewProjectForm.tsx`
9. `RecentProjects.tsx`
10. `ApiKeyPanel.tsx`

Do NOT change files outside the component layer (PixiJS engine, stores, electron). Only replace colors in component style objects.

- [ ] **Step 1: Add `import { colors } from '../../theme'` to each component and replace hardcoded values**

Work through each file, replacing string literals with theme constants. Only replace exact matches — don't change derived colors like `rgba(59,130,246,0.08)` or border compositions.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Verify: All screens look identical to before.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/
git commit -m "refactor: replace hardcoded colors with theme constants"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No new type errors (pre-existing ones from unrelated store imports are OK).

- [ ] **Step 3: Line count audit**

Verify key files are within target:
```bash
wc -l src/renderer/src/components/OfficeView/OfficeView.tsx  # target: ~150
wc -l src/renderer/src/components/ProjectPicker/ProjectPicker.tsx  # target: ~120
wc -l electron/main.ts  # target: ~80
```

- [ ] **Step 4: Manual smoke test**

Run `npm run dev` and verify:
- Create new project → intro plays (camera zoom, CEO sprite)
- Chat panel shows messages, questions, phase action buttons
- Expanded/collapsed toggle preserves canvas state
- Artifact clicks work
- Character popups follow and clamp correctly
- Phase transitions (imagine → warroom) work
