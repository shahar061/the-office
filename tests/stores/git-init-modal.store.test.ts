import { describe, it, expect, beforeEach } from 'vitest';
import { useGitInitModalStore } from '../../src/renderer/src/stores/git-init-modal.store';

describe('useGitInitModalStore', () => {
  beforeEach(() => {
    useGitInitModalStore.getState().close();
  });

  it('starts closed', () => {
    const state = useGitInitModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.projectPath).toBe('');
  });

  it('openPrompt sets isOpen and path', () => {
    useGitInitModalStore.getState().openPrompt('/tmp/foo');
    const state = useGitInitModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.projectPath).toBe('/tmp/foo');
  });

  it('close resets state', () => {
    useGitInitModalStore.getState().openPrompt('/tmp/foo');
    useGitInitModalStore.getState().close();
    const state = useGitInitModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.projectPath).toBe('');
  });
});
