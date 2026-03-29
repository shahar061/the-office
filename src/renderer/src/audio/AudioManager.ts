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
    try {
      this.musicEl = new Audio(musicUrl);
      this.musicEl.loop = true;
      this.musicEl.muted = this.musicMuted;
    } catch {
      // HTMLAudioElement not available (e.g., in test environments)
    }
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
