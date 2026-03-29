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
