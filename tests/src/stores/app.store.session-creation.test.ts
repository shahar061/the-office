import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../../src/renderer/src/stores/app.store';
import { useOfficeStore } from '../../../src/renderer/src/stores/office.store';
import { useChatStore } from '../../../src/renderer/src/stores/chat.store';
import { useKanbanStore } from '../../../src/renderer/src/stores/kanban.store';

describe('AppStore session creation', () => {
  beforeEach(() => {
    useAppStore.getState().navigateToLobby();
  });

  it('starts with no pending session and dispatchInFlight false', () => {
    const state = useAppStore.getState();
    expect(state.pendingSession).toBeNull();
    expect(state.dispatchInFlight).toBe(false);
  });

  it('createSession sets pending and navigates to office', () => {
    useAppStore.getState().createSession('opencode', '/tmp/myproject');
    const state = useAppStore.getState();
    expect(state.screen).toBe('office');
    expect(state.selectedSessionId).toBeNull();
    expect(state.pendingSession).toEqual({
      tool: 'opencode',
      directory: '/tmp/myproject',
      createdAt: expect.any(Number),
    });
  });

  it('createSession resets office, chat, and kanban stores', () => {
    const officeReset = vi.spyOn(useOfficeStore.getState(), 'reset');
    const chatReset = vi.spyOn(useChatStore.getState(), 'reset');
    const kanbanReset = vi.spyOn(useKanbanStore.getState(), 'reset');
    useAppStore.getState().createSession('opencode', '/tmp/proj');
    expect(officeReset).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
    expect(kanbanReset).toHaveBeenCalled();
  });

  it('linkSession clears pending and sets selected session', () => {
    useAppStore.getState().createSession('opencode', '/tmp/proj');
    useAppStore.getState().setDispatchInFlight(true);
    useAppStore.getState().linkSession('ses_abc', 'My Session');
    const state = useAppStore.getState();
    expect(state.pendingSession).toBeNull();
    expect(state.dispatchInFlight).toBe(false);
    expect(state.selectedSessionId).toBe('ses_abc');
    expect(state.selectedSessionTitle).toBe('My Session');
  });

  it('setDispatchInFlight toggles the flag', () => {
    useAppStore.getState().setDispatchInFlight(true);
    expect(useAppStore.getState().dispatchInFlight).toBe(true);
    useAppStore.getState().setDispatchInFlight(false);
    expect(useAppStore.getState().dispatchInFlight).toBe(false);
  });

  it('clearDispatchInFlight sets flag to false', () => {
    useAppStore.getState().setDispatchInFlight(true);
    useAppStore.getState().clearDispatchInFlight();
    expect(useAppStore.getState().dispatchInFlight).toBe(false);
  });

  it('navigateToLobby clears pending session and dispatchInFlight', () => {
    useAppStore.getState().createSession('opencode', '/tmp/proj');
    useAppStore.getState().setDispatchInFlight(true);
    useAppStore.getState().navigateToLobby();
    const state = useAppStore.getState();
    expect(state.pendingSession).toBeNull();
    expect(state.dispatchInFlight).toBe(false);
    expect(state.screen).toBe('lobby');
  });
});
