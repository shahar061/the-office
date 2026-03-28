# Phase Restart — Clickable Phase Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phase tracker steps clickable so users can restart completed or active phases, with a confirmation modal showing what will be lost.

**Architecture:** New IPC channel `RESTART_PHASE` handles cleanup (interrupt, delete artifacts, reset state, update session.yaml) then re-invokes the existing start handlers. A `PhaseRestartModal` component shows impact before confirming. PhaseMachine gains generalized backward transitions.

**Tech Stack:** React, Zustand, Electron IPC, PixiJS (existing), Vitest

---

### Task 1: Generalize PhaseMachine Backward Transitions

**Files:**
- Modify: `electron/orchestrator/phase-machine.ts`
- Test: `tests/orchestrator/phase-machine.test.ts`

- [ ] **Step 1: Write failing tests for new backward transitions**

Add these tests to `tests/orchestrator/phase-machine.test.ts` inside the `describe('backward transitions to imagine (redo)')` block. Rename the describe to `'backward transitions (redo)'` and add:

```typescript
it('allows build → warroom', () => {
  const machine = new PhaseMachine('build');
  machine.transition('warroom');
  expect(machine.currentPhase).toBe('warroom');
});

it('allows complete → warroom', () => {
  const machine = new PhaseMachine('complete');
  machine.transition('warroom');
  expect(machine.currentPhase).toBe('warroom');
});

it('allows complete → build', () => {
  const machine = new PhaseMachine('complete');
  machine.transition('build');
  expect(machine.currentPhase).toBe('build');
});

it('rejects any transition to idle', () => {
  const machine = new PhaseMachine('imagine');
  expect(() => machine.transition('idle')).toThrow(
    "Invalid transition: 'imagine' → 'idle'"
  );
});
```

Also update the existing test at line 109 that expects `complete → warroom` to throw. It should now pass — **remove that test** (the one labeled `'rejects complete → warroom'`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orchestrator/phase-machine.test.ts`
Expected: The new backward transition tests FAIL (build→warroom, complete→warroom, complete→build). The idle rejection test should PASS since idle is not in BACKWARD_TO_IMAGINE either.

- [ ] **Step 3: Update PhaseMachine to support generalized backward transitions**

In `electron/orchestrator/phase-machine.ts`, replace the `BACKWARD_TO_IMAGINE` approach:

```typescript
import { EventEmitter } from 'events';
import type { Phase, PhaseInfo } from '../../shared/types';

// Valid forward transitions
const FORWARD_TRANSITIONS: Record<Phase, Phase | null> = {
  idle: 'imagine',
  imagine: 'warroom',
  warroom: 'build',
  build: 'complete',
  complete: null,
};

export const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];

export class PhaseMachine extends EventEmitter {
  private _currentPhase: Phase;
  private _completedPhases: Set<Phase>;

  constructor(initialPhase: Phase = 'idle', completedPhases: Phase[] = []) {
    super();
    this._currentPhase = initialPhase;
    this._completedPhases = new Set(completedPhases);
  }

  get currentPhase(): Phase {
    return this._currentPhase;
  }

  get completedPhases(): Phase[] {
    return Array.from(this._completedPhases);
  }

  transition(target: Phase): void {
    const from = this._currentPhase;

    const isSame = from === target;
    const isForward = FORWARD_TRANSITIONS[from] === target;
    const isBackward = PHASE_ORDER.indexOf(target) < PHASE_ORDER.indexOf(from)
                       && target !== 'idle';

    if (!isSame && !isForward && !isBackward) {
      throw new Error(
        `Invalid transition: '${from}' → '${target}'`
      );
    }

    this._currentPhase = target;

    const info: PhaseInfo = { phase: target, status: 'active' };
    this.emit('change', info);
  }

  clearCompletedFrom(phase: Phase): void {
    const idx = PHASE_ORDER.indexOf(phase);
    for (const p of PHASE_ORDER.slice(idx)) {
      this._completedPhases.delete(p);
    }
  }

  markCompleted(phase: Phase): void {
    this._completedPhases.add(phase);
    const info: PhaseInfo = { phase, status: 'completed' };
    this.emit('change', info);
  }

  markFailed(): void {
    const info: PhaseInfo = { phase: this._currentPhase, status: 'failed' };
    this.emit('change', info);
  }

  markInterrupted(): void {
    const info: PhaseInfo = { phase: this._currentPhase, status: 'interrupted' };
    this.emit('change', info);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/orchestrator/phase-machine.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/orchestrator/phase-machine.ts tests/orchestrator/phase-machine.test.ts
git commit -m "feat(phase-restart): generalize backward transitions in PhaseMachine"
```

---

### Task 2: Add clearCompletedFrom Tests

**Files:**
- Test: `tests/orchestrator/phase-machine.test.ts`

- [ ] **Step 1: Write failing tests for clearCompletedFrom**

Add a new `describe('clearCompletedFrom')` block in `tests/orchestrator/phase-machine.test.ts`:

```typescript
describe('clearCompletedFrom', () => {
  it('clears target phase and all subsequent phases', () => {
    const machine = new PhaseMachine('complete', ['imagine', 'warroom', 'build', 'complete']);
    machine.clearCompletedFrom('warroom');
    expect(machine.completedPhases).toEqual(['imagine']);
  });

  it('clears all phases when clearing from imagine', () => {
    const machine = new PhaseMachine('complete', ['imagine', 'warroom', 'build', 'complete']);
    machine.clearCompletedFrom('imagine');
    expect(machine.completedPhases).toEqual([]);
  });

  it('does nothing when clearing from a phase not in completed set', () => {
    const machine = new PhaseMachine('warroom', ['imagine']);
    machine.clearCompletedFrom('build');
    expect(machine.completedPhases).toEqual(['imagine']);
  });

  it('clears only the target when it is the last completed phase', () => {
    const machine = new PhaseMachine('build', ['imagine', 'warroom']);
    machine.clearCompletedFrom('warroom');
    expect(machine.completedPhases).toEqual(['imagine']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/orchestrator/phase-machine.test.ts`
Expected: ALL tests PASS (clearCompletedFrom was implemented in Task 1)

- [ ] **Step 3: Commit**

```bash
git add tests/orchestrator/phase-machine.test.ts
git commit -m "test(phase-restart): add clearCompletedFrom tests"
```

---

### Task 3: Add ArtifactStore.clearFrom Method

**Files:**
- Modify: `electron/project/artifact-store.ts`
- Test: `tests/project/artifact-store.test.ts` (create)

- [ ] **Step 1: Write failing test for clearFrom**

Create `tests/project/artifact-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ArtifactStore } from '../../electron/project/artifact-store';

describe('ArtifactStore.clearFrom', () => {
  let tmpDir: string;
  let store: ArtifactStore;
  let officeDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
    officeDir = path.join(tmpDir, 'docs', 'office');
    fs.mkdirSync(officeDir, { recursive: true });
    store = new ArtifactStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFiles(...filenames: string[]) {
    for (const f of filenames) {
      fs.writeFileSync(path.join(officeDir, f), 'test content');
    }
  }

  it('clearFrom imagine deletes all imagine + warroom artifacts', () => {
    createFiles(
      '01-vision-brief.md', '02-prd.md', '03-market-analysis.md',
      '04-system-design.md', 'plan.md', 'tasks.yaml',
    );
    store.clearFrom('imagine');
    const remaining = fs.readdirSync(officeDir);
    expect(remaining).toEqual([]);
  });

  it('clearFrom warroom deletes only warroom artifacts', () => {
    createFiles(
      '01-vision-brief.md', '02-prd.md', '03-market-analysis.md',
      '04-system-design.md', 'plan.md', 'tasks.yaml',
    );
    store.clearFrom('warroom');
    const remaining = fs.readdirSync(officeDir).sort();
    expect(remaining).toEqual([
      '01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md',
    ]);
  });

  it('clearFrom build deletes nothing', () => {
    createFiles('01-vision-brief.md', 'plan.md', 'tasks.yaml');
    store.clearFrom('build');
    const remaining = fs.readdirSync(officeDir).sort();
    expect(remaining).toEqual(['01-vision-brief.md', 'plan.md', 'tasks.yaml']);
  });

  it('does not throw when files do not exist', () => {
    expect(() => store.clearFrom('imagine')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project/artifact-store.test.ts`
Expected: FAIL with "store.clearFrom is not a function"

- [ ] **Step 3: Implement clearFrom**

Add to `electron/project/artifact-store.ts`:

After the existing constants at the top, add:

```typescript
import type { Phase } from '../../shared/types';
```

Add a new constant mapping phases to their artifacts:

```typescript
const PHASE_ARTIFACTS: Record<string, string[]> = {
  imagine: ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'],
  warroom: ['plan.md', 'tasks.yaml'],
};

const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];
```

Add the `clearFrom` method to the `ArtifactStore` class:

```typescript
clearFrom(phase: Phase): void {
  const idx = PHASE_ORDER.indexOf(phase);
  const phasesToClear = PHASE_ORDER.slice(idx);

  for (const p of phasesToClear) {
    const artifacts = PHASE_ARTIFACTS[p];
    if (!artifacts) continue;
    for (const filename of artifacts) {
      const filePath = path.join(this.officeDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/project/artifact-store.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/project/artifact-store.ts tests/project/artifact-store.test.ts
git commit -m "feat(phase-restart): add ArtifactStore.clearFrom method"
```

---

### Task 4: Add Shared Types and IPC Channels

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add RestartPhasePayload type**

In `shared/types.ts`, after the `PhaseInfo` interface (around line 98), add:

```typescript
export interface RestartPhasePayload {
  targetPhase: Phase;
  userIdea?: string;  // only for imagine
}
```

- [ ] **Step 2: Add IPC channels**

In the `IPC_CHANNELS` object in `shared/types.ts`, add in the Phase section (after `PHASE_CHANGE`):

```typescript
  RESTART_PHASE: 'office:restart-phase',
  PHASE_RESTART: 'office:phase-restart',
```

- [ ] **Step 3: Add restartPhase to OfficeAPI interface**

In the `OfficeAPI` interface, add after the `onPhaseChange` line:

```typescript
  restartPhase(payload: RestartPhasePayload): Promise<void>;
  onPhaseRestart(callback: (targetPhase: Phase) => void): () => void;
```

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat(phase-restart): add RestartPhasePayload type and IPC channels"
```

---

### Task 5: Wire Preload Bridge

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add RestartPhasePayload to imports**

In `electron/preload.ts`, add `RestartPhasePayload` to the type import on line 4:

```typescript
import type {
  AuthStatus, ProjectInfo, ProjectState, PhaseInfo,
  ChatMessage, AgentEvent, AgentWaitingPayload, PermissionRequest, KanbanState,
  SessionStats, BuildConfig, AppSettings, Phase, PhaseHistory, AgentDefinitionPayload,
  WarTableCard, WarTableVisualState, WarTableReviewPayload, WarTableReviewResponse,
  WarTableChoreographyPayload, RestartPhasePayload,
} from '../shared/types';
```

- [ ] **Step 2: Add restartPhase and onPhaseRestart to context bridge**

In the `contextBridge.exposeInMainWorld('office', { ... })` block, add after the `onPhaseChange` line (line 36):

```typescript
  restartPhase: (payload: RestartPhasePayload) => ipcRenderer.invoke(IPC_CHANNELS.RESTART_PHASE, payload),
  onPhaseRestart: (cb: (targetPhase: Phase) => void) => onEvent(IPC_CHANNELS.PHASE_RESTART, cb),
```

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(phase-restart): expose restartPhase in preload bridge"
```

---

### Task 6: Add RESTART_PHASE IPC Handler

**Files:**
- Modify: `electron/ipc/phase-handlers.ts`
- Modify: `electron/ipc/state.ts`

- [ ] **Step 1: Add RestartPhasePayload to imports in phase-handlers.ts**

In `electron/ipc/phase-handlers.ts`, add `RestartPhasePayload` to the type import from `../../shared/types`:

```typescript
import type {
  AppSettings,
  BuildConfig,
  ChatMessage,
  PhaseInfo,
  PermissionRequest,
  RestartPhasePayload,
  WarTableCard,
  WarTableVisualState,
  WarTableChoreographyPayload,
  WarTableReviewPayload,
  WarTableReviewResponse,
} from '../../shared/types';
```

Also add `ArtifactStore` to the import from `../project/artifact-store`:

```typescript
import { ArtifactStore } from '../project/artifact-store';
```

- [ ] **Step 2: Add session.yaml cleanup helper**

Add this helper function before `initPhaseHandlers`:

```typescript
function clearSessionYaml(projectDir: string, targetPhase: Phase): void {
  const sessionPath = path.join(projectDir, 'docs', 'office', 'session.yaml');
  if (!fs.existsSync(sessionPath)) return;

  if (targetPhase === 'imagine') {
    // Delete entirely — agent-organizer recreates it
    fs.unlinkSync(sessionPath);
  } else {
    // Reset phase fields in the YAML
    let content = fs.readFileSync(sessionPath, 'utf-8');
    content = content.replace(/current_phase:\s*.+/, `current_phase: "${targetPhase}"`);
    content = content.replace(/completed_phases:\s*\[.*\]/, 'completed_phases: []');
    fs.writeFileSync(sessionPath, content, 'utf-8');
  }
}
```

Add `fs` and `path` imports at the top of the file:

```typescript
import fs from 'fs';
import path from 'path';
```

Also import `Phase` type:

```typescript
import type { Phase } from '../../shared/types';
```

(Add `Phase` to the existing type import.)

- [ ] **Step 3: Refactor existing start handlers into standalone functions**

The existing `START_IMAGINE`, `START_WARROOM`, and `START_BUILD` IPC handlers each contain the full orchestration logic inline. Extract each handler body into a standalone async function so the restart handler can call them directly.

Extract `async function handleStartImagine(userIdea: string)` from the `START_IMAGINE` handler body (lines 52-113). The IPC handler becomes a thin wrapper:

```typescript
async function handleStartImagine(userIdea: string): Promise<void> {
  // ... entire existing handler body from lines 52-113 (everything after the guards) ...
}

// Inside initPhaseHandlers():
ipcMain.handle(IPC_CHANNELS.START_IMAGINE, async (_event, userIdea: string) => {
  if (!currentProjectDir) throw new Error('No project open');
  if (!authManager.isAuthenticated()) throw new Error('Not authenticated — connect via CLI or API key');
  return handleStartImagine(userIdea);
});
```

Do the same for:
- `async function handleStartWarroom()` — extracted from `START_WARROOM` handler (lines 115-167)
- `async function handleStartBuild(config: BuildConfig)` — extracted from `START_BUILD` handler (lines 169-207)

Keep the guard checks (`if (!currentProjectDir)`, `if (!authManager.isAuthenticated())`) in the IPC handlers, not in the extracted functions, since the restart handler does its own guards.

- [ ] **Step 4: Add RESTART_PHASE handler**

Inside `initPhaseHandlers()`, add this handler after the `START_BUILD` handler (before the `// ── Chat ──` section):

```typescript
  ipcMain.handle(IPC_CHANNELS.RESTART_PHASE, async (_event, payload: RestartPhasePayload) => {
    if (!currentProjectDir) throw new Error('No project open');
    if (!authManager.isAuthenticated()) throw new Error('Not authenticated');

    const { targetPhase, userIdea } = payload;

    // 1. Interrupt active phase if running
    if (activeAbort) {
      activeAbort();
      setActiveAbort(null);
    }
    if (phaseMachine) {
      phaseMachine.markInterrupted();
    }
    rejectPendingQuestions('Phase restart');
    setPendingReview(null);

    // 2. Clean artifacts from target phase onward
    const store = new ArtifactStore(currentProjectDir);
    store.clearFrom(targetPhase);

    // 3. Reset session.yaml
    clearSessionYaml(currentProjectDir, targetPhase);

    // 4. Update ProjectState
    const state = projectManager.getProjectState(currentProjectDir);
    const PHASE_ORDER = ['idle', 'imagine', 'warroom', 'build', 'complete'];
    const idx = PHASE_ORDER.indexOf(targetPhase);
    const cleanedCompleted = state.completedPhases.filter(
      (p) => PHASE_ORDER.indexOf(p) < idx
    );
    projectManager.updateProjectState(currentProjectDir, {
      currentPhase: targetPhase,
      completedPhases: cleanedCompleted,
      interrupted: false,
    });

    // 5. Broadcast renderer reset
    send(IPC_CHANNELS.PHASE_RESTART, targetPhase);

    // 6. Nullify current phase machine so start handlers create fresh ones
    setPhaseMachine(null);
    setPermissionHandler(null);

    // 7. Start the target phase (don't await — runs async like normal starts)
    if (targetPhase === 'imagine') {
      const idea = userIdea ?? 'Continue from previous session';
      handleStartImagine(idea);
    } else if (targetPhase === 'warroom') {
      handleStartWarroom();
    } else if (targetPhase === 'build') {
      handleStartBuild({
        modelPreset: 'default',
        retryLimit: 2,
        permissionMode: 'auto-all',
      });
    }
  });
```

- [ ] **Step 5: Verify activeAbort is already exported from state.ts**

`activeAbort` and `setActiveAbort` are already exported from `electron/ipc/state.ts` (lines 39, 98). No changes needed — just verify.

- [ ] **Step 6: Run the build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/phase-handlers.ts
git commit -m "feat(phase-restart): add RESTART_PHASE IPC handler with cleanup flow"
```

---

### Task 7: Add PhaseRestartModal Component

**Files:**
- Create: `src/renderer/src/components/OfficeView/PhaseRestartModal.tsx`

- [ ] **Step 1: Create the PhaseRestartModal component**

Create `src/renderer/src/components/OfficeView/PhaseRestartModal.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { colors } from '../../theme';
import type { Phase } from '@shared/types';

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Idle',
  imagine: 'Imagine',
  warroom: 'War Room',
  build: 'Build',
  complete: 'Complete',
};

const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];

// Artifacts that will be deleted when restarting from a given phase
const ARTIFACT_IMPACT: Record<string, string[]> = {
  imagine: [
    '01-vision-brief.md', '02-prd.md', '03-market-analysis.md',
    '04-system-design.md', 'plan.md', 'tasks.yaml',
  ],
  warroom: ['plan.md', 'tasks.yaml'],
  build: [],
};

interface PhaseRestartModalProps {
  targetPhase: Phase;
  originalIdea?: string;
  affectedPhases: { phase: Phase; status: string }[];
  onConfirm: (userIdea?: string) => void;
  onCancel: () => void;
}

export function PhaseRestartModal({
  targetPhase,
  originalIdea,
  affectedPhases,
  onConfirm,
  onCancel,
}: PhaseRestartModalProps) {
  const [idea, setIdea] = useState(originalIdea ?? '');

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  // Compute artifacts to clear: from targetPhase onward
  const artifactsToDelete: string[] = [];
  const idx = PHASE_ORDER.indexOf(targetPhase);
  for (const p of PHASE_ORDER.slice(idx)) {
    const arts = ARTIFACT_IMPACT[p];
    if (arts) artifactsToDelete.push(...arts);
  }

  const isImagine = targetPhase === 'imagine';

  return (
    <div style={backdropStyle} onClick={onCancel}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: colors.warning,
            }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
              Restart {PHASE_LABELS[targetPhase]}?
            </span>
          </div>
          <button style={closeButtonStyle} onClick={onCancel}>✕</button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* Impact: phases to reset */}
          {affectedPhases.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={sectionLabelStyle}>Phases that will be reset</div>
              <ul style={listStyle}>
                {affectedPhases.map(({ phase, status }) => (
                  <li key={phase} style={listItemStyle}>
                    <span style={{ color: colors.text }}>{PHASE_LABELS[phase]}</span>
                    <span style={{
                      fontSize: '10px',
                      color: status === 'completed' ? colors.success : colors.accent,
                      marginLeft: '6px',
                    }}>
                      ({status})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Impact: artifacts to delete */}
          {artifactsToDelete.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={sectionLabelStyle}>Artifacts that will be deleted</div>
              <ul style={listStyle}>
                {artifactsToDelete.map((filename) => (
                  <li key={filename} style={listItemStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: colors.textMuted }}>
                      {filename}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* session.yaml impact */}
          <div style={{ marginBottom: '16px' }}>
            <div style={sectionLabelStyle}>session.yaml</div>
            <div style={{ fontSize: '12px', color: colors.textMuted, paddingLeft: '12px' }}>
              {isImagine ? 'Will be deleted (recreated on restart)' : 'Phase fields will be reset'}
            </div>
          </div>

          {/* Imagine: editable idea */}
          {isImagine && (
            <div>
              <div style={sectionLabelStyle}>Your idea</div>
              <textarea
                style={textareaStyle}
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Enter your idea..."
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button style={cancelButtonStyle} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={restartButtonStyle}
            onClick={() => onConfirm(isImagine ? idea : undefined)}
            disabled={isImagine && !idea.trim()}
          >
            Restart {PHASE_LABELS[targetPhase]}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──

const backdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(15,15,26,0.96)',
  backdropFilter: 'blur(12px)',
  border: '1px solid #333',
  borderRadius: '12px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  width: '440px',
  maxHeight: '75vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #222',
  background: 'rgba(26,26,46,0.5)',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: '16px',
  overflowY: 'auto',
  flex: 1,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '12px 16px',
  borderTop: '1px solid #222',
  background: 'rgba(26,26,46,0.5)',
  flexShrink: 0,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  fontSize: '16px',
  cursor: 'pointer',
  padding: '0 4px',
  fontFamily: 'inherit',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: colors.textDim,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  paddingLeft: '12px',
};

const listItemStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '2px 0',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '8px 12px',
  color: colors.text,
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '8px 16px',
  color: colors.textMuted,
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const restartButtonStyle: React.CSSProperties = {
  background: colors.warning,
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/PhaseRestartModal.tsx
git commit -m "feat(phase-restart): add PhaseRestartModal component"
```

---

### Task 8: Make PhaseTracker Clickable and Wire Modal

**Files:**
- Modify: `src/renderer/src/components/OfficeView/PhaseTracker.tsx`

- [ ] **Step 1: Add imports and state for restart modal**

In `src/renderer/src/components/OfficeView/PhaseTracker.tsx`, add the import:

```typescript
import { PhaseRestartModal } from './PhaseRestartModal';
```

Inside the `PhaseTracker` component function, after the existing `useState` (line 60), add:

```typescript
const [restartTarget, setRestartTarget] = useState<Phase | null>(null);
const [originalIdea, setOriginalIdea] = useState<string>('');
```

- [ ] **Step 2: Add click handler and idea fetcher**

After the `handleAction` callback, add:

```typescript
const handlePhaseClick = useCallback(async (clickedPhase: Phase) => {
  // Only allow clicking completed or active phases
  const done = completedPhases.includes(clickedPhase);
  const active = phase === clickedPhase;
  if (!done && !active) return;

  // For imagine: fetch original idea from chat history
  if (clickedPhase === 'imagine') {
    try {
      const history = await window.office.getChatHistory('imagine');
      const ceoHistory = history.find((h: any) => h.agentRole === 'ceo');
      if (ceoHistory && ceoHistory.runs.length > 0) {
        const firstRun = ceoHistory.runs[0];
        const userMsg = firstRun.messages.find((m: any) => m.role === 'user');
        if (userMsg) {
          setOriginalIdea(userMsg.text);
        }
      }
    } catch {
      // No history available — leave idea empty
    }
  }

  setRestartTarget(clickedPhase);
}, [completedPhases, phase]);

const handleRestartConfirm = useCallback(async (userIdea?: string) => {
  if (!restartTarget) return;
  setRestartTarget(null);
  try {
    await window.office.restartPhase({ targetPhase: restartTarget, userIdea });
  } catch (err) {
    console.error('Failed to restart phase:', err);
  }
}, [restartTarget]);

const handleRestartCancel = useCallback(() => {
  setRestartTarget(null);
  setOriginalIdea('');
}, []);
```

- [ ] **Step 3: Make phase circles clickable**

In the normal mode rendering (not intro mode), update the `<div style={styles.step}>` section (around line 146). Wrap the circle div to make it clickable when the phase is completed or active:

Replace lines 146-164 (the step div and its children) with:

```tsx
<div style={styles.step}>
  <div
    className={isCurrent ? 'phase-pulse' : undefined}
    style={{
      ...styles.circle(done, isCurrent, isFailed, upcoming),
      ...(done || active ? {
        cursor: 'pointer',
        transition: 'all 0.3s, filter 0.15s',
      } : {}),
    }}
    onClick={done || active ? () => handlePhaseClick(p.key) : undefined}
    onMouseEnter={(e) => {
      if (done || active) {
        (e.currentTarget as HTMLElement).style.filter = 'brightness(1.2)';
      }
    }}
    onMouseLeave={(e) => {
      if (done || active) {
        (e.currentTarget as HTMLElement).style.filter = 'brightness(1)';
      }
    }}
    title={done || active ? `Click to restart ${p.label}` : undefined}
  >
    {done ? '\u2713' : i + 1}
  </div>
  <span
    style={{
      ...styles.label(done, active, isFailed, upcoming),
      ...(done || active ? { cursor: 'pointer' } : {}),
    }}
    onClick={done || active ? () => handlePhaseClick(p.key) : undefined}
  >
    {p.label}
  </span>
  {isCurrent && status && (
    <span style={styles.statusText}>{status}</span>
  )}
  {isFailed && status && (
    <span style={styles.failedStatusText}>{status}</span>
  )}
</div>
```

- [ ] **Step 4: Compute affected phases and render modal**

Add this before the return statement, after the `handleRestartCancel` callback:

```typescript
// Compute affected phases for the modal
const affectedPhases = restartTarget ? (() => {
  const PHASE_ORDER: Phase[] = ['imagine', 'warroom', 'build'];
  const targetIdx = PHASE_ORDER.indexOf(restartTarget);
  const result: { phase: Phase; status: string }[] = [];

  for (let i = targetIdx; i < PHASE_ORDER.length; i++) {
    const p = PHASE_ORDER[i];
    if (p === restartTarget) continue; // Don't list the target itself
    const isDone = completedPhases.includes(p);
    const isActive = phase === p;
    if (isDone) result.push({ phase: p, status: 'completed' });
    else if (isActive) result.push({ phase: p, status: status ?? 'active' });
  }
  return result;
})() : [];
```

Then add the modal rendering right before the closing `</div>` of the component's return, after the action button section:

```tsx
{restartTarget && (
  <PhaseRestartModal
    targetPhase={restartTarget}
    originalIdea={restartTarget === 'imagine' ? originalIdea : undefined}
    affectedPhases={affectedPhases}
    onConfirm={handleRestartConfirm}
    onCancel={handleRestartCancel}
  />
)}
```

Note: The modal has `position: absolute` with `inset: 0` and `zIndex: 20`, but it needs to be positioned relative to the full viewport, not just the PhaseTracker strip. Move the modal rendering to be a portal or render it at the OfficeView level. The simplest approach: render it inside PhaseTracker but add a style override. Actually, the `PhaseRestartModal` uses `position: absolute` with `inset: 0`, which will only cover the PhaseTracker's container. To fix this, change the modal's backdrop to `position: fixed` instead of `absolute`. Update the `backdropStyle` in `PhaseRestartModal.tsx`:

```typescript
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
```

- [ ] **Step 5: Run the build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/OfficeView/PhaseTracker.tsx
git commit -m "feat(phase-restart): make phase tracker clickable with restart modal"
```

---

### Task 9: Wire PHASE_RESTART Listener in OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Add PHASE_RESTART listener**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, add a new `useEffect` after the existing war table click handler (after line 202):

```typescript
// Handle phase restart — clear renderer stores
useEffect(() => {
  const cleanup = window.office.onPhaseRestart((targetPhase: string) => {
    // Clear war table
    useWarTableStore.getState().reset();
    // Clear chat messages
    useChatStore.getState().clearMessages();
  });
  return cleanup;
}, []);
```

- [ ] **Step 2: Run the build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat(phase-restart): wire PHASE_RESTART listener to clear stores"
```

---

### Task 10: Manual Integration Testing

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit any fixes if needed**

If any tests fail or type errors were found, fix them and commit:

```bash
git add -A
git commit -m "fix(phase-restart): address test/type issues from integration"
```
