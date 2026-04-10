// shared/types.ts — SDK-driven architecture types

// ── Agent System ──

export const AGENT_ROLES = [
  'ceo', 'product-manager', 'market-researcher', 'chief-architect',
  'agent-organizer', 'project-manager', 'team-lead',
  'backend-engineer', 'frontend-engineer', 'mobile-developer',
  'ui-ux-expert', 'data-engineer', 'devops', 'automation-developer',
  'freelancer',
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_GROUPS = {
  leadership: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
  coordination: ['agent-organizer', 'project-manager', 'team-lead'],
  engineering: ['backend-engineer', 'frontend-engineer', 'mobile-developer', 'ui-ux-expert', 'data-engineer', 'devops', 'automation-developer'],
} as const;

export const AGENT_COLORS: Record<AgentRole, string> = {
  'ceo': '#3b82f6',
  'product-manager': '#14b8a6',
  'market-researcher': '#22c55e',
  'chief-architect': '#f97316',
  'agent-organizer': '#a855f7',
  'project-manager': '#0ea5e9',
  'team-lead': '#f59e0b',
  'backend-engineer': '#10b981',
  'frontend-engineer': '#6366f1',
  'mobile-developer': '#8b5cf6',
  'ui-ux-expert': '#f43f5e',
  'data-engineer': '#06b6d4',
  'devops': '#ef4444',
  'automation-developer': '#ec4899',
  'freelancer': '#9ca3af',
};

// ── Events ──

export type AgentEventType =
  | 'agent:created'
  | 'agent:tool:start'
  | 'agent:tool:done'
  | 'agent:tool:clear'
  | 'agent:waiting'
  | 'agent:permission'
  | 'agent:message'
  | 'agent:message:delta'
  | 'agent:closed'
  | 'session:cost:update';

export interface AgentEvent {
  agentId: string;
  agentRole: AgentRole;
  agentLabel?: string;  // Display override, e.g. "Team Lead #2"
  source: 'sdk';
  type: AgentEventType;
  isTopLevel?: boolean;  // true for init events, false for sub-task events
  toolName?: string;
  toolId?: string;
  message?: string;
  cost?: number;
  tokens?: number;
  timestamp: number;
}

// ── Auth ──

export interface AuthStatus {
  connected: boolean;
  account?: string;
  method?: 'api-key' | 'cli-auth';
}

// ── Projects ──

export type Phase = 'idle' | 'imagine' | 'warroom' | 'build' | 'complete';

export interface ProjectInfo {
  name: string;
  path: string;
  lastPhase: Phase | null;
  lastOpened: number;
}

export interface ProjectState {
  name: string;
  path: string;
  currentPhase: Phase;
  completedPhases: Phase[];
  interrupted: boolean;
  introSeen: boolean;
  buildIntroSeen: boolean;
  mode?: 'greenfield' | 'workshop';
  scanStatus?: 'pending' | 'in_progress' | 'done' | 'skipped';
}

export interface PhaseInfo {
  phase: Phase;
  status: 'starting' | 'active' | 'completing' | 'completed' | 'failed' | 'interrupted';
}

export interface RestartPhasePayload {
  targetPhase: Phase;
  userIdea?: string;  // only for imagine
}

// ── Chat ──

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentRole?: AgentRole;
  agentLabel?: string;
  text: string;
  timestamp: number;
}

// ── Chat History ──

export interface ChatRun {
  runNumber: number;
  messages: ChatMessage[];
}

export interface PhaseHistory {
  agentRole: AgentRole;
  runs: ChatRun[];  // sorted by runNumber ascending
}

// ── Permissions ──

export interface PermissionRequest {
  requestId: string;
  agentRole: AgentRole;
  toolName: string;
  input: Record<string, unknown>;
}

// ── Agent Interaction ──

export interface AskQuestion {
  question: string;
  header: string;
  options: { label: string; description: string; tradeoffs?: string }[];
  multiSelect: boolean;
  recommendation?: string;
}

export interface AgentWaitingPayload {
  sessionId: string;
  agentRole: AgentRole;
  questions: AskQuestion[];
}

export interface ArtifactAvailablePayload {
  key: string;
  filename: string;
  agentRole: AgentRole;
}

export interface AgentDefinitionPayload {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
}

// ── War Table ──

export type WarTableVisualState = 'empty' | 'growing' | 'review' | 'expanding' | 'complete' | 'persisted';

export interface WarTableCard {
  id: string;
  type: 'milestone' | 'task';
  title: string;
  parentId?: string;  // task cards reference their milestone
}

export interface WarTableReviewPayload {
  content: string;  // rendered plan.md content
  artifact: 'plan' | 'tasks';
}

export interface WarTableReviewResponse {
  approved: boolean;
  feedback?: string;
}

export interface UIDesignMockup {
  filename: string;    // e.g., "01-landing.html"
  caption: string;     // e.g., "Landing Page"
  explanation: string; // the paragraph explaining design choices
}

export interface UIDesignReviewPayload {
  designDirection: string;       // the "Design Direction" paragraph from index.md
  mockups: UIDesignMockup[];
}

export interface UIDesignReviewResponse {
  approved: boolean;
  feedback?: string;
}

export interface WarTableChoreographyPayload {
  step: 'intro-walk' | 'pm-reading' | 'pm-writing' | 'pm-done'
      | 'tl-reading' | 'tl-writing' | 'tl-coordinator-done'
      | 'tl-clone-spawned' | 'tl-clone-writing' | 'tl-clone-done'
      | 'tl-done';
  cloneId?: string;
  phaseId?: string;
  phaseName?: string;
  totalClones?: number;
}

// ── Build ──

export interface BuildConfig {
  modelPreset: 'default' | 'fast' | 'quality';
  retryLimit: number;
  permissionMode: 'ask' | 'auto-safe' | 'auto-all';
}

export interface PhaseConfig {
  projectDir: string;
  agentsDir: string;
  env: Record<string, string>;
  onEvent: (event: AgentEvent) => void;
  onWaiting: (agentRole: AgentRole, questions: AskQuestion[]) => Promise<Record<string, string>>;
  onActStart?: (actName: string) => void;
  onActComplete?: (actName: string) => void;
}

// ── Kanban ──

export interface KanbanTask {
  id: string;
  description: string;
  status: 'queued' | 'active' | 'review' | 'done' | 'failed';
  assignedAgent: AgentRole;
  phaseId: string;
  dependsOn: string[];
  error?: string;
}

export interface KanbanState {
  projectName: string;
  currentPhase: string;
  completionPercent: number;
  tasks: KanbanTask[];
  failed?: boolean;
  failedTaskId?: string;
}

// ── Workshop Requests ──

export interface Request {
  id: string;
  title: string;
  description: string;
  status: 'queued' | 'in_progress' | 'done' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  assignedAgent: AgentRole | null;
  result: string | null;
  error: string | null;
}

// ── Stats ──

export interface SessionStats {
  totalCost: number;
  totalTokens: number;
  sessionTime: number;
  activeAgents: number;
}

// ── Stats Panel ──

export interface RateLimitState {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  utilization: number;
  rateLimitType: string;
  resetsAt: number | null;
  isUsingOverage: boolean;
  overageStatus: string | null;
}

export interface ActStats {
  name: string;
  startedAt: number;
  completedAt: number | null;
  cost: number;
  tokens: number;
}

export interface PhaseStats {
  startedAt: number;
  completedAt: number | null;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  acts: ActStats[];
}

export interface AgentStats {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  timeActiveMs: number;
  tasksCompleted: number;
  phases: string[];
}

export interface StatsState {
  rateLimit: RateLimitState | null;
  session: {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    startedAt: number;
  };
  phases: Record<string, PhaseStats>;
  agents: Record<string, AgentStats>;
}

// ── Settings ──

export interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
  maxParallelTLs: number;
  windowBounds?: { x: number; y: number; width: number; height: number };
}

// ── IPC Channels ──

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
  // Workshop onboarding (sub-project 2)
  CHECK_PROJECT_EXISTS: 'office:check-project-exists',
  OPEN_DIRECTORY_AS_WORKSHOP: 'office:open-directory-as-workshop',
  RUN_ONBOARDING_SCAN: 'office:run-onboarding-scan',
  SKIP_ONBOARDING_SCAN: 'office:skip-onboarding-scan',
  PROJECT_STATE_CHANGED: 'office:project-state-changed',
} as const;

// ── OfficeAPI (exposed via preload) ──

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

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
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

  checkProjectExists(projectPath: string): Promise<{ exists: boolean; fileCount: number }>;
  openDirectoryAsWorkshop(projectPath: string): Promise<{ success: boolean; error?: string }>;
  runOnboardingScan(): Promise<{ success: boolean; error?: string }>;
  skipOnboardingScan(): Promise<void>;
  onProjectStateChanged(callback: (state: ProjectState) => void): () => void;
}

declare global {
  interface Window {
    office: OfficeAPI;
  }
}
