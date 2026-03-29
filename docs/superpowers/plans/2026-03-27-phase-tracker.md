# Phase Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a phase tracker strip below the top bar in OfficeView that shows progress across Imagine/War Room/Build phases with continue and retry buttons.

**Architecture:** Single new React component (`PhaseTracker`) reads from the existing `useProjectStore`. Integrated into `OfficeView.tsx` between the top bar and main area. No new stores, types, or IPC channels needed.

**Tech Stack:** React, TypeScript, Zustand (existing store), inline styles (existing pattern)

---

### Task 1: Create PhaseTracker component

**Files:**
- Create: `src/renderer/src/components/OfficeView/PhaseTracker.tsx`

**Spec reference:** All sections — this is the entire component.

- [ ] **Step 1: Create the PhaseTracker component file**

Create `src/renderer/src/components/OfficeView/PhaseTracker.tsx` with the full implementation:

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

function getActionButton(
  phase: Phase,
  status: string | undefined,
  completedPhases: Phase[],
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
    return null; // build completed or complete phase — no button
  }

  if (isFailed) {
    if (phase === 'warroom') {
      return { label: 'Retry War Room', action: 'retry', targetPhase: 'warroom' };
    }
    if (phase === 'build') {
      return { label: 'Retry Build', action: 'retry', targetPhase: 'build' };
    }
    return null; // imagine failed — user retypes in chat
  }

  return null; // active/starting/completing — no button
}

export function PhaseTracker() {
  const { projectState, currentPhase } = useProjectStore();
  const [starting, setStarting] = useState(false);

  const phase = projectState?.currentPhase ?? 'idle';
  const completedPhases = projectState?.completedPhases ?? [];
  const status = currentPhase?.status;

  const actionButton = phase !== 'idle' ? getActionButton(phase, status, completedPhases) : null;

  const handleAction = useCallback(async () => {
    if (!actionButton || starting) return;
    setStarting(true);
    try {
      if (actionButton.targetPhase === 'warroom') {
        await window.office.startWarroom();
      } else if (actionButton.targetPhase === 'build') {
        await window.office.startBuild(DEFAULT_BUILD_CONFIG);
      }
    } finally {
      setStarting(false);
    }
  }, [actionButton, starting]);

  if (phase === 'idle') return null;

  return (
    <div style={styles.container}>
      <div style={styles.track}>
        {PHASES.map((p, i) => {
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

      {actionButton && (
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

- [ ] **Step 2: Verify the file was created correctly**

Run: `head -5 src/renderer/src/components/OfficeView/PhaseTracker.tsx`
Expected: The import lines from the component.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/OfficeView/PhaseTracker.tsx
git commit -m "feat: add PhaseTracker component"
```

---

### Task 2: Integrate PhaseTracker into OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

**Spec reference:** Placement, Styling (pulse animation), Component Structure sections.

- [ ] **Step 1: Add PhaseTracker import**

In `src/renderer/src/components/OfficeView/OfficeView.tsx`, add the import after the existing component imports (after line 15 — the `ArtifactOverlay` import):

```typescript
import { PhaseTracker } from './PhaseTracker';
```

- [ ] **Step 2: Add the pulse animation CSS**

In the `<style>` block inside the `return` statement (after the `.bubble-waiting` rule, around line 609), add the phase pulse keyframes:

```css
@keyframes phase-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
  50% { box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
}
.phase-pulse {
  animation: phase-pulse 2s ease-in-out infinite;
}
```

The full `<style>` block should become:

```tsx
<style>{`
  @keyframes pulse-border {
    0%, 100% { border-left-color: var(--accent-color); }
    50% { border-left-color: rgba(255,255,255,0.1); }
  }
  .bubble-waiting {
    animation: pulse-border 1.5s ease-in-out infinite;
  }
  @keyframes phase-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
    50% { box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
  }
  .phase-pulse {
    animation: phase-pulse 2s ease-in-out infinite;
  }
`}</style>
```

- [ ] **Step 3: Insert PhaseTracker between top bar and main area**

Find the comment `{/* Main area */}` (around line 645) and insert the PhaseTracker component right before it:

```tsx
      {/* Phase tracker */}
      <PhaseTracker />

      {/* Main area */}
      <div style={styles.main}>
```

- [ ] **Step 4: Verify the app builds**

Run: `cd "/Users/shahar/Projects/my-projects/office plugin/the-office" && npx tsc --noEmit 2>&1 | grep -i "PhaseTracker"`
Expected: Only the `@shared/types` alias error (same as all other files), no PhaseTracker-specific type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx
git commit -m "feat: integrate PhaseTracker into OfficeView"
```
