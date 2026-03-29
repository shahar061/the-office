# Intro Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pokemon GBA-style intro sequence that plays once per new project, with CEO character dialogue and PhaseTracker highlighting.

**Architecture:** New `IntroSequence` overlay component manages a 4-step dialogue state machine with typewriter text effect. PhaseTracker gets a `highlightedPhases` prop for intro-mode rendering. `ProjectState` gains an `introSeen` field persisted via a new IPC channel. The intro triggers when `phase === 'idle' && !projectState.introSeen`.

**Tech Stack:** React, TypeScript, Zustand, Electron IPC, inline styles

---

### Task 1: Add `introSeen` to ProjectState and IPC plumbing

**Files:**
- Modify: `shared/types.ts`
- Modify: `electron/project/project-manager.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add `introSeen` to ProjectState in shared/types.ts**

In `shared/types.ts`, add `introSeen` to the `ProjectState` interface (after line 91):

```typescript
export interface ProjectState {
  name: string;
  path: string;
  currentPhase: Phase;
  completedPhases: Phase[];
  interrupted: boolean;
  introSeen: boolean;
}
```

- [ ] **Step 2: Add MARK_INTRO_SEEN to IPC_CHANNELS in shared/types.ts**

In the `IPC_CHANNELS` object, add after the `GET_PROJECT_STATE` line:

```typescript
  MARK_INTRO_SEEN: 'office:mark-intro-seen',
```

- [ ] **Step 3: Add markIntroSeen to OfficeAPI in shared/types.ts**

In the `OfficeAPI` interface, add after the `getProjectState` method:

```typescript
  markIntroSeen(): Promise<void>;
```

- [ ] **Step 4: Update project-manager.ts — new projects default introSeen to false**

In `electron/project/project-manager.ts`, update the `DEFAULT_STATE` constant:

```typescript
const DEFAULT_STATE: Omit<ProjectState, 'name' | 'path'> = {
  currentPhase: 'idle' as Phase,
  completedPhases: [],
  interrupted: false,
  introSeen: false,
};
```

Update the `createProject` method's `initialState` object:

```typescript
    const initialState: ProjectState = {
      name,
      path: projectPath,
      currentPhase: 'idle',
      completedPhases: [],
      interrupted: false,
      introSeen: false,
    };
```

Update the `getProjectState` method's return in the try block — add `introSeen` with a default of `true` for existing projects (so they skip the intro):

```typescript
      return {
        name: data.name ?? path.basename(projectPath),
        path: data.path ?? projectPath,
        currentPhase: data.currentPhase ?? 'idle',
        completedPhases: data.completedPhases ?? [],
        interrupted: data.interrupted ?? false,
        introSeen: data.introSeen ?? true,
      };
```

And update the catch block's fallback return to also include `introSeen: true`:

```typescript
    } catch {
      return {
        name: path.basename(projectPath),
        path: projectPath,
        ...DEFAULT_STATE,
        introSeen: true,
      };
    }
```

- [ ] **Step 5: Update GET_PROJECT_STATE handler in electron/main.ts**

Find the `GET_PROJECT_STATE` handler and update the fallback return to include `introSeen`:

```typescript
  ipcMain.handle(IPC_CHANNELS.GET_PROJECT_STATE, async () => {
    if (!currentProjectDir) {
      return { name: '', path: '', currentPhase: 'idle', completedPhases: [], interrupted: false, introSeen: true };
    }
    return projectManager.getProjectState(currentProjectDir);
  });
```

- [ ] **Step 6: Add MARK_INTRO_SEEN handler in electron/main.ts**

Add a new IPC handler after the `GET_PROJECT_STATE` handler:

```typescript
  ipcMain.handle(IPC_CHANNELS.MARK_INTRO_SEEN, async () => {
    if (!currentProjectDir) throw new Error('No project open');
    projectManager.updateProjectState(currentProjectDir, { introSeen: true });
  });
```

- [ ] **Step 7: Expose markIntroSeen in electron/preload.ts**

In `electron/preload.ts`, add after the `getProjectState` line:

```typescript
  markIntroSeen: () => ipcRenderer.invoke(IPC_CHANNELS.MARK_INTRO_SEEN),
```

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts electron/project/project-manager.ts electron/main.ts electron/preload.ts
git commit -m "feat: add introSeen to ProjectState with IPC plumbing"
```

---

### Task 2: Add `highlightedPhases` prop to PhaseTracker

**Files:**
- Modify: `src/renderer/src/components/OfficeView/PhaseTracker.tsx`

- [ ] **Step 1: Update PhaseTracker to accept highlightedPhases prop**

Replace the entire `PhaseTracker.tsx` file with the updated version that supports the `highlightedPhases` prop:

```tsx
import { useState, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import type { Phase, BuildConfig } from '@shared/types';

const PHASES = [
  { key: 'imagine' as Phase, label: 'Imagine' },
  { key: 'warroom' as Phase, label: 'War Room' },
  { key: 'build' as Phase, label: 'Build' },
] as const;

const DEFAULT_BUILD_CONFIG: BuildConfig = {
  modelPreset: 'default',
  retryLimit: 2,
  permissionMode: 'auto-all',
};

const HIGHLIGHT_COLORS: Partial<Record<Phase, string>> = {
  imagine: '#3b82f6',
  warroom: '#f59e0b',
  build: '#22c55e',
};

function getActionButton(
  phase: Phase,
  status: string | undefined,
): { label: string; action: 'continue' | 'retry'; targetPhase: Phase } | null {
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed' || status === 'interrupted';

  if (isCompleted) {
    if (phase === 'imagine') {
      return { label: 'Continue to War Room', action: 'continue', targetPhase: 'warroom' };
    }
    if (phase === 'warroom') {
      return { label: 'Continue to Build', action: 'continue', targetPhase: 'build' };
    }
    return null;
  }

  if (isFailed) {
    if (phase === 'warroom') {
      return { label: 'Retry War Room', action: 'retry', targetPhase: 'warroom' };
    }
    if (phase === 'build') {
      return { label: 'Retry Build', action: 'retry', targetPhase: 'build' };
    }
    return null;
  }

  return null;
}

interface PhaseTrackerProps {
  highlightedPhases?: Phase[] | null;
}

export function PhaseTracker({ highlightedPhases }: PhaseTrackerProps) {
  const { projectState, currentPhase } = useProjectStore();
  const [starting, setStarting] = useState(false);

  const phase = projectState?.currentPhase ?? 'idle';
  const completedPhases = projectState?.completedPhases ?? [];
  const status = currentPhase?.status;

  const introMode = highlightedPhases !== undefined && highlightedPhases !== null;

  const actionButton = phase !== 'idle' ? getActionButton(phase, status) : null;

  const handleAction = useCallback(async () => {
    if (!actionButton || starting) return;
    setStarting(true);
    try {
      if (actionButton.targetPhase === 'warroom') {
        await window.office.startWarroom();
      } else if (actionButton.targetPhase === 'build') {
        await window.office.startBuild(DEFAULT_BUILD_CONFIG);
      }
    } catch (err) {
      console.error(`Failed to ${actionButton.action} phase:`, err);
    } finally {
      setStarting(false);
    }
  }, [actionButton, starting]);

  // Hide when idle UNLESS in intro mode
  if (phase === 'idle' && !introMode) return null;

  return (
    <div style={styles.container}>
      <div style={styles.track}>
        {PHASES.map((p, i) => {
          // Intro mode: highlight/dim based on highlightedPhases array
          if (introMode) {
            const isHighlighted = highlightedPhases.includes(p.key);
            const highlightColor = HIGHLIGHT_COLORS[p.key] ?? '#3b82f6';

            return (
              <div key={p.key} style={styles.stepRow}>
                {i > 0 && (
                  <div style={{
                    ...styles.connector(false),
                    opacity: isHighlighted ? 1 : 0.3,
                    background: isHighlighted ? highlightColor : '#333',
                  }} />
                )}
                <div style={{ ...styles.step, opacity: isHighlighted ? 1 : 0.3, transition: 'opacity 0.3s' }}>
                  <div
                    className={isHighlighted ? 'phase-pulse' : undefined}
                    style={{
                      ...styles.circle(false, false, false, true),
                      ...(isHighlighted ? {
                        background: highlightColor,
                        color: '#fff',
                        border: `2px solid ${highlightColor}`,
                        boxShadow: `0 0 8px ${highlightColor}66`,
                      } : {}),
                    }}
                  >
                    {i + 1}
                  </div>
                  <span style={{
                    ...styles.label(false, isHighlighted, false, !isHighlighted),
                    color: isHighlighted ? '#e2e8f0' : '#4b5563',
                    fontWeight: isHighlighted ? 600 : 500,
                  }}>
                    {p.label}
                  </span>
                </div>
              </div>
            );
          }

          // Normal mode: existing logic
          const done = completedPhases.includes(p.key);
          const active = phase === p.key;
          const isCurrent = active && status !== 'completed' && status !== 'failed' && status !== 'interrupted';
          const isFailed = active && (status === 'failed' || status === 'interrupted');
          const upcoming = !done && !active;

          return (
            <div key={p.key} style={styles.stepRow}>
              {i > 0 && (
                <div style={styles.connector(done || active)} />
              )}
              <div style={styles.step}>
                <div
                  className={isCurrent ? 'phase-pulse' : undefined}
                  style={styles.circle(done, isCurrent, isFailed, upcoming)}
                >
                  {done ? '\u2713' : i + 1}
                </div>
                <span style={styles.label(done, active, isFailed, upcoming)}>
                  {p.label}
                </span>
                {isCurrent && status && (
                  <span style={styles.statusText}>{status}</span>
                )}
                {isFailed && status && (
                  <span style={styles.failedStatusText}>{status}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!introMode && actionButton && (
        <button
          style={styles.actionBtn(starting)}
          onClick={handleAction}
          disabled={starting}
        >
          {starting ? 'Starting\u2026' : actionButton.label}
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    borderBottom: '1px solid #1e1e2e',
    background: '#0d0d1a',
    gap: '16px',
    flexShrink: 0,
  } as React.CSSProperties,
  track: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  stepRow: {
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  connector: (filled: boolean): React.CSSProperties => ({
    width: '32px',
    height: '2px',
    background: filled ? '#3b82f6' : '#333',
    transition: 'background 0.3s',
  }),
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  circle: (done: boolean, current: boolean, failed: boolean, upcoming: boolean): React.CSSProperties => ({
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 700,
    flexShrink: 0,
    transition: 'all 0.3s',
    ...(done
      ? { background: '#22c55e', color: '#fff', border: '2px solid #22c55e' }
      : current
        ? { background: '#3b82f6', color: '#fff', border: '2px solid #3b82f6' }
        : failed
          ? { background: '#ef4444', color: '#fff', border: '2px solid #ef4444' }
          : { background: 'transparent', color: '#4b5563', border: '2px solid #333', boxSizing: 'border-box' }),
  }),
  label: (done: boolean, active: boolean, failed: boolean, upcoming: boolean): React.CSSProperties => ({
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    color: done ? '#22c55e' : failed ? '#ef4444' : active ? '#e2e8f0' : '#4b5563',
    whiteSpace: 'nowrap',
    transition: 'color 0.3s',
  }),
  statusText: {
    fontSize: '10px',
    color: '#64748b',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  failedStatusText: {
    fontSize: '10px',
    color: '#ef4444',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  actionBtn: (disabled: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    background: disabled ? '#1e3a5f' : '#3b82f6',
    color: disabled ? '#64748b' : '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'background 0.15s',
  }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/PhaseTracker.tsx
git commit -m "feat: add highlightedPhases prop to PhaseTracker for intro mode"
```

---

### Task 3: Create IntroSequence component

**Files:**
- Create: `src/renderer/src/components/OfficeView/IntroSequence.tsx`

The CEO uses sprite variant `adam` (from `agents.config.ts`). The sprite sheet is at `src/renderer/src/assets/characters/Adam_walk.png`. The idle frame (first frame, facing down) is at position (0, 0) with size 16x32 pixels.

- [ ] **Step 1: Create the IntroSequence component**

Create `src/renderer/src/components/OfficeView/IntroSequence.tsx`:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Phase } from '@shared/types';
import ceoSprite from '../../assets/characters/Adam_walk.png';

interface DialogueStep {
  text: string;
  highlights: Phase[];
}

const DIALOGUE_STEPS: DialogueStep[] = [
  {
    text: 'Ah, a new project! *adjusts glasses*\nWelcome to The Office. I\'m the CEO \u2014 and we\'ve got quite the team here.',
    highlights: [],
  },
  {
    text: 'First, we Imagine \u2014 that\'s where I sit down with the leadership team and figure out exactly what we\'re building.',
    highlights: ['imagine'],
  },
  {
    text: 'Then the War Room turns it into a battle plan, and the engineers Build it. The whole team\'s had their coffee already.',
    highlights: ['imagine', 'warroom', 'build'],
  },
  {
    text: 'So, what would you like to build?',
    highlights: [],
  },
];

const TYPEWRITER_SPEED = 30; // ms per character

interface IntroSequenceProps {
  onComplete: () => void;
  onHighlightChange: (phases: Phase[]) => void;
}

export function IntroSequence({ onComplete, onHighlightChange }: IntroSequenceProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = DIALOGUE_STEPS[stepIndex];
  const fullText = currentStep.text;
  const visibleText = isTyping ? fullText.slice(0, displayedChars) : fullText;

  // Update phase highlights when step changes
  useEffect(() => {
    onHighlightChange(currentStep.highlights);
  }, [stepIndex, currentStep.highlights, onHighlightChange]);

  // Typewriter effect
  useEffect(() => {
    setDisplayedChars(0);
    setIsTyping(true);

    timerRef.current = setInterval(() => {
      setDisplayedChars((prev) => {
        if (prev >= fullText.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsTyping(false);
          return prev;
        }
        return prev + 1;
      });
    }, TYPEWRITER_SPEED);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stepIndex, fullText]);

  const handleAdvance = useCallback(() => {
    if (isTyping) {
      // Skip to full text
      if (timerRef.current) clearInterval(timerRef.current);
      setDisplayedChars(fullText.length);
      setIsTyping(false);
      return;
    }

    // Advance to next step
    if (stepIndex < DIALOGUE_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete();
    }
  }, [isTyping, stepIndex, fullText.length, onComplete]);

  // Keyboard handler
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleAdvance();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleAdvance]);

  return (
    <div style={introStyles.overlay} onClick={handleAdvance}>
      {/* Skip button */}
      <button
        style={introStyles.skipBtn}
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e8f0'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
      >
        Skip
      </button>

      {/* CEO sprite */}
      <div style={introStyles.spriteContainer}>
        <div style={introStyles.sprite} />
      </div>

      {/* Dialogue box */}
      <div style={introStyles.dialogueBox}>
        <div style={introStyles.speakerLabel}>CEO</div>
        <div style={introStyles.dialogueText}>
          {visibleText.split('\n').map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </div>
        {!isTyping && (
          <span className="blink-indicator" style={introStyles.advanceIndicator}>{'\u25BC'}</span>
        )}
      </div>
    </div>
  );
}

const introStyles = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '24px',
    zIndex: 100,
    cursor: 'pointer',
  },
  skipBtn: {
    position: 'absolute' as const,
    top: '12px',
    right: '16px',
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '4px 8px',
    zIndex: 101,
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  },
  spriteContainer: {
    marginBottom: '16px',
  },
  sprite: {
    width: '64px',
    height: '128px',
    backgroundImage: `url(${ceoSprite})`,
    backgroundPosition: '0 0',
    backgroundSize: `${16 * 6}px ${32 * 4}px`,
    imageRendering: 'pixelated' as const,
  },
  dialogueBox: {
    background: '#1a1a2e',
    border: '2px solid #3b82f6',
    borderRadius: '8px',
    padding: '12px 16px',
    maxWidth: '500px',
    width: '100%',
    position: 'relative' as const,
    marginBottom: '24px',
  },
  speakerLabel: {
    fontSize: '10px',
    color: '#3b82f6',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  dialogueText: {
    fontSize: '13px',
    color: '#e2e8f0',
    lineHeight: 1.5,
    minHeight: '40px',
  },
  advanceIndicator: {
    position: 'absolute' as const,
    bottom: '8px',
    right: '12px',
    fontSize: '10px',
    color: '#3b82f6',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/IntroSequence.tsx
git commit -m "feat: create IntroSequence component with typewriter dialogue"
```

---

### Task 4: Integrate IntroSequence into OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Add IntroSequence import**

In `OfficeView.tsx`, add after the PhaseTracker import (line 16):

```typescript
import { IntroSequence } from './IntroSequence';
```

- [ ] **Step 2: Add blink-indicator CSS keyframes**

In the `<style>` block, after the `.phase-pulse` rule, add:

```css
@keyframes blink-indicator {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.blink-indicator {
  animation: blink-indicator 1s step-end infinite;
}
```

- [ ] **Step 3: Add intro state management**

In the `OfficeView` component function, after the existing state declarations (after line ~318), add:

```typescript
  const [introHighlights, setIntroHighlights] = useState<Phase[] | null>(
    projectState && !projectState.introSeen && phase === 'idle' ? [] : null,
  );

  const showIntro = phase === 'idle' && projectState !== null && !projectState.introSeen && introHighlights !== null;

  const handleIntroComplete = useCallback(async () => {
    setIntroHighlights(null);
    try {
      await window.office.markIntroSeen();
      // Update local store so intro doesn't re-show
      if (projectState) {
        useProjectStore.getState().setProjectState({ ...projectState, introSeen: true });
      }
    } catch (err) {
      console.error('Failed to mark intro seen:', err);
    }
  }, [projectState]);

  const handleHighlightChange = useCallback((phases: Phase[]) => {
    setIntroHighlights(phases);
  }, []);
```

Also add the `Phase` type to the imports from `@shared/types` at the top of the file:

```typescript
import type { AgentRole, ChatMessage, Phase } from '@shared/types';
```

- [ ] **Step 4: Pass highlightedPhases to PhaseTracker**

Change the PhaseTracker line from:

```tsx
      <PhaseTracker />
```

to:

```tsx
      <PhaseTracker highlightedPhases={introHighlights} />
```

- [ ] **Step 5: Add IntroSequence overlay in the main area**

In the main area `<div>`, right after the opening `<div style={styles.main}>` tag (around line 657), add the IntroSequence overlay:

```tsx
      <div style={styles.main}>
        {showIntro && (
          <IntroSequence
            onComplete={handleIntroComplete}
            onHighlightChange={handleHighlightChange}
          />
        )}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: integrate IntroSequence into OfficeView with phase highlights"
```
