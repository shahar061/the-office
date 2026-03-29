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
