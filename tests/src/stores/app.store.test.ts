import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../../src/renderer/src/stores/app.store';
import { useOfficeStore } from '../../../src/renderer/src/stores/office.store';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';
import { useKanbanStore } from '../../../src/renderer/src/stores/kanban.store';

describe('AppStore', () => {
  beforeEach(() => {
    useAppStore.getState().navigateToLobby();
  });

  it('starts on lobby screen', () => {
    expect(useAppStore.getState().screen).toBe('lobby');
    expect(useAppStore.getState().selectedSessionId).toBeNull();
  });

  it('navigates to office with session info', () => {
    useAppStore.getState().navigateToOffice('ses_123', 'Test session');
    const state = useAppStore.getState();
    expect(state.screen).toBe('office');
    expect(state.selectedSessionId).toBe('ses_123');
    expect(state.selectedSessionTitle).toBe('Test session');
  });

  it('navigates back to lobby and clears selection', () => {
    useAppStore.getState().navigateToOffice('ses_123', 'Test');
    useAppStore.getState().navigateToLobby();
    const state = useAppStore.getState();
    expect(state.screen).toBe('lobby');
    expect(state.selectedSessionId).toBeNull();
    expect(state.selectedSessionTitle).toBeNull();
  });

  it('resets office and chat stores when navigating to office', () => {
    const officeReset = vi.spyOn(useOfficeStore.getState(), 'reset');
    const chatReset = vi.spyOn(useChatStore.getState(), 'reset');
    useAppStore.getState().navigateToOffice('ses_123', 'Test');
    expect(officeReset).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
  });

  it('resets all stores when navigating to lobby', () => {
    const officeReset = vi.spyOn(useOfficeStore.getState(), 'reset');
    const chatReset = vi.spyOn(useChatStore.getState(), 'reset');
    const kanbanReset = vi.spyOn(useKanbanStore.getState(), 'reset');
    useAppStore.getState().navigateToOffice('ses_123', 'Test');
    useAppStore.getState().navigateToLobby();
    expect(officeReset).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
    expect(kanbanReset).toHaveBeenCalled();
  });
});
