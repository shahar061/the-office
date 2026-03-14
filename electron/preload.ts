import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type { AgentEvent, ConnectionStatus, KanbanState, AgentRole, SessionInfo, SessionListItem } from '../shared/types';

contextBridge.exposeInMainWorld('office', {
  onAgentEvent(callback: (event: AgentEvent) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, event: AgentEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler);
  },

  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, status: ConnectionStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONNECTION_STATUS, handler);
  },

  onKanbanUpdate(callback: (state: KanbanState) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, state: KanbanState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.KANBAN_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.KANBAN_UPDATE, handler);
  },

  onSessionListUpdate(callback: (sessions: SessionListItem[]) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, sessions: SessionListItem[]) => callback(sessions);
    ipcRenderer.on(IPC_CHANNELS.SESSION_LIST_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_LIST_UPDATE, handler);
  },

  dispatch(prompt: string, agentRole?: AgentRole): Promise<{ sessionId: string }> {
    return ipcRenderer.invoke(IPC_CHANNELS.DISPATCH, prompt, agentRole);
  },

  getActiveSessions(): Promise<SessionInfo[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS);
  },

  approvePermission(agentId: string, toolId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.APPROVE_PERMISSION, agentId, toolId);
  },

  denyPermission(agentId: string, toolId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.DENY_PERMISSION, agentId, toolId);
  },

  getKanbanState(): Promise<KanbanState> {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_KANBAN);
  },
});