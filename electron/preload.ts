import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type {
  AuthStatus, ProjectInfo, ProjectState, PhaseInfo,
  ChatMessage, AgentEvent, AgentWaitingPayload, PermissionRequest, KanbanState,
  SessionStats, BuildConfig, AppSettings, Phase, PhaseHistory, AgentDefinitionPayload,
  WarTableCard, WarTableVisualState, WarTableReviewPayload, WarTableReviewResponse,
  WarTableChoreographyPayload, RestartPhasePayload,
} from '../shared/types';

function onEvent<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_: Electron.IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('office', {
  // Auth
  getAuthStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AUTH_STATUS),
  connectApiKey: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECT_API_KEY, key),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.DISCONNECT),
  onAuthStatusChange: (cb: (s: AuthStatus) => void) => onEvent(IPC_CHANNELS.AUTH_STATUS_CHANGE, cb),

  // Projects
  getRecentProjects: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_PROJECTS),
  openProject: (p: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_PROJECT, p),
  createProject: (name: string, p: string) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PROJECT, name, p),
  pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.PICK_DIRECTORY),
  getProjectState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PROJECT_STATE),
  markIntroSeen: () => ipcRenderer.invoke(IPC_CHANNELS.MARK_INTRO_SEEN),

  // Phase Control
  startImagine: (idea: string) => ipcRenderer.invoke(IPC_CHANNELS.START_IMAGINE, idea),
  startWarroom: () => ipcRenderer.invoke(IPC_CHANNELS.START_WARROOM),
  startBuild: (config: BuildConfig) => ipcRenderer.invoke(IPC_CHANNELS.START_BUILD, config),
  onPhaseChange: (cb: (p: PhaseInfo) => void) => onEvent(IPC_CHANNELS.PHASE_CHANGE, cb),
  restartPhase: (payload: RestartPhasePayload) => ipcRenderer.invoke(IPC_CHANNELS.RESTART_PHASE, payload),
  onPhaseRestart: (cb: (targetPhase: Phase) => void) => onEvent(IPC_CHANNELS.PHASE_RESTART, cb),

  // Chat
  sendMessage: (msg: string) => ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, msg),
  onChatMessage: (cb: (m: ChatMessage) => void) => onEvent(IPC_CHANNELS.CHAT_MESSAGE, cb),
  getChatHistory: (phase: Phase) => ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_HISTORY, phase),

  // Agent Events
  onAgentEvent: (cb: (e: AgentEvent) => void) => onEvent(IPC_CHANNELS.AGENT_EVENT, cb),

  // Permissions
  onPermissionRequest: (cb: (r: PermissionRequest) => void) => onEvent(IPC_CHANNELS.PERMISSION_REQUEST, cb),
  respondPermission: (id: string, approved: boolean) => ipcRenderer.invoke(IPC_CHANNELS.RESPOND_PERMISSION, id, approved),

  // Agent Interaction
  respondToAgent: (sessionId: string, answers: Record<string, string>) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_RESPONSE, sessionId, answers),
  onAgentWaiting: (cb: (payload: AgentWaitingPayload) => void) =>
    onEvent(IPC_CHANNELS.AGENT_WAITING, cb),

  // Kanban
  onKanbanUpdate: (cb: (s: KanbanState) => void) => onEvent(IPC_CHANNELS.KANBAN_UPDATE, cb),

  // Stats
  onStatsUpdate: (cb: (s: SessionStats) => void) => onEvent(IPC_CHANNELS.STATS_UPDATE, cb),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  saveSettings: (s: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, s),

  // Utilities
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),

  // Artifacts
  onArtifactAvailable: (cb: (payload: any) => void) => onEvent(IPC_CHANNELS.ARTIFACT_AVAILABLE, cb),
  readArtifact: (filename: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_ARTIFACT, filename),
  getArtifactStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ARTIFACT_STATUS),

  // Agents
  getAgentDefinitions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AGENT_DEFINITIONS),

  // War Table
  onWarTableState: (cb: (s: WarTableVisualState) => void) => onEvent(IPC_CHANNELS.WAR_TABLE_STATE, cb),
  onWarTableCardAdded: (cb: (card: WarTableCard) => void) => onEvent(IPC_CHANNELS.WAR_TABLE_CARD_ADDED, cb),
  onWarTableReviewReady: (cb: (payload: WarTableReviewPayload) => void) => onEvent(IPC_CHANNELS.WAR_TABLE_REVIEW_READY, cb),
  respondWarTableReview: (response: WarTableReviewResponse) => ipcRenderer.invoke(IPC_CHANNELS.WAR_TABLE_REVIEW_RESPONSE, response),
  onWarTableChoreography: (cb: (payload: WarTableChoreographyPayload) => void) => onEvent(IPC_CHANNELS.WAR_TABLE_CHOREOGRAPHY, cb),
});
