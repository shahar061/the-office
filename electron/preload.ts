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

  onSessionLinked(callback: (data: { sessionId: string; title: string }) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, data: { sessionId: string; title: string }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SESSION_LINKED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_LINKED, handler);
  },

  onSessionLinkFailed(callback: (data: { error: string }) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SESSION_LINK_FAILED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_LINK_FAILED, handler);
  },

  onDispatchError(callback: (data: { error: string }) => void): () => void {
    const handler = (_: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.DISPATCH_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DISPATCH_ERROR, handler);
  },

  createSession(tool: string, directory: string): Promise<{ ok: true }> {
    return ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, tool, directory);
  },

  pickDirectory(): Promise<string | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.PICK_DIRECTORY);
  },

  cancelSession(): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.CANCEL_SESSION);
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