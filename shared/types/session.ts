// shared/types/session.ts — Session state, chat, phase, and snapshot types

import type { AgentRole } from './agent';

export type Phase = 'idle' | 'imagine' | 'warroom' | 'build' | 'complete';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentRole?: AgentRole;
  agentLabel?: string;
  text: string;
  timestamp: number;
  /**
   * Which device the message originated from. `'mobile'` marks messages
   * typed on the paired phone so the desktop chat panel can render a
   * small indicator next to the metadata. Omitted (undefined) for desktop
   * input — absence carries meaning and keeps old persisted history
   * forward-compatible.
   */
  source?: 'mobile' | 'desktop';
  /**
   * Phase at the time this message was appended to the snapshot's chatTail.
   * Stamped by SnapshotBuilder.ingestChat. Used by the mobile renderer to
   * interleave phase-transition separators between consecutive messages
   * whose phase differs. Optional for forward-compatibility with old
   * serialized histories.
   */
  phase?: Phase;
}

export interface ChatRun {
  runNumber: number;
  messages: ChatMessage[];
}

export interface PhaseHistory {
  agentRole: AgentRole;
  runs: ChatRun[];  // sorted by runNumber ascending
}

export interface PermissionRequest {
  requestId: string;
  agentRole: AgentRole;
  toolName: string;
  input: Record<string, unknown>;
}

export interface AskQuestion {
  question: string;
  header: string;
  options: { label: string; description?: string; tradeoffs?: string }[];
  multiSelect: boolean;
  recommendation?: string;
}

export interface AgentWaitingPayload {
  sessionId: string;
  agentRole: AgentRole;
  questions: AskQuestion[];
}

export interface ArchivedRun {
  agentRole: AgentRole;
  runNumber: number;
  messages: ChatMessage[];
  /** Timestamp of the first message in this run — used for sort + display date. */
  timestamp: number;
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

export interface SessionStats {
  totalCost: number;
  totalTokens: number;
  sessionTime: number;
  activeAgents: number;
}

export type CharacterActivity = 'idle' | 'walking' | 'reading' | 'typing' | 'waiting';

export interface CharacterSnapshot {
  agentId: string;
  agentRole: AgentRole;
  activity: CharacterActivity;
  /**
   * The tool this character is currently running, if any. Populated from
   * agent:tool:start events (cleared on tool:done / tool:clear / closed).
   * Drives the mobile Chat-tab ActivityFooter and the Pixi tool bubble
   * over the character sprite.
   */
  currentTool?: { toolName: string; target?: string };
}

export interface SessionSnapshot {
  /**
   * True while the desktop is inside a session (Office screen); false while
   * in the Lobby / project picker. Added 2026-04-21 for per-session pairing
   * scope. The phone uses this flag to branch between IdleScreen and the
   * live session UI.
   */
  sessionActive: boolean;
  /** Opaque identifier for the current session; null when sessionActive=false. */
  sessionId: string | null;
  desktopName: string;
  /** Human-readable label for the phone's "Now connected to [X]" toast. */
  projectName?: string;
  /** Absolute path to the project; phone displays basename only. */
  projectRoot?: string;
  phase: Phase;
  startedAt: number;
  activeAgentId: string | null;
  characters: CharacterSnapshot[];
  chatTail: ChatMessage[];  // no longer capped — archived runs hold older material
  sessionEnded: boolean;
  /**
   * Populated while an agent is blocked on AskUserQuestion.
   * Cleared when the user answers, the session resets, or the project
   * switches. Single-value by design — the current orchestrator only
   * has one question outstanding at a time.
   */
  waiting?: AgentWaitingPayload;
  /**
   * Older completed runs within the current phase. Populated on project open
   * and refreshed on phase transitions and new runs. Mobile renders these as
   * collapsible buttons above the flat chatTail. Optional for forward
   * compatibility with old persisted snapshots.
   */
  archivedRuns?: ArchivedRun[];
}

export type SessionStatePatch =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'activeAgent'; agentId: string | null }
  | { kind: 'ended'; ended: boolean }
  | { kind: 'waiting'; payload: AgentWaitingPayload | null }
  | { kind: 'archivedRuns'; runs: ArchivedRun[]; resetTail: boolean };
