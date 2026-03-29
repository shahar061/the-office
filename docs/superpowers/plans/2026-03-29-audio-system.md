# Audio System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add background music and sound effects to the app with separate mute toggles, persisted preferences, and SFX triggers at key interaction points.

**Architecture:** A singleton `AudioManager` class handles all audio playback (HTMLAudioElement for music, Web Audio API for SFX). A Zustand store persists mute preferences via localStorage. An `AudioControls` React component provides mute toggles. SFX calls are sprinkled into existing stores and components at trigger points.

**Tech Stack:** Web Audio API, HTMLAudioElement, Zustand, React, Vite asset imports

---

### Task 1: Create Placeholder Audio Assets

**Files:**
- Create: `src/renderer/src/assets/audio/` directory with placeholder files

- [ ] **Step 1: Create the audio assets directory and placeholder files**

Create the directory and generate minimal valid OGG files as placeholders. These will be replaced with real audio later, but the code needs files to import.

```bash
mkdir -p "src/renderer/src/assets/audio"
```

Use `ffmpeg` to generate silent placeholder OGG files (0.1 second each for SFX, 3 seconds for music):

```bash
cd "src/renderer/src/assets/audio"

# Music placeholder (3 second silent loop)
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 3 -c:a libvorbis office-bgm.ogg -y 2>/dev/null

# SFX placeholders (0.1 second each)
for sfx in chat-send phase-start phase-complete artifact-written agent-appear card-pinned review-ready agent-waiting permission-request; do
  ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.1 -c:a libvorbis "$sfx.ogg" -y 2>/dev/null
done
```

If `ffmpeg` is not available, create empty files as stubs (AudioManager will handle load errors gracefully):

```bash
cd "src/renderer/src/assets/audio"
touch office-bgm.ogg chat-send.ogg phase-start.ogg phase-complete.ogg artifact-written.ogg agent-appear.ogg card-pinned.ogg review-ready.ogg agent-waiting.ogg permission-request.ogg
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/audio/
git commit -m "feat(audio): add placeholder audio asset files"
```

---

### Task 2: Create AudioManager Service

**Files:**
- Create: `src/renderer/src/audio/AudioManager.ts`
- Test: `tests/audio/audio-manager.test.ts`

- [ ] **Step 1: Write tests for AudioManager**

Create `tests/audio/audio-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the audio asset imports
vi.mock('../../src/renderer/src/assets/audio/office-bgm.ogg?url', () => ({ default: 'office-bgm.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/chat-send.ogg?url', () => ({ default: 'chat-send.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/phase-start.ogg?url', () => ({ default: 'phase-start.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/phase-complete.ogg?url', () => ({ default: 'phase-complete.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/artifact-written.ogg?url', () => ({ default: 'artifact-written.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/agent-appear.ogg?url', () => ({ default: 'agent-appear.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/card-pinned.ogg?url', () => ({ default: 'card-pinned.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/review-ready.ogg?url', () => ({ default: 'review-ready.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/agent-waiting.ogg?url', () => ({ default: 'agent-waiting.ogg' }));
vi.mock('../../src/renderer/src/assets/audio/permission-request.ogg?url', () => ({ default: 'permission-request.ogg' }));

import { AudioManager } from '../../src/renderer/src/audio/AudioManager';
import type { SfxName } from '../../src/renderer/src/audio/AudioManager';

describe('AudioManager', () => {
  let manager: AudioManager;

  beforeEach(() => {
    manager = new AudioManager();
  });

  it('starts with music and sfx unmuted', () => {
    expect(manager.isMusicMuted()).toBe(false);
    expect(manager.isSfxMuted()).toBe(false);
  });

  it('can mute and unmute music', () => {
    manager.setMusicMuted(true);
    expect(manager.isMusicMuted()).toBe(true);
    manager.setMusicMuted(false);
    expect(manager.isMusicMuted()).toBe(false);
  });

  it('can mute and unmute sfx', () => {
    manager.setSfxMuted(true);
    expect(manager.isSfxMuted()).toBe(true);
    manager.setSfxMuted(false);
    expect(manager.isSfxMuted()).toBe(false);
  });

  it('does not throw when playing sfx while muted', () => {
    manager.setSfxMuted(true);
    expect(() => manager.playSfx('chat-send')).not.toThrow();
  });

  it('does not throw when playing unknown sfx gracefully', () => {
    expect(() => manager.playSfx('chat-send')).not.toThrow();
  });

  it('does not throw when calling playMusic', () => {
    expect(() => manager.playMusic()).not.toThrow();
  });

  it('does not throw when calling stopMusic', () => {
    expect(() => manager.stopMusic()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/audio/audio-manager.test.ts`
Expected: FAIL — AudioManager not found

- [ ] **Step 3: Create AudioManager**

Create `src/renderer/src/audio/AudioManager.ts`:

```typescript
// Audio asset imports (Vite resolves these to URLs)
import musicUrl from '../assets/audio/office-bgm.ogg?url';
import chatSendUrl from '../assets/audio/chat-send.ogg?url';
import phaseStartUrl from '../assets/audio/phase-start.ogg?url';
import phaseCompleteUrl from '../assets/audio/phase-complete.ogg?url';
import artifactWrittenUrl from '../assets/audio/artifact-written.ogg?url';
import agentAppearUrl from '../assets/audio/agent-appear.ogg?url';
import cardPinnedUrl from '../assets/audio/card-pinned.ogg?url';
import reviewReadyUrl from '../assets/audio/review-ready.ogg?url';
import agentWaitingUrl from '../assets/audio/agent-waiting.ogg?url';
import permissionRequestUrl from '../assets/audio/permission-request.ogg?url';

export type SfxName =
  | 'chat-send'
  | 'phase-start'
  | 'phase-complete'
  | 'artifact-written'
  | 'agent-appear'
  | 'card-pinned'
  | 'review-ready'
  | 'agent-waiting'
  | 'permission-request';

const SFX_URLS: Record<SfxName, string> = {
  'chat-send': chatSendUrl,
  'phase-start': phaseStartUrl,
  'phase-complete': phaseCompleteUrl,
  'artifact-written': artifactWrittenUrl,
  'agent-appear': agentAppearUrl,
  'card-pinned': cardPinnedUrl,
  'review-ready': reviewReadyUrl,
  'agent-waiting': agentWaitingUrl,
  'permission-request': permissionRequestUrl,
};

const MUSIC_VOLUME = 0.3;
const SFX_VOLUME = 0.5;
const FADE_DURATION = 1000; // ms

export class AudioManager {
  private musicEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private sfxBuffers: Map<SfxName, AudioBuffer> = new Map();
  private musicMuted = false;
  private sfxMuted = false;
  private initialized = false;

  isMusicMuted(): boolean {
    return this.musicMuted;
  }

  isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    if (this.musicEl) {
      this.musicEl.muted = muted;
    }
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
  }

  playMusic(): void {
    if (this.musicMuted) return;
    this.initMusic();
    if (this.musicEl) {
      this.musicEl.volume = 0;
      this.musicEl.play().catch(() => {});
      this.fadeInMusic();
    }
  }

  stopMusic(): void {
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicEl.currentTime = 0;
    }
  }

  playSfx(name: SfxName): void {
    if (this.sfxMuted) return;
    this.initAudioContext();
    const buffer = this.sfxBuffers.get(name);
    if (!buffer || !this.audioCtx) return;
    const source = this.audioCtx.createBufferSource();
    const gain = this.audioCtx.createGain();
    gain.gain.value = SFX_VOLUME;
    source.buffer = buffer;
    source.connect(gain).connect(this.audioCtx.destination);
    source.start();
  }

  async preloadSfx(): Promise<void> {
    this.initAudioContext();
    if (!this.audioCtx) return;
    const entries = Object.entries(SFX_URLS) as [SfxName, string][];
    await Promise.all(
      entries.map(async ([name, url]) => {
        try {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.audioCtx!.decodeAudioData(arrayBuffer);
          this.sfxBuffers.set(name, audioBuffer);
        } catch {
          // Gracefully skip missing/invalid audio files
        }
      }),
    );
  }

  private initMusic(): void {
    if (this.musicEl) return;
    this.musicEl = new Audio(musicUrl);
    this.musicEl.loop = true;
    this.musicEl.muted = this.musicMuted;
  }

  private initAudioContext(): void {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new AudioContext();
    } catch {
      // Web Audio not available
    }
  }

  private fadeInMusic(): void {
    if (!this.musicEl) return;
    const start = performance.now();
    const tick = () => {
      if (!this.musicEl) return;
      const elapsed = performance.now() - start;
      const progress = Math.min(elapsed / FADE_DURATION, 1);
      this.musicEl.volume = progress * MUSIC_VOLUME;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// Singleton instance
export const audioManager = new AudioManager();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/audio/audio-manager.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/audio/AudioManager.ts tests/audio/audio-manager.test.ts
git commit -m "feat(audio): add AudioManager service with music and SFX playback"
```

---

### Task 3: Create Audio Store

**Files:**
- Create: `src/renderer/src/stores/audio.store.ts`
- Test: `tests/stores/audio.store.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/stores/audio.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AudioManager before importing the store
vi.mock('../../src/renderer/src/audio/AudioManager', () => ({
  audioManager: {
    setMusicMuted: vi.fn(),
    setSfxMuted: vi.fn(),
    playMusic: vi.fn(),
    stopMusic: vi.fn(),
  },
}));

import { useAudioStore } from '../../src/renderer/src/stores/audio.store';
import { audioManager } from '../../src/renderer/src/audio/AudioManager';

describe('audio.store', () => {
  beforeEach(() => {
    useAudioStore.setState({ musicMuted: false, sfxMuted: false });
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('starts with music and sfx unmuted', () => {
    const state = useAudioStore.getState();
    expect(state.musicMuted).toBe(false);
    expect(state.sfxMuted).toBe(false);
  });

  it('toggleMusic flips musicMuted and calls AudioManager', () => {
    useAudioStore.getState().toggleMusic();
    expect(useAudioStore.getState().musicMuted).toBe(true);
    expect(audioManager.setMusicMuted).toHaveBeenCalledWith(true);
  });

  it('toggleSfx flips sfxMuted and calls AudioManager', () => {
    useAudioStore.getState().toggleSfx();
    expect(useAudioStore.getState().sfxMuted).toBe(true);
    expect(audioManager.setSfxMuted).toHaveBeenCalledWith(true);
  });

  it('toggleMusic twice returns to unmuted', () => {
    useAudioStore.getState().toggleMusic();
    useAudioStore.getState().toggleMusic();
    expect(useAudioStore.getState().musicMuted).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/stores/audio.store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create audio store**

Create `src/renderer/src/stores/audio.store.ts`:

```typescript
import { create } from 'zustand';
import { audioManager } from '../audio/AudioManager';

const STORAGE_KEY = 'the-office-audio-prefs';

interface AudioPrefs {
  musicMuted: boolean;
  sfxMuted: boolean;
}

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { musicMuted: false, sfxMuted: false };
}

function savePrefs(prefs: AudioPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

interface AudioStore {
  musicMuted: boolean;
  sfxMuted: boolean;
  toggleMusic: () => void;
  toggleSfx: () => void;
}

const initial = loadPrefs();

export const useAudioStore = create<AudioStore>((set) => ({
  musicMuted: initial.musicMuted,
  sfxMuted: initial.sfxMuted,

  toggleMusic: () =>
    set((state) => {
      const musicMuted = !state.musicMuted;
      audioManager.setMusicMuted(musicMuted);
      if (musicMuted) {
        audioManager.stopMusic();
      } else {
        audioManager.playMusic();
      }
      savePrefs({ musicMuted, sfxMuted: state.sfxMuted });
      return { musicMuted };
    }),

  toggleSfx: () =>
    set((state) => {
      const sfxMuted = !state.sfxMuted;
      audioManager.setSfxMuted(sfxMuted);
      savePrefs({ musicMuted: state.musicMuted, sfxMuted });
      return { sfxMuted };
    }),
}));

// Apply persisted mute states to AudioManager on load
audioManager.setMusicMuted(initial.musicMuted);
audioManager.setSfxMuted(initial.sfxMuted);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/stores/audio.store.test.ts`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/audio.store.ts tests/stores/audio.store.test.ts
git commit -m "feat(audio): add Zustand audio store with persisted mute preferences"
```

---

### Task 4: Create AudioControls Component

**Files:**
- Create: `src/renderer/src/components/OfficeView/AudioControls.tsx`

- [ ] **Step 1: Create AudioControls component**

Create `src/renderer/src/components/OfficeView/AudioControls.tsx`:

```tsx
import { useAudioStore } from '../../stores/audio.store';
import { colors } from '../../theme';

export function AudioControls() {
  const musicMuted = useAudioStore((s) => s.musicMuted);
  const sfxMuted = useAudioStore((s) => s.sfxMuted);
  const toggleMusic = useAudioStore((s) => s.toggleMusic);
  const toggleSfx = useAudioStore((s) => s.toggleSfx);

  return (
    <div style={styles.container}>
      <button
        style={styles.button(musicMuted)}
        onClick={toggleMusic}
        title={musicMuted ? 'Unmute music' : 'Mute music'}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = musicMuted ? colors.textDark : colors.textMuted; }}
      >
        {musicMuted ? <span style={styles.strikethrough}>{'\u266A'}</span> : '\u266A'}
      </button>
      <button
        style={styles.button(sfxMuted)}
        onClick={toggleSfx}
        title={sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = sfxMuted ? colors.textDark : colors.textMuted; }}
      >
        {sfxMuted ? <span style={styles.strikethrough}>{'\u266B'}</span> : '\u266B'}
      </button>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute' as const,
    bottom: '12px',
    right: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    zIndex: 5,
  },
  button: (muted: boolean): React.CSSProperties => ({
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
    border: 'none',
    borderRadius: '4px',
    color: muted ? colors.textDark : colors.textMuted,
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    opacity: muted ? 0.4 : 1,
    transition: 'color 0.15s, opacity 0.15s',
  }),
  strikethrough: {
    textDecoration: 'line-through',
  } as React.CSSProperties,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/OfficeView/AudioControls.tsx
git commit -m "feat(audio): add AudioControls mute toggle component"
```

---

### Task 5: Wire AudioControls and Music Auto-Play into OfficeView

**Files:**
- Modify: `src/renderer/src/components/OfficeView/OfficeView.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top of `src/renderer/src/components/OfficeView/OfficeView.tsx`:

```typescript
import { AudioControls } from './AudioControls';
import { audioManager } from '../../audio/AudioManager';
import { useAudioStore } from '../../stores/audio.store';
```

- [ ] **Step 2: Add music auto-play effect**

Inside the `OfficeView` component, add a `useEffect` for music auto-play (after the existing effects):

```typescript
// Auto-play music on mount, preload SFX
useEffect(() => {
  const { musicMuted } = useAudioStore.getState();
  if (!musicMuted) {
    audioManager.playMusic();
  }
  audioManager.preloadSfx();
}, []);
```

- [ ] **Step 3: Add artifact-written SFX trigger**

Find the existing `onArtifactAvailable` listener in `App.tsx` (line 30). Since it's in App.tsx (not OfficeView), we'll add the SFX call there instead. In `src/renderer/src/App.tsx`, add the import:

```typescript
import { audioManager } from './audio/AudioManager';
```

And update the `onArtifactAvailable` listener:

```typescript
window.office.onArtifactAvailable((payload) => {
  markArtifactAvailable(payload.key);
  audioManager.playSfx('artifact-written');
}),
```

- [ ] **Step 4: Render AudioControls**

In OfficeView's JSX, find the canvas area div (the one with `styles.canvasArea`). Add `AudioControls` inside it, alongside `ArtifactToolbox`:

```tsx
<AudioControls />
```

Place it right after `<ArtifactToolbox />` (around line 333).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/OfficeView.tsx src/renderer/src/App.tsx
git commit -m "feat(audio): wire AudioControls and music auto-play into OfficeView"
```

---

### Task 6: Add SFX Triggers — Stores

**Files:**
- Modify: `src/renderer/src/stores/project.store.ts`
- Modify: `src/renderer/src/stores/war-table.store.ts`

- [ ] **Step 1: Add SFX triggers to project store**

In `src/renderer/src/stores/project.store.ts`, add import:

```typescript
import { audioManager } from '../audio/AudioManager';
```

Inside `setPhaseInfo`, add SFX calls. After the existing terminal status check (`if (TERMINAL.includes(info.status))`), add:

```typescript
      // Play phase SFX
      if (info.status === 'active') {
        audioManager.playSfx('phase-start');
      } else if (info.status === 'completed') {
        audioManager.playSfx('phase-complete');
      }
```

- [ ] **Step 2: Add SFX triggers to war table store**

In `src/renderer/src/stores/war-table.store.ts`, add import:

```typescript
import { audioManager } from '../audio/AudioManager';
```

In `addCard`, add at the end of the set callback (before the return):

```typescript
  addCard: (card) =>
    set((state) => {
      audioManager.playSfx('card-pinned');
      if (card.type === 'milestone') {
        return { milestones: [...state.milestones, card] };
      }
      return { tasks: [...state.tasks, card] };
    }),
```

In `setVisualState`, play review-ready SFX when entering review state:

```typescript
  setVisualState: (visualState) => {
    if (visualState === 'review') {
      audioManager.playSfx('review-ready');
    }
    set({ visualState });
  },
```

Note: `setVisualState` changes from an arrow shorthand to a function body to add the SFX call before `set()`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/project.store.ts src/renderer/src/stores/war-table.store.ts
git commit -m "feat(audio): add SFX triggers to project and war-table stores"
```

---

### Task 7: Add SFX Triggers — Components

**Files:**
- Modify: `src/renderer/src/components/OfficeView/ChatPanel.tsx`
- Modify: `src/renderer/src/components/PermissionPrompt/PermissionPrompt.tsx`
- Modify: `src/renderer/src/office/useSceneSync.ts`

- [ ] **Step 1: Add chat-send SFX**

In `src/renderer/src/components/OfficeView/ChatPanel.tsx`, add import:

```typescript
import { audioManager } from '../../audio/AudioManager';
```

Find the message submit handler (the function that calls `window.office.startImagine` or `window.office.sendMessage`, around line 227-231). Add the SFX call at the beginning of the submit handler, before the API calls:

```typescript
audioManager.playSfx('chat-send');
```

- [ ] **Step 2: Add agent-waiting SFX**

In the same `ChatPanel.tsx`, find the `onAgentWaiting` listener (line 163). Add the SFX call:

```typescript
  useEffect(() => {
    const unsub = window.office.onAgentWaiting((payload) => {
      audioManager.playSfx('agent-waiting');
      setWaiting(payload);
    });
    return unsub;
  }, []);
```

- [ ] **Step 3: Add permission-request SFX**

In `src/renderer/src/components/PermissionPrompt/PermissionPrompt.tsx`, add import:

```typescript
import { audioManager } from '../../audio/AudioManager';
```

In the `onPermissionRequest` listener (line 8), add the SFX call:

```typescript
  useEffect(() => {
    const unsubscribe = window.office.onPermissionRequest((req) => {
      audioManager.playSfx('permission-request');
      setQueue((prev) => [...prev, req]);
    });
    return unsubscribe;
  }, []);
```

- [ ] **Step 4: Add agent-appear SFX**

In `src/renderer/src/office/useSceneSync.ts`, add import:

```typescript
import { audioManager } from '../audio/AudioManager';
```

Find where `scene.showCharacter(role)` is called for newly active agents (around line 82). Add the SFX call:

```typescript
      for (const role of current) {
        if (!prevActive.has(role)) {
          scene.showCharacter(role);
          audioManager.playSfx('agent-appear');
          const character = scene.getCharacter(role);
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/OfficeView/ChatPanel.tsx src/renderer/src/components/PermissionPrompt/PermissionPrompt.tsx src/renderer/src/office/useSceneSync.ts
git commit -m "feat(audio): add SFX triggers to ChatPanel, PermissionPrompt, and useSceneSync"
```

---

### Task 8: Integration Testing

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (same pre-existing 4 failures in Character.visibility.test.ts)

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit:

```bash
git add -A
git commit -m "fix(audio): address integration issues"
```
