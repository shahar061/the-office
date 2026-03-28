# War Room Intro Cinematic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cinematic intro to the War Room phase — PM walks to the boardroom with fog of war and camera tracking, followed by a 3-step dialog explaining the phase, then seamlessly transitions into the existing warroom orchestration.

**Architecture:** Generalize the existing IntroSequence component to accept configurable steps/speaker. Add `setCenter()` to FogOfWar for dynamic tracking. New `useWarRoomIntro` hook orchestrates the cinematic. Backend waits for a `WARROOM_INTRO_DONE` IPC signal before starting the orchestrator.

**Tech Stack:** React, PixiJS, Zustand, Electron IPC, Vitest

---

### Task 1: Add setCenter to FogOfWar

**Files:**
- Modify: `src/renderer/src/office/engine/FogOfWar.ts`

- [ ] **Step 1: Add setCenter method**

In `src/renderer/src/office/engine/FogOfWar.ts`, add this method to the `FogOfWar` class, after the `skip()` method (around line 106):

```typescript
/** Update the clear zone center (for tracking a moving character). */
setCenter(x: number, y: number): void {
  if (this.destroyed) return;
  this.clearCenterX = x;
  this.clearCenterY = y;
  // Force redraw on next update
  this.lastDrawnRadius = -1;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/office/engine/FogOfWar.ts
git commit -m "feat(warroom-intro): add setCenter to FogOfWar for dynamic tracking"
```

---

### Task 2: Add createFog overload and setFogCenter to OfficeScene

**Files:**
- Modify: `src/renderer/src/office/OfficeScene.ts`

- [ ] **Step 1: Update createFog to accept optional center coordinates**

In `src/renderer/src/office/OfficeScene.ts`, replace the existing `createFog()` method (lines 350-361) with:

```typescript
/** Create fog overlay. Defaults to CEO room center; pass coords to override. */
createFog(centerX?: number, centerY?: number): void {
  if (this.fog) return; // already exists
  const mapPxW = this.mapRenderer.width * this.mapRenderer.tileSize;
  const mapPxH = this.mapRenderer.height * this.mapRenderer.tileSize;

  if (centerX !== undefined && centerY !== undefined) {
    this.fog = new FogOfWar(mapPxW, mapPxH, centerX, centerY);
  } else {
    const ceoZone = this.mapRenderer.getZone('ceo-room');
    if (!ceoZone) return;
    const cx = (ceoZone.x + ceoZone.width / 2) * this.mapRenderer.tileSize;
    const cy = (ceoZone.y + ceoZone.height / 2) * this.mapRenderer.tileSize;
    this.fog = new FogOfWar(mapPxW, mapPxH, cx, cy);
  }
  this.worldContainer.addChild(this.fog.container);
}
```

- [ ] **Step 2: Add setFogCenter method**

Add after the `setFogStep` method (around line 364):

```typescript
setFogCenter(x: number, y: number): void {
  this.fog?.setCenter(x, y);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/office/OfficeScene.ts
git commit -m "feat(warroom-intro): add createFog overload and setFogCenter to OfficeScene"
```

---

### Task 3: Generalize IntroSequence Component

**Files:**
- Modify: `src/renderer/src/components/OfficeView/IntroSequence.tsx`

- [ ] **Step 1: Export DialogueStep and move steps to props**

Replace the entire `IntroSequence.tsx` with:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Phase } from '@shared/types';
import { colors } from '../../theme';

export interface DialogueStep {
  text: string;
  highlights: Phase[];
  highlightChat?: boolean;
}

const TYPEWRITER_SPEED = 30; // ms per character

interface IntroSequenceProps {
  steps: DialogueStep[];
  speaker: string;
  speakerColor?: string;
  onComplete: () => void;
  onHighlightChange: (phases: Phase[]) => void;
  onChatHighlightChange: (highlight: boolean) => void;
  onStepChange?: (step: number) => void;
}

export function IntroSequence({
  steps,
  speaker,
  speakerColor,
  onComplete,
  onHighlightChange,
  onChatHighlightChange,
  onStepChange,
}: IntroSequenceProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = steps[stepIndex];
  const fullText = currentStep.text;
  const visibleText = isTyping ? fullText.slice(0, displayedChars) : fullText;

  const resolvedColor = speakerColor ?? colors.accent;

  // Update phase and chat highlights when step changes
  useEffect(() => {
    onHighlightChange(currentStep.highlights);
    onChatHighlightChange(currentStep.highlightChat ?? false);
  }, [stepIndex, currentStep.highlights, currentStep.highlightChat, onHighlightChange, onChatHighlightChange]);

  // Notify parent of step changes (for fog of war + camera coordination)
  useEffect(() => {
    onStepChange?.(stepIndex);
  }, [stepIndex, onStepChange]);

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
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onComplete();
    }
  }, [isTyping, stepIndex, steps.length, fullText.length, onComplete]);

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
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = colors.textDim; }}
      >
        Skip
      </button>

      {/* Dialogue box at bottom */}
      <div style={{ ...introStyles.dialogueBox, borderColor: resolvedColor }}>
        <div style={{ ...introStyles.speakerLabel, color: resolvedColor }}>{speaker}</div>
        <div style={introStyles.dialogueText}>
          {visibleText.split('\n').map((line, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </div>
        {!isTyping && (
          <span className="blink-indicator" style={{ ...introStyles.advanceIndicator, color: resolvedColor }}>{'\u25BC'}</span>
        )}
      </div>
    </div>
  );
}

const introStyles = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.7) 100%)',
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
    background: 'rgba(0,0,0,0.4)',
    border: 'none',
    color: colors.textMuted,
    fontSize: '11px',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: '4px',
    zIndex: 101,
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  },
  dialogueBox: {
    background: colors.surface,
    border: `2px solid ${colors.accent}`,
    borderRadius: '8px',
    padding: '12px 16px',
    maxWidth: '500px',
    width: '100%',
    position: 'relative' as const,
    marginBottom: '24px',
  },
  speakerLabel: {
    fontSize: '10px',
    color: colors.accent,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  dialogueText: {
    fontSize: '13px',
    color: colors.text,
    lineHeight: 1.5,
    minHeight: '40px',
  },
  advanceIndicator: {
    position: 'absolute' as const,
    bottom: '8px',
    right: '12px',
    fontSize: '10px',
    color: colors.accent,
  },
};
```

Key changes from the original:
- `DialogueStep` is exported (was private interface)
- `steps` and `speaker` come from props (were hardcoded)
- `speakerColor` prop controls border, label, and indicator colors (defaults to `colors.accent`)
- Dialog box `borderColor` uses `resolvedColor` via inline style spread
- Speaker label and advance indicator use `resolvedColor`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/IntroSequence.tsx
git commit -m "feat(warroom-intro): generalize IntroSequence to accept steps/speaker props"
```

---

### Task 4: Update useIntro to Pass CEO Steps

**Files:**
- Modify: `src/renderer/src/components/OfficeView/useIntro.ts`
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Define CEO steps in useIntro and export them**

In `src/renderer/src/components/OfficeView/useIntro.ts`, add at the top (after imports):

```typescript
import type { DialogueStep } from './IntroSequence';

export const CEO_INTRO_STEPS: DialogueStep[] = [
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
    text: 'Over there is where we chat. You can talk to the team, answer their questions, and guide the project as it moves along.',
    highlights: [],
    highlightChat: true,
  },
  {
    text: 'So, what would you like to build?',
    highlights: [],
  },
];
```

- [ ] **Step 2: Update OfficeView to pass CEO steps to IntroSequence**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, update the IntroSequence import:

```typescript
import { IntroSequence } from './IntroSequence';
```

And add an import for the steps:

```typescript
import { CEO_INTRO_STEPS } from './useIntro';
```

Find the `<IntroSequence` render (around line 336) and add the new props:

```tsx
<IntroSequence
  steps={CEO_INTRO_STEPS}
  speaker="CEO"
  onComplete={handleIntroComplete}
  onHighlightChange={handleHighlightChange}
  onChatHighlightChange={handleChatHighlightChange}
  onStepChange={handleStepChange}
/>
```

- [ ] **Step 3: Verify the app still compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/OfficeView/useIntro.ts src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat(warroom-intro): pass CEO steps to generalized IntroSequence"
```

---

### Task 5: Add Shared Types for Warroom Intro IPC

**Files:**
- Modify: `shared/types.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Add IPC channel and update choreography type**

In `shared/types.ts`, add to the `IPC_CHANNELS` object, in the War Table section (after `WAR_TABLE_CHOREOGRAPHY`):

```typescript
  WARROOM_INTRO_DONE: 'office:warroom-intro-done',
```

Update the `WarTableChoreographyPayload` interface (line 186-188) to include the new step:

```typescript
export interface WarTableChoreographyPayload {
  step: 'intro-walk' | 'pm-reading' | 'pm-writing' | 'pm-done' | 'tl-reading' | 'tl-writing' | 'tl-done';
}
```

Add to the `OfficeAPI` interface, in the War Table section (after `onWarTableChoreography`):

```typescript
  warRoomIntroDone(): Promise<void>;
```

- [ ] **Step 2: Wire preload bridge**

In `electron/preload.ts`, add after the `onWarTableChoreography` line (line 82):

```typescript
  warRoomIntroDone: () => ipcRenderer.invoke(IPC_CHANNELS.WARROOM_INTRO_DONE),
```

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts electron/preload.ts
git commit -m "feat(warroom-intro): add WARROOM_INTRO_DONE IPC and intro-walk choreography step"
```

---

### Task 6: Add Backend Intro Wait Logic

**Files:**
- Modify: `electron/orchestrator/warroom.ts`
- Modify: `electron/ipc/phase-handlers.ts`
- Modify: `electron/ipc/state.ts`

- [ ] **Step 1: Add pending intro state**

In `electron/ipc/state.ts`, add after the `PendingReview` section (around line 67):

```typescript
// Pending warroom intro completion
export interface PendingIntro {
  resolve: () => void;
}
export let pendingIntro: PendingIntro | null = null;

export function setPendingIntro(pi: PendingIntro | null): void {
  pendingIntro = pi;
}
```

- [ ] **Step 2: Add waitForIntro to warroom config and orchestrator**

In `electron/orchestrator/warroom.ts`, add a new field to `WarroomConfig`:

```typescript
export interface WarroomConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
  onWarTableState: (state: WarTableVisualState) => void;
  onWarTableCardAdded: (card: WarTableCard) => void;
  onWarTableChoreography: (payload: WarTableChoreographyPayload) => void;
  onReviewReady: (content: string, artifact: 'plan' | 'tasks') => Promise<WarTableReviewResponse>;
  waitForIntro: () => Promise<void>;
}
```

Then in `runWarroom`, add the intro step at the very beginning, before Act 1:

Replace lines 21-25 (the start of Act 1):

```typescript
  // ── Act 1: PM reads artifacts and writes plan ──

  onWarTableState('growing');
  onWarTableChoreography({ step: 'pm-reading' });
  onSystemMessage('War Room started — Project Manager is analyzing the Imagine artifacts...');
```

With:

```typescript
  // ── Intro: PM walks to boardroom with cinematic dialog ──

  onWarTableChoreography({ step: 'intro-walk' });
  await config.waitForIntro();

  // ── Act 1: PM reads artifacts and writes plan ──

  onWarTableState('growing');
  onWarTableChoreography({ step: 'pm-reading' });
  onSystemMessage('War Room started — Project Manager is analyzing the Imagine artifacts...');
```

- [ ] **Step 3: Wire the IPC handler and pass waitForIntro to runWarroom**

In `electron/ipc/phase-handlers.ts`, add imports at the top:

```typescript
import { pendingIntro, setPendingIntro } from './state';
```

(Add `pendingIntro` and `setPendingIntro` to existing state imports.)

Add a new IPC handler inside `initPhaseHandlers()`, in the War Table section (after `WAR_TABLE_REVIEW_RESPONSE` handler):

```typescript
  ipcMain.handle(IPC_CHANNELS.WARROOM_INTRO_DONE, async () => {
    if (pendingIntro) {
      pendingIntro.resolve();
      setPendingIntro(null);
    }
  });
```

In `handleStartWarroom()`, add `waitForIntro` to the `runWarroom` config. Add it after the `onReviewReady` callback:

```typescript
      waitForIntro: () => {
        return new Promise<void>((resolve) => {
          setPendingIntro({ resolve });
        });
      },
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add electron/orchestrator/warroom.ts electron/ipc/phase-handlers.ts electron/ipc/state.ts
git commit -m "feat(warroom-intro): add backend intro wait logic with IPC handshake"
```

---

### Task 7: Add warRoomIntroActive to Project Store

**Files:**
- Modify: `src/renderer/src/stores/project.store.ts`

- [ ] **Step 1: Add warRoomIntroActive state**

In `src/renderer/src/stores/project.store.ts`, add to the `ProjectStore` interface:

```typescript
interface ProjectStore {
  authStatus: AuthStatus;
  projectState: ProjectState | null;
  currentPhase: PhaseInfo | null;
  warRoomIntroActive: boolean;
  setAuthStatus: (status: AuthStatus) => void;
  setProjectState: (state: ProjectState | null) => void;
  setPhaseInfo: (info: PhaseInfo) => void;
  setWarRoomIntroActive: (active: boolean) => void;
}
```

Add to the store implementation:

```typescript
export const useProjectStore = create<ProjectStore>((set) => ({
  authStatus: { connected: false },
  projectState: null,
  currentPhase: null,
  warRoomIntroActive: false,
  setAuthStatus: (status) => set({ authStatus: status }),
  setProjectState: (state) => set({ projectState: state }),
  setWarRoomIntroActive: (active) => set({ warRoomIntroActive: active }),
  setPhaseInfo: (info) =>
    set((state) => {
      const ps = state.projectState;

      const TERMINAL = ['completed', 'failed', 'interrupted'];
      if (TERMINAL.includes(info.status)) {
        useOfficeStore.getState().clearAgentActivity();
      }

      // Activate warroom intro when warroom phase starts
      const warRoomIntroActive =
        info.phase === 'warroom' && info.status === 'active'
          ? true
          : state.warRoomIntroActive;

      if (!ps) return { currentPhase: info, warRoomIntroActive };

      const completedPhases =
        info.status === 'completed' && !ps.completedPhases.includes(info.phase)
          ? [...ps.completedPhases, info.phase]
          : ps.completedPhases;

      return {
        currentPhase: info,
        warRoomIntroActive,
        projectState: {
          ...ps,
          currentPhase: info.phase,
          completedPhases,
        },
      };
    }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/stores/project.store.ts
git commit -m "feat(warroom-intro): add warRoomIntroActive to project store"
```

---

### Task 8: Create useWarRoomIntro Hook

**Files:**
- Create: `src/renderer/src/components/OfficeView/useWarRoomIntro.ts`

- [ ] **Step 1: Create the hook**

Create `src/renderer/src/components/OfficeView/useWarRoomIntro.ts`:

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Phase } from '@shared/types';
import { AGENT_COLORS } from '@shared/types';
import { useProjectStore } from '../../stores/project.store';
import type { OfficeScene } from '../../office/OfficeScene';
import type { DialogueStep } from './IntroSequence';

const WARROOM_INTRO_STEPS: DialogueStep[] = [
  {
    text: "Time to turn vision into action. I'm the Project Manager \u2014 I'll be leading the War Room phase.",
    highlights: ['warroom'] as Phase[],
  },
  {
    text: "I'll review everything the leadership team created and write a battle plan. You'll get to review it before we move on.",
    highlights: ['imagine', 'warroom'] as Phase[],
  },
  {
    text: "Then the Team Lead will break it into tasks for the engineers. Let's get started.",
    highlights: ['warroom', 'build'] as Phase[],
  },
];

export const WARROOM_SPEAKER = 'Project Manager';
export const WARROOM_SPEAKER_COLOR = AGENT_COLORS['project-manager'];

export function useWarRoomIntro(scene: OfficeScene | null) {
  const warRoomIntroActive = useProjectStore((s) => s.warRoomIntroActive);
  const setWarRoomIntroActive = useProjectStore((s) => s.setWarRoomIntroActive);

  const [showDialog, setShowDialog] = useState(false);
  const [highlights, setHighlights] = useState<Phase[]>([]);
  const trackingRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // Phase 1: PM walk-in with fog tracking
  useEffect(() => {
    if (!warRoomIntroActive || !scene) return;

    const pm = scene.getCharacter('project-manager');
    if (!pm) return;

    // Show PM at entrance
    const entrance = scene.getEntrancePosition();
    scene.showCharacter('project-manager');
    pm.repositionTo(entrance.x, entrance.y);

    // Create fog centered on PM's pixel position
    const pmPos = pm.getPixelPosition();
    scene.createFog(pmPos.x, pmPos.y);

    // Camera: snap to PM at 2.5x zoom
    const camera = scene.getCamera();
    const tileSize = scene.getMapRenderer().tileSize;
    camera.snapTo(pmPos.x, pmPos.y, 2.5);

    // Walk PM to boardroom
    const boardroom = scene.getMapRenderer().getZone('boardroom');
    if (boardroom) {
      const bx = boardroom.x + Math.floor(boardroom.width / 2);
      const by = boardroom.y + Math.floor(boardroom.height / 2);
      pm.moveTo({ x: bx, y: by });
    }

    // Track PM position each frame: update fog center + camera
    function trackPM() {
      const s = sceneRef.current;
      if (!s) return;
      const pm = s.getCharacter('project-manager');
      if (!pm) return;

      const pos = pm.getPixelPosition();
      s.setFogCenter(pos.x, pos.y);

      // Smooth camera follow
      const cam = s.getCamera();
      cam.snapTo(pos.x, pos.y, 2.5);

      // Check if PM has arrived (no longer walking)
      if (pm.getState() !== 'walk') {
        // PM arrived at boardroom — show dialog
        setShowDialog(true);
        return; // stop tracking
      }

      trackingRef.current = requestAnimationFrame(trackPM);
    }

    // Start tracking after a brief delay to let moveTo set state to 'walk'
    const startTimer = setTimeout(() => {
      trackingRef.current = requestAnimationFrame(trackPM);
    }, 100);

    return () => {
      clearTimeout(startTimer);
      if (trackingRef.current) {
        cancelAnimationFrame(trackingRef.current);
        trackingRef.current = null;
      }
    };
  }, [warRoomIntroActive, scene]);

  // Dialog completion
  const handleIntroComplete = useCallback(async () => {
    if (!scene) return;

    // Fog fades out
    scene.skipFog();

    // Signal backend that intro is done
    try {
      await window.office.warRoomIntroDone();
    } catch (err) {
      console.error('Failed to signal warroom intro done:', err);
    }

    // Delay cleanup to let fog fade (1200ms matches intro)
    setTimeout(() => {
      setShowDialog(false);
      setHighlights([]);
      setWarRoomIntroActive(false);
    }, 1200);
  }, [scene, setWarRoomIntroActive]);

  const handleHighlightChange = useCallback((phases: Phase[]) => {
    setHighlights(phases);
  }, []);

  return {
    warRoomIntroActive,
    showDialog,
    highlights,
    introSteps: WARROOM_INTRO_STEPS,
    handleIntroComplete,
    handleHighlightChange,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/useWarRoomIntro.ts
git commit -m "feat(warroom-intro): add useWarRoomIntro hook"
```

---

### Task 9: Wire War Room Intro into OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Import useWarRoomIntro and wire it**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, add import:

```typescript
import { useWarRoomIntro, WARROOM_SPEAKER, WARROOM_SPEAKER_COLOR } from './useWarRoomIntro';
```

Inside the `OfficeView` component, after the `useIntro` hook call, add:

```typescript
const {
  warRoomIntroActive: showWarRoomIntro,
  showDialog: showWarRoomDialog,
  highlights: warRoomHighlights,
  introSteps: warRoomSteps,
  handleIntroComplete: handleWarRoomIntroComplete,
  handleHighlightChange: handleWarRoomHighlightChange,
} = useWarRoomIntro(officeScene);
```

- [ ] **Step 2: Render the warroom IntroSequence**

In the JSX, add the warroom IntroSequence alongside the existing intro. Find the existing `{showIntro && (` block (around line 335) and add after its closing `)}`:

```tsx
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
```

- [ ] **Step 3: Pass warroom highlights to PhaseTracker**

The PhaseTracker already accepts `highlightedPhases`. During the warroom intro, pass the warroom highlights instead of the intro highlights:

Find the `<PhaseTracker` line (around line 316) and update it:

```tsx
<PhaseTracker highlightedPhases={introHighlights ?? (showWarRoomIntro ? warRoomHighlights : null)} />
```

This means: if the main intro is active, use its highlights. Otherwise, if the warroom intro is active, use warroom highlights. Otherwise, null (normal mode).

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat(warroom-intro): wire warroom intro into OfficeView"
```

---

### Task 10: Handle intro-walk in useSceneSync

**Files:**
- Modify: `src/renderer/src/office/useSceneSync.ts`

- [ ] **Step 1: Add intro-walk case to choreography handler**

In `src/renderer/src/office/useSceneSync.ts`, find the choreography switch statement (around line 193). Add a new case at the top of the switch, before `'pm-reading'`:

```typescript
        case 'intro-walk': {
          // Warroom intro handles PM walk and fog — choreography is managed by useWarRoomIntro
          // Show PM character so it's visible in the scene
          scene!.showCharacter('project-manager');
          break;
        }
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/office/useSceneSync.ts
git commit -m "feat(warroom-intro): handle intro-walk choreography step"
```

---

### Task 11: Integration Testing

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (same as before — 4 pre-existing failures in Character.visibility.test.ts are unrelated)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit:

```bash
git add -A
git commit -m "fix(warroom-intro): address integration issues"
```
