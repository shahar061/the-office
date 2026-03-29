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
