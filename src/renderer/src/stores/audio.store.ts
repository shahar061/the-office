import { create } from 'zustand';
import { audioManager } from '../audio/AudioManager';

interface AudioStore {
  musicMuted: boolean;
  sfxMuted: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggleMusic: () => Promise<void>;
  toggleSfx: () => Promise<void>;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  musicMuted: false,
  sfxMuted: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const settings = await window.office.getSettings();
      const audio = settings.audio ?? { musicMuted: false, sfxMuted: false };
      audioManager.setMusicMuted(audio.musicMuted);
      audioManager.setSfxMuted(audio.sfxMuted);
      set({ musicMuted: audio.musicMuted, sfxMuted: audio.sfxMuted, hydrated: true });
    } catch (err) {
      console.warn('[audio store] hydrate failed, using defaults', err);
      set({ hydrated: true });
    }
  },

  toggleMusic: async () => {
    const next = !get().musicMuted;
    set({ musicMuted: next });
    audioManager.setMusicMuted(next);
    if (next) {
      audioManager.stopMusic();
    } else {
      audioManager.playMusic();
    }
    try {
      await window.office.saveSettings({ audio: { musicMuted: next, sfxMuted: get().sfxMuted } });
    } catch (err) {
      console.warn('[audio store] save failed', err);
    }
  },

  toggleSfx: async () => {
    const next = !get().sfxMuted;
    set({ sfxMuted: next });
    audioManager.setSfxMuted(next);
    try {
      await window.office.saveSettings({ audio: { musicMuted: get().musicMuted, sfxMuted: next } });
    } catch (err) {
      console.warn('[audio store] save failed', err);
    }
  },
}));
