# Refactor: KISS, DRY, YAGNI Cleanup

**Date:** 2026-03-28
**Goal:** Improve readability and maintainability by splitting large files, removing dead code, and centralizing shared constants — without architectural changes.

## Principles

- **KISS:** Each file has one clear purpose. No file exceeds ~250 lines.
- **DRY:** Colors, helpers, and style patterns defined once. Components reference shared constants.
- **YAGNI:** Delete unused code. No new abstractions beyond what's needed.

## Not In Scope

- No new libraries or tooling
- No CSS modules (keep inline `const styles` pattern)
- No changes to stores, PixiJS engine, or shared/types.ts
- No architectural changes

---

## Step 1: Dead Code Removal

| Target | Action |
|--------|--------|
| `src/renderer/src/office/ui/SpeechBubble.ts` | Delete file (never imported) |
| `src/renderer/src/office/ui/AgentLabel.ts` | Delete file (never imported) |
| `getAgentConfig()` in `src/renderer/src/office/characters/agents.config.ts` | Remove function and export (never called) |
| `src/renderer/src/office/ui/` directory | Remove if empty after deletions |

---

## Step 2: Split OfficeView.tsx (1089 lines → 6 files)

All new files live in `src/renderer/src/components/OfficeView/`.

### OfficeView.tsx (~150 lines)
Layout shell only:
- `isExpanded` conditional layout (collapsed side-by-side vs expanded tabs)
- Single always-mounted canvas container
- Scene ready handler (`handleSceneReady`)
- Wires `ChatPanel`, `PhaseTracker`, `IntroSequence`, canvas, and tab navigation
- Delegates all chat rendering to `ChatPanel`

### ChatPanel.tsx (~250 lines)
Chat message list with input:
- Receives `messages`, `archivedRuns`, `waitingForResponse`, `waitingQuestions`, `waitingAgentRole` as props (or reads from chat store directly)
- Renders archived run accordions
- Renders message list using `MessageBubble`
- Renders `QuestionBubble` when agent is waiting
- Renders `PhaseActionButton` after messages when phase is completed
- Input textarea with send button
- Props for `isExpanded` to switch between capped-width and full-width input styles
- Owns `inputValue` state, `handleSend`, `handleKeyDown`

### MessageBubble.tsx (~60 lines)
Single message rendering:
- Props: `msg: ChatMessage`, `isWaiting: boolean`, `accentColor: string`
- Renders sender label, `MessageRenderer` for text, timestamp
- "Awaiting your response" indicator when waiting
- Pulse animation via CSS class

### QuestionBubble.tsx (~100 lines)
Agent question with selectable options:
- Props: `question: AskQuestion`, `accentColor: string`, `isExpanded: boolean`, `onSelect: (label: string) => void`
- Compact mode: label-only buttons
- Expanded mode: rich cards with description, tradeoffs, recommendation badge
- "Click to select or type your own answer" hint

### PhaseActionButton.tsx (~50 lines)
"Continue to War Room / Build" button:
- Reads `currentPhase` and `projectState` from project store
- Shows button only when phase status is 'completed'
- Handles loading state internally
- Calls `window.office.startWarroom()` or `window.office.startBuild()`

### useIntro.ts (~60 lines)
Custom hook for intro sequence state:
- Encapsulates: `introHighlights`, `introChatHighlight`, `showIntro`, `showIntroRef`
- Provides: `handleIntroComplete`, `handleHighlightChange`, `handleChatHighlightChange`
- Camera snap + CEO spawn logic (both in `handleSceneReady` and useEffect fallback)
- Returns: `{ showIntro, introHighlights, introChatHighlight, handleIntroComplete, handleHighlightChange, handleChatHighlightChange, onSceneReady }`

---

## Step 3: Split ProjectPicker.tsx (672 lines → 4 files)

All new files live in `src/renderer/src/components/ProjectPicker/`.

### ProjectPicker.tsx (~120 lines)
Layout shell:
- Logo/title
- Auth hint when not connected
- Renders `NewProjectForm`, `RecentProjects`, open-project button
- Status bar with auth dot and connect button
- Renders `ApiKeyPanel` in a popover when triggered
- `onProjectOpened` callback prop

### NewProjectForm.tsx (~80 lines)
New project creation form:
- Name input, folder picker button, create button
- `newName`, `newPath`, `creating`, `newError` state
- Calls `window.office.createProject()`

### RecentProjects.tsx (~70 lines)
Already a sub-component in the current file — move to its own file:
- Receives `projects`, `loading`, `disabled`, `onOpen`, `openingPath` as props
- Hover state, spinner, formatted timestamps

### ApiKeyPanel.tsx (~50 lines)
Already a sub-component in the current file — move to its own file:
- API key input, connect button, error display
- Calls `window.office.connectApiKey()`

---

## Step 4: Split electron/main.ts (583 lines → 5 files)

### electron/main.ts (~80 lines)
App lifecycle only:
- Create BrowserWindow
- Import and call `initProjectHandlers(win)`, `initPhaseHandlers(win)`, `initAuthHandlers(win)`
- App ready/quit handlers

### electron/ipc/state.ts (~40 lines)
Shared mutable runtime state:
- `currentProjectDir: string | null`
- `phaseMachine: PhaseMachine | null`
- `currentChatPhase: Phase | null`
- `currentChatAgentRole: AgentRole | null`
- `projectManager: ProjectManager`
- `artifactStore: ArtifactStore | null`
- `chatHistoryStore: ChatHistoryStore | null`
- Exported so all handler modules can read/write

### electron/ipc/project-handlers.ts (~100 lines)
IPC handlers for project management:
- `CREATE_PROJECT`, `OPEN_PROJECT`, `GET_PROJECT_STATE`
- `MARK_INTRO_SEEN`, `PICK_DIRECTORY`, `GET_RECENT_PROJECTS`
- `READ_ARTIFACT`, `GET_ARTIFACT_STATUS`
- `GET_CHAT_HISTORY`

### electron/ipc/phase-handlers.ts (~180 lines)
IPC handlers for phase orchestration:
- `START_IMAGINE`, `START_WARROOM`, `START_BUILD`
- Phase machine creation and event broadcasting
- Chat message and agent event forwarding
- `SEND_MESSAGE`, `RESPOND_TO_AGENT`

### electron/ipc/auth-handlers.ts (~80 lines)
IPC handlers for authentication:
- `GET_AUTH_STATUS`, `CONNECT_API_KEY`
- `GET_AGENT_DEFINITIONS`
- Agent waiting/responding handlers

Each module exports an `init(mainWindow: BrowserWindow)` function that registers its IPC handlers.

---

## Step 5: Shared Theme & Utils

### src/renderer/src/theme.ts (~50 lines)

Color constants extracted from hardcoded values across all components:

```typescript
export const colors = {
  bg: '#0f0f1a',
  bgDark: '#0d0d1a',
  surface: '#1a1a2e',
  surfaceLight: '#151528',
  border: '#333',
  borderLight: '#2a2a3a',
  text: '#e2e8f0',
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

Common style snippets (optional, only if patterns repeat 3+ times):

```typescript
export const common = {
  card: { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px' },
  flexColumn: { display: 'flex', flexDirection: 'column' as const },
  flexRow: { display: 'flex', alignItems: 'center' },
} as const;
```

### src/renderer/src/utils.ts (~30 lines)

```typescript
export function agentDisplayName(role: string): string { ... }
export function formatTime(timestamp: number): string { ... }
export function formatAge(timestamp: number): string { ... }
export function shortPath(path: string): string { ... }
```

Moved from OfficeView.tsx and ProjectPicker.tsx. All consumers import from here.

---

## File Inventory After Refactor

### Changed Files
- `src/renderer/src/components/OfficeView/OfficeView.tsx` — 1089 → ~150 lines
- `src/renderer/src/components/ProjectPicker/ProjectPicker.tsx` — 672 → ~120 lines
- `src/renderer/src/office/characters/agents.config.ts` — remove `getAgentConfig`
- `electron/main.ts` — 583 → ~80 lines

### New Files (Renderer)
- `src/renderer/src/theme.ts`
- `src/renderer/src/utils.ts`
- `src/renderer/src/components/OfficeView/ChatPanel.tsx`
- `src/renderer/src/components/OfficeView/MessageBubble.tsx`
- `src/renderer/src/components/OfficeView/QuestionBubble.tsx`
- `src/renderer/src/components/OfficeView/PhaseActionButton.tsx`
- `src/renderer/src/components/OfficeView/useIntro.ts`
- `src/renderer/src/components/ProjectPicker/NewProjectForm.tsx`
- `src/renderer/src/components/ProjectPicker/RecentProjects.tsx`
- `src/renderer/src/components/ProjectPicker/ApiKeyPanel.tsx`

### New Files (Electron)
- `electron/ipc/state.ts`
- `electron/ipc/project-handlers.ts`
- `electron/ipc/phase-handlers.ts`
- `electron/ipc/auth-handlers.ts`

### Deleted Files
- `src/renderer/src/office/ui/SpeechBubble.ts`
- `src/renderer/src/office/ui/AgentLabel.ts`
- `src/renderer/src/office/ui/` directory (if empty)
