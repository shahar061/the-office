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
}

export interface PhaseInfo {
  phase: Phase;
  status: 'starting' | 'active' | 'completing' | 'completed' | 'failed' | 'interrupted';
}

// ── Chat ──

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentRole?: AgentRole;
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
  options: { label: string; description: string }[];
  multiSelect: boolean;
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
}

// ── Kanban ──

export interface KanbanTask {
  id: string;
  description: string;
  status: 'queued' | 'active' | 'review' | 'done' | 'failed';
  assignedAgent: AgentRole;
  phaseId: string;
}

export interface KanbanState {
  projectName: string;
  currentPhase: string;
  completionPercent: number;
  tasks: KanbanTask[];
}

// ── Stats ──

export interface SessionStats {
  totalCost: number;
  totalTokens: number;
  sessionTime: number;
  activeAgents: number;
}

// ── Settings ──

export interface AppSettings {
  defaultModelPreset: BuildConfig['modelPreset'];
  defaultPermissionMode: BuildConfig['permissionMode'];
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
  // Utilities
  OPEN_EXTERNAL: 'office:open-external',
  // Artifacts
  ARTIFACT_AVAILABLE: 'office:artifact-available',
  READ_ARTIFACT: 'office:read-artifact',
  GET_ARTIFACT_STATUS: 'office:get-artifact-status',
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
  openExternal(url: string): Promise<void>;
  onArtifactAvailable(callback: (payload: ArtifactAvailablePayload) => void): () => void;
  readArtifact(filename: string): Promise<{ content: string } | { error: string }>;
  getArtifactStatus(): Promise<Record<string, boolean>>;
}

declare global {
  interface Window {
    office: OfficeAPI;
  }
}
