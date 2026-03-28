import path from 'path';
import { app, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/types';
import type {
  AgentEvent,
  AgentRole,
  AgentWaitingPayload,
  AskQuestion,
  ChatMessage,
  Phase,
  SessionStats,
} from '../../shared/types';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import { AuthManager } from '../auth/auth-manager';
import { ProjectManager } from '../project/project-manager';
import { PhaseMachine } from '../orchestrator/phase-machine';
import { PermissionHandler } from '../sdk/permission-handler';

// ── Constants ──

export const dataDir = path.join(app.getPath('userData'), 'the-office');
export const agentsDir = path.join(__dirname, '../../agents');

// ── Singleton instances ──

export const authManager = new AuthManager(dataDir);
export const projectManager = new ProjectManager(dataDir);

// ── Mutable state ──

export let mainWindow: BrowserWindow | null = null;
export let currentProjectDir: string | null = null;
export let artifactStore: ArtifactStore | null = null;
export let chatHistoryStore: ChatHistoryStore | null = null;
export let phaseMachine: PhaseMachine | null = null;
export let permissionHandler: PermissionHandler | null = null;
export let activeAbort: (() => void) | null = null;
export let currentChatPhase: Phase | null = null;
export let currentChatAgentRole: AgentRole | null = null;
export let currentChatRunNumber: number = 0;
export let nextSessionId = 0;

export const sessionStats: SessionStats = {
  totalCost: 0,
  totalTokens: 0,
  sessionTime: 0,
  activeAgents: 0,
};

// Pending AskUserQuestion promises, keyed by session ID
export interface PendingQuestion {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
}
export const pendingQuestions = new Map<string, PendingQuestion>();

// Pending War Table review promise, resolved when user responds
export interface PendingReview {
  resolve: (response: import('../../shared/types').WarTableReviewResponse) => void;
}
export let pendingReview: PendingReview | null = null;

export function setPendingReview(pr: PendingReview | null): void {
  pendingReview = pr;
}

// Pending warroom intro completion
export interface PendingIntro {
  resolve: () => void;
}
export let pendingIntro: PendingIntro | null = null;

export function setPendingIntro(pi: PendingIntro | null): void {
  pendingIntro = pi;
}

// ── Setter functions ──
// ESM modules can't reassign imported `let` bindings, so we expose setters.

export function setMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

export function setCurrentProjectDir(dir: string | null): void {
  currentProjectDir = dir;
}

export function setArtifactStore(store: ArtifactStore | null): void {
  artifactStore = store;
}

export function setChatHistoryStore(store: ChatHistoryStore | null): void {
  chatHistoryStore = store;
}

export function setPhaseMachine(pm: PhaseMachine | null): void {
  phaseMachine = pm;
}

export function setPermissionHandler(ph: PermissionHandler | null): void {
  permissionHandler = ph;
}

export function setActiveAbort(fn: (() => void) | null): void {
  activeAbort = fn;
}

export function setCurrentChatPhase(phase: Phase | null): void {
  currentChatPhase = phase;
}

export function setCurrentChatAgentRole(role: AgentRole | null): void {
  currentChatAgentRole = role;
}

export function setCurrentChatRunNumber(n: number): void {
  currentChatRunNumber = n;
}

export function incrementSessionId(): number {
  return ++nextSessionId;
}

// ── Helper functions ──

export function send(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

export function sendChat(msg: Omit<ChatMessage, 'id' | 'timestamp'>, persist: boolean = true): void {
  const chatMsg: ChatMessage = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...msg,
  };
  send(IPC_CHANNELS.CHAT_MESSAGE, chatMsg);

  if (persist && chatHistoryStore && currentChatPhase && currentChatRunNumber > 0) {
    const agentRole = msg.agentRole ?? currentChatAgentRole;
    if (agentRole) {
      chatHistoryStore.appendMessage(currentChatPhase, agentRole, currentChatRunNumber, chatMsg);
    }
  }
}

export function onAgentEvent(event: AgentEvent): void {
  send(IPC_CHANNELS.AGENT_EVENT, event);

  // Track agent session boundaries for run numbering
  // Only respond to top-level init events (isTopLevel === true), not sub-task delegation
  if (event.type === 'agent:created' && event.isTopLevel && chatHistoryStore && currentChatPhase) {
    if (event.agentRole !== currentChatAgentRole) {
      currentChatAgentRole = event.agentRole;
      currentChatRunNumber = chatHistoryStore.nextRunNumber(currentChatPhase, event.agentRole);
    }
  }

  // Persist agent text messages
  if (event.type === 'agent:message' && event.message) {
    sendChat({
      role: 'agent',
      agentRole: event.agentRole,
      text: event.message,
    });
  }

  // Flush on agent close
  if (event.type === 'agent:closed') {
    chatHistoryStore?.flush();
  }

  // Extract cost updates for stats
  if (event.type === 'session:cost:update') {
    if (event.cost !== undefined) sessionStats.totalCost += event.cost;
    if (event.tokens !== undefined) sessionStats.totalTokens += event.tokens;
    send(IPC_CHANNELS.STATS_UPDATE, { ...sessionStats });
  }
}

export function handleAgentWaiting(agentRole: AgentRole, questions: AskQuestion[]): Promise<Record<string, string>> {
  return new Promise<Record<string, string>>((resolve, reject) => {
    const sessionId = `session-${incrementSessionId()}`;
    pendingQuestions.set(sessionId, { resolve, reject });

    const payload: AgentWaitingPayload = { sessionId, agentRole, questions };
    send(IPC_CHANNELS.AGENT_WAITING, payload);
  });
}

export function onSystemMessage(text: string): void {
  sendChat({ role: 'system', text });
}

export function rejectPendingQuestions(reason: string): void {
  for (const [, pending] of pendingQuestions) {
    pending.reject(new Error(reason));
  }
  pendingQuestions.clear();
}
