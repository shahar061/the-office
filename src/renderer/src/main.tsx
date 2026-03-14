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

    // Auto-navigate to lobby if selected session disappears
    const selectedId = useAppStore.getState().selectedSessionId;
    if (selectedId && !sessions.some(s => s.sessionId === selectedId)) {
      useAppStore.getState().navigateToLobby();
    }
  });

  window.office.onKanbanUpdate((state) => {
    useKanbanStore.getState().handleKanbanUpdate(state);
  });

  window.office.getKanbanState().then((state) => {
    if (state) useKanbanStore.getState().handleKanbanUpdate(state);
  });
}

initStoreSubscriptions();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
