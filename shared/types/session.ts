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
  x: number;
  y: number;
  activity: CharacterActivity;
}

export interface SessionSnapshot {
  sessionId: string;
  desktopName: string;
  phase: Phase;
  startedAt: number;
  activeAgentId: string | null;
  characters: CharacterSnapshot[];
  chatTail: ChatMessage[];  // capped at 50 messages
  sessionEnded: boolean;
}

export type SessionStatePatch =
  | { kind: 'phase'; phase: Phase }
  | { kind: 'activeAgent'; agentId: string | null }
  | { kind: 'ended'; ended: boolean };
