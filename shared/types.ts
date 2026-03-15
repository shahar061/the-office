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

export type AgentEventType =
  | 'agent:created'
  | 'agent:tool:start'
  | 'agent:tool:done'
  | 'agent:tool:clear'
  | 'agent:waiting'
  | 'agent:permission'
  | 'agent:message'
  | 'agent:closed'
  | 'session:cost:update';

export interface AgentEvent {
  agentId: string;
  agentRole: AgentRole;
  source: 'sdk' | 'transcript' | 'opencode' | 'claude-process';
  type: AgentEventType;
  toolName?: string;
  toolId?: string;
  message?: string;
  cost?: number;
  tokens?: number;
  timestamp: number;
}

export interface ConnectionStatus {
  claudeCode: 'connected' | 'disconnected' | 'error';
  openCode: 'connected' | 'disconnected' | 'error';
}

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

export interface SessionInfo {
  sessionId: string;
  agentRole: AgentRole;
  source: 'sdk' | 'transcript' | 'opencode' | 'claude-process';
  startedAt: number;
}

export interface SessionListItem {
  sessionId: string;
  title: string;
  directory: string;
  projectName: string;
  status: 'busy' | 'waiting' | 'stale';
  lastUpdated: number;
  createdAt: number;
  source: 'opencode' | 'claude-code';
}

export interface TerminalConfig {
  id: string;
  name: string;
  path: string;
  isBuiltIn: boolean;
}

export interface AppSettings {
  terminals: TerminalConfig[];
  defaultTerminalId: string;
}

export const IPC_CHANNELS = {
  AGENT_EVENT: 'office:agent-event',
  CONNECTION_STATUS: 'office:connection-status',
  KANBAN_UPDATE: 'office:kanban-update',
  DISPATCH: 'office:dispatch',
  GET_SESSIONS: 'office:get-sessions',
  APPROVE_PERMISSION: 'office:approve-permission',
  DENY_PERMISSION: 'office:deny-permission',
  GET_KANBAN: 'office:get-kanban',
  SESSION_LIST_UPDATE: 'office:session-list-update',
  CREATE_SESSION: 'office:create-session',
  PICK_DIRECTORY: 'office:pick-directory',
  SESSION_LINKED: 'office:session-linked',
  SESSION_LINK_FAILED: 'office:session-link-failed',
  DISPATCH_ERROR: 'office:dispatch-error',
  CANCEL_SESSION: 'office:cancel-session',
  GET_SETTINGS: 'office:get-settings',
  SAVE_SETTINGS: 'office:save-settings',
  DETECT_TERMINALS: 'office:detect-terminals',
  BROWSE_TERMINAL_APP: 'office:browse-terminal-app',
} as const;

export interface OfficeAPI {
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onConnectionStatus(callback: (status: ConnectionStatus) => void): () => void;
  dispatch(prompt: string, agentRole?: AgentRole): Promise<{ sessionId: string }>;
  getActiveSessions(): Promise<SessionInfo[]>;
  approvePermission(agentId: string, toolId: string): Promise<void>;
  denyPermission(agentId: string, toolId: string): Promise<void>;
  getKanbanState(): Promise<KanbanState>;
  onKanbanUpdate(callback: (state: KanbanState) => void): () => void;
  onSessionListUpdate(callback: (sessions: SessionListItem[]) => void): () => void;
  createSession(tool: string, directory: string, terminalId?: string): Promise<{ ok: true }>;
  pickDirectory(): Promise<string | null>;
  onSessionLinked(callback: (data: { sessionId: string; title: string }) => void): () => void;
  onSessionLinkFailed(callback: (data: { error: string }) => void): () => void;
  onDispatchError(callback: (data: { error: string }) => void): () => void;
  cancelSession(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  detectTerminals(): Promise<TerminalConfig[]>;
  browseTerminalApp(): Promise<TerminalConfig | null>;
}

declare global {
  interface Window {
    office: OfficeAPI;
  }
}