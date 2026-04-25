import { describe, it, expect, beforeEach } from 'vitest';
import { useApiKeyPanelStore } from '../../src/renderer/src/stores/api-key-panel.store';

describe('useApiKeyPanelStore', () => {
  beforeEach(() => {
    useApiKeyPanelStore.getState().close();
  });

  it('starts closed', () => {
    expect(useApiKeyPanelStore.getState().isOpen).toBe(false);
  });

  it('open() sets isOpen true', () => {
    useApiKeyPanelStore.getState().open();
    expect(useApiKeyPanelStore.getState().isOpen).toBe(true);
  });

  it('close() sets isOpen false', () => {
    useApiKeyPanelStore.getState().open();
    useApiKeyPanelStore.getState().close();
    expect(useApiKeyPanelStore.getState().isOpen).toBe(false);
  });
});
