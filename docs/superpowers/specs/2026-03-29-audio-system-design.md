# Audio System — Background Music & Sound Effects

## Problem

The app has no audio feedback. Adding background music and sound effects would enhance the retro cozy gaming office vibe and give users audio cues for important events.

## Solution

Ship audio files (music + SFX) with the app. A centralized `AudioManager` service handles all playback. Music auto-plays on start, with separate mute toggles for music and SFX. Mute preferences persist across sessions via localStorage.

---

## 1. AudioManager Service

A singleton class at `src/renderer/src/audio/AudioManager.ts`.

### Music Playback
- Uses `HTMLAudioElement` for the background music loop (handles looping natively)
- `playMusic()` / `stopMusic()` / `setMusicMuted(boolean)`
- Music fades in gently on start (0 to target volume over ~1s)
- Default music volume: 0.3 (ambient, not dominant)

### SFX Playback
- Pre-loads all SFX as `AudioBuffer` objects via Web Audio API on init
- `playSfx(name: SfxName)` creates a one-shot `AudioBufferSourceNode` each time (allows overlapping sounds)
- Default SFX volume: 0.5
- No user-facing volume slider — just mute toggles

### Type-Safe SFX Names

```typescript
type SfxName =
  | 'chat-send'
  | 'phase-start'
  | 'phase-complete'
  | 'artifact-written'
  | 'agent-appear'
  | 'card-pinned'
  | 'review-ready'
  | 'agent-waiting'
  | 'permission-request';
```

---

## 2. Audio Store (Zustand)

A new store at `src/renderer/src/stores/audio.store.ts`.

### State
```typescript
musicMuted: boolean    // default false — auto-play
sfxMuted: boolean      // default false
toggleMusic(): void
toggleSfx(): void
```

### Persistence
Uses `localStorage` to save/restore mute states across sessions. On app start, the store reads from localStorage. When toggled, it writes to localStorage and calls `AudioManager.setMusicMuted()` / `AudioManager.setSfxMuted()`.

### Why a Separate Store
Audio preferences are global — they don't belong to a specific project. They persist across all projects and sessions.

---

## 3. Mute Buttons on Canvas

Two small icon buttons overlaid on the PixiJS canvas area as React elements (positioned absolutely, consistent with ArtifactToolbox and other overlay controls).

### Position
Bottom-right corner of the canvas area, stacked vertically.

### Icons
Unicode/text-based to match the pixel aesthetic:
- Music: `♪` (muted: dimmed with strikethrough style)
- SFX: `♫` (muted: dimmed with strikethrough style)

### Styling
- Size: 24x24px
- `background: rgba(0,0,0,0.3)`, `borderRadius: 4px`
- Normal: `color: colors.textMuted`
- Hover: `color: colors.text`
- Muted state: `opacity: 0.4`

### Component
`AudioControls.tsx` in `src/renderer/src/components/OfficeView/`, rendered inside the canvas area div in OfficeView alongside ArtifactToolbox.

---

## 4. SFX Trigger Points

| Sound | Trigger Location | Event |
|-------|-----------------|-------|
| `chat-send` | `ChatPanel.tsx` | User submits a message |
| `phase-start` | `project.store.ts` — `setPhaseInfo` | Phase status becomes `'active'` |
| `phase-complete` | `project.store.ts` — `setPhaseInfo` | Phase status becomes `'completed'` |
| `artifact-written` | `OfficeView.tsx` | `onArtifactAvailable` IPC listener fires |
| `agent-appear` | `useSceneSync.ts` | Character shown from agent event |
| `card-pinned` | `war-table.store.ts` — `addCard` | Milestone or task card added |
| `review-ready` | `war-table.store.ts` — `setVisualState` | Visual state becomes `'review'` |
| `agent-waiting` | `ChatPanel.tsx` | `onAgentWaiting` IPC listener fires |
| `permission-request` | `PermissionPrompt.tsx` | Permission request appears |

### Music Auto-Play
Triggered in `OfficeView.tsx` on mount — `AudioManager.playMusic()` if not muted.

---

## 5. Audio Assets

### File Location
`src/renderer/src/assets/audio/`

### Music
- `office-bgm.ogg` — looping lo-fi/chiptune track, ~60-90 seconds, cozy office vibe
- Needs to be sourced/created separately
- AudioManager gracefully handles a missing file

### SFX Files (all .ogg, short clips)
| File | Description |
|------|-------------|
| `chat-send.ogg` | Soft keyboard click/tap |
| `phase-start.ogg` | Gentle ascending chime (2-3 notes) |
| `phase-complete.ogg` | Satisfying completion jingle (3-4 notes) |
| `artifact-written.ogg` | Soft "ding" or paper sound |
| `agent-appear.ogg` | Subtle footstep or whoosh |
| `card-pinned.ogg` | Light tap/snap |
| `review-ready.ogg` | Attention chime (slightly more prominent) |
| `agent-waiting.ogg` | Gentle notification tone |
| `permission-request.ogg` | Distinct notification tone |

Audio files need to be sourced separately. The implementation wires up loading and playback — dropping in the actual files is a separate step.

---

## 6. File Changes Summary

| File | Change |
|------|--------|
| `src/renderer/src/audio/AudioManager.ts` | New — singleton audio service, music via HTMLAudioElement, SFX via Web Audio API |
| `src/renderer/src/stores/audio.store.ts` | New — Zustand store with persisted musicMuted/sfxMuted preferences |
| `src/renderer/src/components/OfficeView/AudioControls.tsx` | New — mute toggle buttons for music and SFX |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Render AudioControls, init music auto-play on mount |
| `src/renderer/src/components/OfficeView/ChatPanel.tsx` | Play `chat-send` SFX on message submit |
| `src/renderer/src/stores/project.store.ts` | Play `phase-start` / `phase-complete` SFX in setPhaseInfo |
| `src/renderer/src/stores/war-table.store.ts` | Play `card-pinned` / `review-ready` SFX |
| `src/renderer/src/office/useSceneSync.ts` | Play `agent-appear` SFX on character show |
| `src/renderer/src/components/PermissionPrompt/PermissionPrompt.tsx` | Play `permission-request` SFX |
| `src/renderer/src/assets/audio/` | New directory — music and SFX audio files (.ogg) |
