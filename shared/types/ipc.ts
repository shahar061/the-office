// shared/types/ipc.ts — IPC channel constants and OfficeAPI facade

import type { AgentEvent } from './agent';
import type {
  Phase,
  ChatMessage,
  PhaseHistory,
  PermissionRequest,
  AgentWaitingPayload,
  ArtifactAvailablePayload,
  AgentDefinitionPayload,
  SessionStats,
} from './session';
import type {
  ProjectInfo,
  ProjectState,
  PhaseInfo,
  BuildConfig,
  KanbanState,
  Request,
  RequestPlanReadyPayload,
  RequestPlanResponse,
  GitInitPromptPayload,
  GitRecoveryNote,
  RestartPhasePayload,
  WarTableCard,
  WarTableVisualState,
  WarTableReviewPayload,
  WarTableReviewResponse,
  WarTableChoreographyPayload,
  UIDesignReviewPayload,
  UIDesignReviewResponse,
  DiffResult,
} from './project';
import type { PairedDevice } from './mobile';
import type { AuthStatus, AppSettings, GitIdentity, StatsState } from './settings';

export const IPC_CHANNELS = {
  // Auth
  GET_AUTH_STATUS: 'office:get-auth-status',
  CONNECT_API_KEY: 'office:connect-api-key',
  DISCONNECT: 'office:disconnect',
  AUTH_STATUS_CHANGE: 'office:auth-status-change',
  // Projects
  GET_RECENT_PROJECTS: 'office:get-recent-projects',
  OPEN_PROJECT: 'office:open-project',
  CREATE_PROJECT: 'office:create-project',
  PICK_DIRECTORY: 'office:pick-directory',
  GET_PROJECT_STATE: 'office:get-project-state',
  MARK_INTRO_SEEN: 'office:mark-intro-seen',
  // Phase
  START_IMAGINE: 'office:start-imagine',
  START_WARROOM: 'office:start-warroom',
  START_BUILD: 'office:start-build',
  PHASE_CHANGE: 'office:phase-change',
  RESTART_PHASE: 'office:restart-phase',
  RESUME_PHASE: 'office:resume-phase',
  PHASE_RESTART: 'office:phase-restart',
  // Chat
  SEND_MESSAGE: 'office:send-message',
  CHAT_MESSAGE: 'office:chat-message',
  GET_CHAT_HISTORY: 'office:get-chat-history',
  // Agent Events
  AGENT_EVENT: 'office:agent-event',
  // Canvas State Parity
  OFFICE_CHAR_STATES: 'office:char-states',
  // Permissions
  PERMISSION_REQUEST: 'office:permission-request',
  RESPOND_PERMISSION: 'office:respond-permission',
  // Kanban
  KANBAN_UPDATE: 'office:kanban-update',
  // Stats
  STATS_UPDATE: 'office:stats-update',
  // Agent Interaction
  AGENT_WAITING: 'office:agent-waiting',
  USER_RESPONSE: 'office:user-response',
  // Settings
  GET_SETTINGS: 'office:get-settings',
  SAVE_SETTINGS: 'office:save-settings',
  SETTINGS_UPDATED: 'office:settings-updated',
  OPEN_SETTINGS: 'office:open-settings',
  // Git identity
  ADD_GIT_IDENTITY: 'office:add-git-identity',
  UPDATE_GIT_IDENTITY: 'office:update-git-identity',
  DELETE_GIT_IDENTITY: 'office:delete-git-identity',
  SET_DEFAULT_GIT_IDENTITY: 'office:set-default-git-identity',
  SET_PROJECT_GIT_IDENTITY: 'office:set-project-git-identity',
  IMPORT_GITCONFIG_IDENTITY: 'office:import-gitconfig-identity',
  // Mobile Bridge
  MOBILE_GET_PAIRING_QR: 'office:mobile-get-pairing-qr',
  MOBILE_LIST_DEVICES: 'office:mobile-list-devices',
  MOBILE_REVOKE_DEVICE: 'office:mobile-revoke-device',
  MOBILE_GET_STATUS: 'office:mobile-get-status',
  MOBILE_STATUS_CHANGE: 'office:mobile-status-change',
  MOBILE_PAUSE_RELAY: 'office:mobile-pause-relay',
  MOBILE_SET_REMOTE_ACCESS: 'office:mobile-set-remote-access',
  MOBILE_RENAME_DEVICE: 'office:mobile-rename-device',
  MOBILE_SET_LAN_HOST: 'office:mobile-set-lan-host',
  // Layouts
  GET_LAYOUTS: 'office:get-layouts',
  SAVE_LAYOUTS: 'office:save-layouts',
  // Utilities
  OPEN_EXTERNAL: 'office:open-external',
  // Artifacts
  ARTIFACT_AVAILABLE: 'office:artifact-available',
  READ_ARTIFACT: 'office:read-artifact',
  GET_ARTIFACT_STATUS: 'office:get-artifact-status',
  // Agents
  GET_AGENT_DEFINITIONS: 'office:get-agent-definitions',
  // War Table
  WAR_TABLE_STATE: 'office:war-table-state',
  WAR_TABLE_CARD_ADDED: 'office:war-table-card-added',
  WAR_TABLE_REVIEW_READY: 'office:war-table-review-ready',
  WAR_TABLE_REVIEW_RESPONSE: 'office:war-table-review-response',
  WAR_TABLE_CHOREOGRAPHY: 'office:war-table-choreography',
  WARROOM_INTRO_DONE: 'office:warroom-intro-done',
  // Logs
  FLUSH_LOGS: 'office:flush-logs',
  // Build
  BUILD_INTRO_DONE: 'office:build-intro-done',
  BUILD_RESUME: 'office:build-resume',
  BUILD_RESTART: 'office:build-restart',
  // Stats
  STATS_STATE: 'office:stats-state',
  GET_STATS_STATE: 'office:get-stats-state',
  // UI Design Review
  UI_DESIGN_REVIEW_READY: 'office:ui-design-review-ready',
  UI_DESIGN_REVIEW_RESPONSE: 'office:ui-design-review-response',
  // File Open
  OPEN_FILE_IN_BROWSER: 'office:open-file-in-browser',
  // Completion phase
  READ_RUN_MD: 'office:read-run-md',
  GET_PROJECT_FILE_COUNT: 'office:get-project-file-count',
  OPEN_PROJECT_FOLDER: 'office:open-project-folder',
  COPY_TO_CLIPBOARD: 'office:copy-to-clipboard',
  // Workshop mode
  LIST_REQUESTS: 'office:list-requests',
  CREATE_REQUEST: 'office:create-request',
  REQUEST_UPDATED: 'office:request-updated',
  // Workshop mini-plan review (sub-project 3)
  REQUEST_PLAN_READY: 'office:request-plan-ready',
  REQUEST_PLAN_RESPONSE: 'office:request-plan-response',
  // Workshop git integration (sub-project 4)
  GIT_INIT_PROMPT: 'office:git-init-prompt',
  GIT_INIT_RESPONSE: 'office:git-init-response',
  GIT_RECOVERY_NOTE: 'office:git-recovery-note',
  // Greenfield git
  GREENFIELD_GIT_NOTE: 'office:greenfield-git-note',
  // Workshop diff review (sub-project 5)
  GET_REQUEST_DIFF: 'office:get-request-diff',
  ACCEPT_REQUEST: 'office:accept-request',
  REJECT_REQUEST: 'office:reject-request',
  // Workshop onboarding (sub-project 2)
  CHECK_PROJECT_EXISTS: 'office:check-project-exists',
  OPEN_DIRECTORY_AS_WORKSHOP: 'office:open-directory-as-workshop',
  RUN_ONBOARDING_SCAN: 'office:run-onboarding-scan',
  SKIP_ONBOARDING_SCAN: 'office:skip-onboarding-scan',
  PROJECT_STATE_CHANGED: 'office:project-state-changed',
} as const;

export interface OfficeAPI {
  getAuthStatus(): Promise<AuthStatus>;
  connectApiKey(key: string): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  onAuthStatusChange(callback: (status: AuthStatus) => void): () => void;

  getRecentProjects(): Promise<ProjectInfo[]>;
  openProject(path: string): Promise<{ success: boolean; error?: string }>;
  createProject(name: string, path: string): Promise<{ success: boolean; error?: string }>;
  pickDirectory(): Promise<string | null>;
  getProjectState(): Promise<ProjectState>;
  markIntroSeen(): Promise<void>;

  startImagine(userIdea: string): Promise<void>;
  startWarroom(): Promise<void>;
  startBuild(config: BuildConfig): Promise<void>;
  onPhaseChange(callback: (phase: PhaseInfo) => void): () => void;
  restartPhase(payload: RestartPhasePayload): Promise<void>;
  resumePhase(): Promise<void>;
  onPhaseRestart(callback: (targetPhase: Phase) => void): () => void;

  sendMessage(message: string): Promise<void>;
  onChatMessage(callback: (msg: ChatMessage) => void): () => void;
  getChatHistory(phase: Phase): Promise<PhaseHistory[]>;

  onAgentEvent(callback: (event: AgentEvent) => void): () => void;

  onPermissionRequest(callback: (req: PermissionRequest) => void): () => void;
  respondPermission(requestId: string, approved: boolean): Promise<void>;
  respondToAgent(sessionId: string, answers: Record<string, string>): Promise<void>;
  onAgentWaiting(callback: (payload: AgentWaitingPayload) => void): () => void;

  onKanbanUpdate(callback: (state: KanbanState) => void): () => void;
  onStatsUpdate(callback: (stats: SessionStats) => void): () => void;

  // Settings
  getSettings(): Promise<AppSettings>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  onSettingsUpdated(callback: (settings: AppSettings) => void): () => void;
  onOpenSettings(callback: () => void): () => void;

  // Git identity
  addGitIdentity(identity: Omit<GitIdentity, 'id'>): Promise<GitIdentity>;
  updateGitIdentity(id: string, patch: Partial<Omit<GitIdentity, 'id'>>): Promise<GitIdentity | null>;
  deleteGitIdentity(id: string): Promise<{ ok: boolean; affectedProjects: number }>;
  setDefaultGitIdentity(id: string | null): Promise<void>;
  setProjectGitIdentity(projectPath: string, id: string | null): Promise<void>;
  importGitconfigIdentity(): Promise<{ name: string; email: string } | null>;

  getLayouts(): Promise<Record<string, unknown> | null>;
  saveLayouts(layouts: Record<string, unknown>): Promise<void>;
  openExternal(url: string): Promise<void>;
  openFileInBrowser(relativePath: string): Promise<{ success: boolean; error?: string }>;
  onArtifactAvailable(callback: (payload: ArtifactAvailablePayload) => void): () => void;
  readArtifact(filename: string): Promise<{ content: string } | { error: string }>;
  getArtifactStatus(): Promise<Record<string, boolean>>;
  getAgentDefinitions(): Promise<Record<string, AgentDefinitionPayload>>;

  // War Table
  onWarTableState(callback: (state: WarTableVisualState) => void): () => void;
  onWarTableCardAdded(callback: (card: WarTableCard) => void): () => void;
  onWarTableReviewReady(callback: (payload: WarTableReviewPayload) => void): () => void;
  respondWarTableReview(response: WarTableReviewResponse): Promise<void>;
  onUIDesignReviewReady(callback: (payload: UIDesignReviewPayload) => void): () => void;
  respondUIDesignReview(response: UIDesignReviewResponse): Promise<void>;
  onWarTableChoreography(callback: (payload: WarTableChoreographyPayload) => void): () => void;
  warRoomIntroDone(): Promise<void>;
  // Logs
  flushLogs(logText: string): Promise<void>;
  // Build
  buildIntroDone(): Promise<void>;
  resumeBuild(): Promise<void>;
  restartBuild(config: BuildConfig): Promise<void>;
  // Stats
  onStatsState(callback: (state: StatsState) => void): () => void;
  getStatsState(): Promise<StatsState>;

  readRunMd(): Promise<string | null>;
  getProjectFileCount(): Promise<number>;
  openProjectFolder(): Promise<{ success: boolean; error?: string }>;
  copyToClipboard(text: string): Promise<void>;

  // Workshop
  listRequests(): Promise<Request[]>;
  createRequest(description: string): Promise<{ success: boolean; request?: Request; error?: string }>;
  onRequestUpdated(callback: (request: Request) => void): () => void;
  onRequestPlanReady(callback: (payload: RequestPlanReadyPayload) => void): () => void;
  respondRequestPlan(response: RequestPlanResponse): Promise<void>;
  onGitInitPrompt(callback: (payload: GitInitPromptPayload) => void): () => void;
  respondGitInit(answer: 'yes' | 'no'): Promise<void>;
  onGitRecoveryNote(callback: (note: GitRecoveryNote) => void): () => void;
  onGreenfieldGitNote(
    callback: (note: { level: 'info' | 'warning'; message: string }) => void,
  ): () => void;
  getRequestDiff(requestId: string): Promise<
    | { ok: true; diff: DiffResult }
    | { ok: false; error: string }
  >;
  acceptRequest(requestId: string): Promise<
    | { ok: true; mergedAt: number }
    | { ok: false; error: string; conflict?: boolean }
  >;
  rejectRequest(requestId: string): Promise<
    | { ok: true }
    | { ok: false; error: string }
  >;

  checkProjectExists(projectPath: string): Promise<{ exists: boolean; fileCount: number }>;
  openDirectoryAsWorkshop(projectPath: string): Promise<{ success: boolean; error?: string }>;
  runOnboardingScan(): Promise<{ success: boolean; error?: string }>;
  skipOnboardingScan(): Promise<void>;
  onProjectStateChanged(callback: (state: ProjectState) => void): () => void;

  // Mobile Bridge
  mobile: {
    getPairingQR(): Promise<{ qrPayload: string; expiresAt: number }>;
    listDevices(): Promise<PairedDevice[]>;
    revokeDevice(deviceId: string): Promise<void>;
    renameDevice(deviceId: string, name: string): Promise<void>;
    setRemoteAccess(deviceId: string, enabled: boolean): Promise<void>;
    pauseRelay(until: number | null): Promise<void>;
    setLanHost: (host: string | null) => Promise<void>;
    getStatus(): Promise<{
      running: boolean;
      port: number | null;
      connectedDevices: number;
      pendingSas: string | null;
      v1DeviceCount: number;
      relay: 'ready' | 'unreachable' | 'disabled' | 'paused';
      relayPausedUntil: number | null;
      lanHost: string | null;
      devices: Array<{
        deviceId: string;
        deviceName: string;
        mode: 'lan' | 'relay' | 'offline';
        lastSeenAt: number;
        remoteAllowed: boolean;
      }>;
    }>;
    onStatusChange(callback: (status: {
      running: boolean;
      port: number | null;
      connectedDevices: number;
      pendingSas: string | null;
      v1DeviceCount: number;
      relay: 'ready' | 'unreachable' | 'disabled' | 'paused';
      relayPausedUntil: number | null;
      lanHost: string | null;
      devices: Array<{
        deviceId: string;
        deviceName: string;
        mode: 'lan' | 'relay' | 'offline';
        lastSeenAt: number;
        remoteAllowed: boolean;
      }>;
    }) => void): () => void;
  };
}

declare global {
  interface Window {
    office: OfficeAPI;
  }
}
