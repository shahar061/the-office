import fs from 'fs';
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
  PhaseHistory,
  SessionStats,
} from '../../shared/types';
import { ArtifactStore } from '../project/artifact-store';
import { ChatHistoryStore } from '../project/chat-history-store';
import { RequestStore } from '../project/request-store';
import { AuthManager } from '../auth/auth-manager';
import { ProjectManager } from '../project/project-manager';
import { PhaseMachine } from '../orchestrator/phase-machine';
import { PermissionHandler } from '../sdk/permission-handler';
import { StatsCollector } from '../stats/stats-collector';
import { SettingsStore } from '../project/settings-store';
import type { MobileBridge } from '../mobile-bridge';

// ── Constants ──

export const dataDir = path.join(app.getPath('userData'), 'the-office');
export const agentsDir = path.join(__dirname, '../../agents');

// ── Singleton instances ──

export const authManager = new AuthManager(dataDir);
export const projectManager = new ProjectManager(dataDir);
export const settingsStore = new SettingsStore(dataDir, projectManager);

// ── Mutable state ──

export let mainWindow: BrowserWindow | null = null;
export let currentProjectDir: string | null = null;
export let artifactStore: ArtifactStore | null = null;
export let chatHistoryStore: ChatHistoryStore | null = null;
export let requestStore: RequestStore | null = null;
export let statsCollector: StatsCollector | null = null;
export let phaseMachine: PhaseMachine | null = null;
export let permissionHandler: PermissionHandler | null = null;
export let activeAbort: (() => void) | null = null;
export let mobileBridge: MobileBridge | null = null;
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

// Pending AskUserQuestion promises, keyed by session ID. `questions` is kept
// alongside the resolver so a non-renderer caller (e.g. the mobile bridge)
// can answer without having to reconstruct the question text.
export interface PendingQuestion {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
  questions?: AskQuestion[];
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

// Pending UI design review promise, resolved when user responds
export interface PendingUIReview {
  resolve: (response: import('../../shared/types').UIDesignReviewResponse) => void;
}
export let pendingUIReview: PendingUIReview | null = null;

export function setPendingUIReview(pr: PendingUIReview | null): void {
  pendingUIReview = pr;
}

// Pending Workshop request plan review promise, resolved when user responds
export interface PendingRequestPlanReview {
  requestId: string;
  resolve: (response: import('../../shared/types').RequestPlanResponse) => void;
}
export let pendingRequestPlanReview: PendingRequestPlanReview | null = null;

export function setPendingRequestPlanReview(pr: PendingRequestPlanReview | null): void {
  pendingRequestPlanReview = pr;
}

// Pending git init prompt response (sub-project 4)
export interface PendingGitInit {
  resolve: (answer: 'yes' | 'no') => void;
}
export let pendingGitInit: PendingGitInit | null = null;

export function setPendingGitInit(p: PendingGitInit | null): void {
  pendingGitInit = p;
}

// Pending warroom intro completion
export interface PendingIntro {
  resolve: () => void;
}
export let pendingIntro: PendingIntro | null = null;

export function setPendingIntro(pi: PendingIntro | null): void {
  pendingIntro = pi;
}

// Pending build intro completion
export let pendingBuildIntro: PendingIntro | null = null;

export function setPendingBuildIntro(pi: PendingIntro | null): void {
  pendingBuildIntro = pi;
}

// ── Setter functions ──
// ESM modules can't reassign imported `let` bindings, so we expose setters.

export function setMainWindow(w: BrowserWindow | null): void {
  mainWindow = w;
}

export function setCurrentProjectDir(dir: string | null): void {
  currentProjectDir = dir;
  if (!mobileBridge) return;
  if (dir) {
    // `getProjectState` reads .the-office/config.json; returns a sensible
    // default if the file isn't there yet (e.g. mid-createProject before
    // the config is written). Fall back to path basename in that case.
    let projectName: string;
    try {
      projectName = projectManager.getProjectState(dir).name || path.basename(dir);
    } catch {
      projectName = path.basename(dir);
    }
    mobileBridge.onSessionScopeChanged({
      active: true,
      sessionId: dir,
      projectName,
      projectRoot: dir,
    });
  } else {
    mobileBridge.onSessionScopeChanged({ active: false });
  }
}

export function setArtifactStore(store: ArtifactStore | null): void {
  artifactStore = store;
}

export function setChatHistoryStore(store: ChatHistoryStore | null): void {
  chatHistoryStore = store;
}

export function setRequestStore(store: RequestStore | null): void {
  requestStore = store;
}

export function setStatsCollector(sc: StatsCollector | null): void {
  statsCollector = sc;
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

export function setMobileBridge(bridge: MobileBridge | null): void {
  mobileBridge = bridge;
}

export function setCurrentChatPhase(phase: Phase | null): void {
  currentChatPhase = phase;
  refreshMobileArchivedRuns(true);
}

export function setCurrentChatAgentRole(role: AgentRole | null): void {
  currentChatAgentRole = role;
}

export function setCurrentChatRunNumber(n: number): void {
  currentChatRunNumber = n;
  if (n > 0) refreshMobileArchivedRuns(true);
}

export function incrementSessionId(): number {
  return ++nextSessionId;
}

// ── Helper functions ──

export function isDevModeActive(): boolean {
  return process.env.OFFICE_DEV === '1' || settingsStore.get().devMode === true;
}

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
  // Forward every chat message (user / agent / system) to the mobile bridge.
  // Mobile's snapshot.chatTail is how the phone renders history; the
  // `agent:message` event path only drives canvas animations, not the chat
  // view. Previously this was gated `msg.role !== 'agent'` and agent replies
  // never reached the phone.
  console.log('[sendChat] forwarding to mobile:', msg.role, msg.text.slice(0, 40));
  mobileBridge?.onChat([chatMsg]);

  if (persist && chatHistoryStore && currentChatPhase && currentChatRunNumber > 0) {
    const agentRole = msg.agentRole ?? currentChatAgentRole;
    if (agentRole) {
      chatHistoryStore.appendMessage(currentChatPhase, agentRole, currentChatRunNumber, chatMsg);
    }
  }
}

export function onAgentEvent(event: AgentEvent): void {
  // Forward to stats collector
  if (statsCollector) {
    // Intercept synthetic rate limit info messages
    if (event.type === 'agent:message' && event.message?.startsWith('__rate_limit_info__')) {
      try {
        const info = JSON.parse(event.message.slice('__rate_limit_info__'.length));
        statsCollector.onRateLimit(info);
      } catch { /* ignore parse errors */ }
      return; // Don't forward synthetic messages to chat/renderer
    }
    statsCollector.onAgentEvent(event);
  }

  send(IPC_CHANNELS.AGENT_EVENT, event);
  mobileBridge?.onAgentEvent(event);

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
      agentLabel: event.agentLabel,
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
    pendingQuestions.set(sessionId, { resolve, reject, questions });

    const payload: AgentWaitingPayload = { sessionId, agentRole, questions };
    send(IPC_CHANNELS.AGENT_WAITING, payload);
    mobileBridge?.onAgentWaiting(payload);   // NEW

    // Persist so the question survives app restart
    if (currentProjectDir) {
      persistWaitingState(currentProjectDir, payload);
    }
  });
}

export function onSystemMessage(text: string): void {
  sendChat({ role: 'system', text });
}

export function rejectPendingQuestions(reason: string, clearPersistedState = false): void {
  for (const [, pending] of pendingQuestions) {
    pending.reject(new Error(reason));
  }
  pendingQuestions.clear();
  mobileBridge?.onAgentWaiting(null);   // NEW — always clear on reject

  if (clearPersistedState && currentProjectDir) clearWaitingState(currentProjectDir);
}

/**
 * Recompute the current phase's archived runs and push them to the mobile
 * bridge. `resetTail: true` clears the phone's chatTail (phase transition,
 * new run, project switch). `false` leaves it intact (project open with a
 * still-active run).
 *
 * No-op if the store or phase isn't ready yet — the first real trigger
 * after setup will fire the refresh.
 */
export function refreshMobileArchivedRuns(resetTail: boolean): void {
  if (!mobileBridge) return;
  if (!chatHistoryStore || !currentChatPhase) {
    mobileBridge.onArchivedRuns([], resetTail);
    return;
  }
  const runs = chatHistoryStore.computeArchivedRuns(currentChatPhase);
  mobileBridge.onArchivedRuns(runs, resetTail);
}

export function getPhaseHistoryForMobile(phase: Phase): PhaseHistory[] {
  if (!chatHistoryStore) return [];
  return chatHistoryStore.getPhaseHistory(phase);
}

// ── Waiting-state persistence ──

const OFFICE_DIR = '.the-office';
const PENDING_QUESTION_FILE = 'pending-question.json';

function pendingQuestionPath(projectDir: string): string {
  return path.join(projectDir, OFFICE_DIR, PENDING_QUESTION_FILE);
}

export function persistWaitingState(projectDir: string, payload: AgentWaitingPayload): void {
  try {
    const dir = path.join(projectDir, OFFICE_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      pendingQuestionPath(projectDir),
      JSON.stringify({ ...payload, phase: currentChatPhase }, null, 2),
      'utf-8',
    );
  } catch (err) {
    console.error('[State] Failed to persist waiting state:', err);
  }
}

export function clearWaitingState(projectDir: string): void {
  try {
    const fp = pendingQuestionPath(projectDir);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (err) {
    console.error('[State] Failed to clear waiting state:', err);
  }
}

export function loadWaitingState(projectDir: string): (AgentWaitingPayload & { phase?: Phase }) | null {
  try {
    const fp = pendingQuestionPath(projectDir);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Pending-review persistence (warroom plan review gate) ──

const PENDING_REVIEW_FILE = 'pending-review.json';

function pendingReviewPath(projectDir: string): string {
  return path.join(projectDir, OFFICE_DIR, PENDING_REVIEW_FILE);
}

export interface PersistedReview {
  artifact: 'plan' | 'tasks';
  phase: Phase;
}

export function persistPendingReview(projectDir: string, artifact: 'plan' | 'tasks'): void {
  try {
    const dir = path.join(projectDir, OFFICE_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data: PersistedReview = { artifact, phase: currentChatPhase ?? 'warroom' };
    fs.writeFileSync(pendingReviewPath(projectDir), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[State] Failed to persist pending review:', err);
  }
}

export function clearPendingReview(projectDir: string): void {
  try {
    const fp = pendingReviewPath(projectDir);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (err) {
    console.error('[State] Failed to clear pending review:', err);
  }
}

export function loadPendingReview(projectDir: string): PersistedReview | null {
  try {
    const fp = pendingReviewPath(projectDir);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch {
    return null;
  }
}

/** Reset all session state when switching projects. */
export function resetSessionState(): void {
  // Abort any active agent session
  if (activeAbort) {
    activeAbort();
    activeAbort = null;
  }

  // Clear pending promises
  rejectPendingQuestions('Project switch');
  pendingReview = null;
  pendingUIReview = null;
  pendingIntro = null;
  pendingBuildIntro = null;
  pendingRequestPlanReview = null;
  pendingGitInit = null;

  // Reset stats collector
  if (statsCollector) statsCollector.flush();
  statsCollector = null;

  // Clear request store
  requestStore = null;

  // Reset phase/chat tracking
  phaseMachine = null;
  permissionHandler = null;
  currentChatPhase = null;
  currentChatAgentRole = null;
  currentChatRunNumber = 0;

  // Reset session stats
  sessionStats.totalCost = 0;
  sessionStats.totalTokens = 0;
  sessionStats.sessionTime = 0;
  sessionStats.activeAgents = 0;

  mobileBridge?.onArchivedRuns([], true);
}
