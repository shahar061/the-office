import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useOfficeStore } from './stores/office.store';
import { useChatStore } from './stores/chat.store';
import { useKanbanStore } from './stores/kanban.store';
import { useSessionStore } from './stores/session.store';
import { useAppStore } from './stores/app.store';

function initStoreSubscriptions() {
  if (!window.office) {
    console.log('[Renderer] No office API available');
    return;
  }

  console.log('[Renderer] Subscribing to IPC events');

  window.office.onAgentEvent((event) => {
    const selectedId = useAppStore.getState().selectedSessionId;
    if (!selectedId || event.agentId !== selectedId) return;
    useOfficeStore.getState().handleAgentEvent(event);
    useChatStore.getState().handleAgentEvent(event);
  });

  window.office.onSessionListUpdate((sessions) => {
    useSessionStore.getState().handleSessionListUpdate(sessions);

    // Auto-navigate to lobby if selected session disappears from adapter list.
    // Only for adapter-managed sessions (OpenCode). Claude Code sessions are
    // managed by ClaudeCodeProcess and don't appear in adapter session lists.
    const { selectedSessionId, selectedSessionTool } = useAppStore.getState();
    if (selectedSessionId && selectedSessionTool !== 'claude-code' && !sessions.some(s => s.sessionId === selectedSessionId)) {
      useAppStore.getState().navigateToLobby();
    }
  });

  window.office.onKanbanUpdate((state) => {
    useKanbanStore.getState().handleKanbanUpdate(state);
  });

  if (window.office.onSessionLinked) {
    window.office.onSessionLinked(({ sessionId, title }) => {
      useAppStore.getState().linkSession(sessionId, title);
    });
  }

  if (window.office.onSessionLinkFailed) {
    window.office.onSessionLinkFailed(({ error }) => {
      useChatStore.getState().addSystemMessage(`Failed to start session: ${error}`);
      useAppStore.getState().clearDispatchInFlight();
    });
  }

  if (window.office.onDispatchError) {
    window.office.onDispatchError(({ error }) => {
      useChatStore.getState().addSystemMessage(`Error: ${error}`);
      useAppStore.getState().clearDispatchInFlight();
    });
  }

  window.office.getKanbanState().then((state) => {
    if (state) useKanbanStore.getState().handleKanbanUpdate(state);
  });
}

initStoreSubscriptions();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
