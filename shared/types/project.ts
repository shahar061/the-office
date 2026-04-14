// shared/types/project.ts — Project lifecycle, orchestration, and visualization types

import type { AgentRole, AgentEvent } from './agent';
import type { Phase, AskQuestion, AgentWaitingPayload } from './session';

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
  gitInit?: 'yes' | 'no' | null;
  gitIdentityId?: string | null;
  greenfieldGit?: {
    initialized: boolean;
    deferred: boolean;
    includeOfficeState: boolean;
    lastIterationN: number;
  };
}

export interface PhaseInfo {
  phase: Phase;
  status: 'starting' | 'active' | 'completing' | 'completed' | 'failed' | 'interrupted';
}

export interface RestartPhasePayload {
  targetPhase: Phase;
  userIdea?: string;  // only for imagine
}

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

export interface Request {
  id: string;
  title: string;
  description: string;
  status: 'queued' | 'in_progress' | 'awaiting_review' | 'done' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  assignedAgent: AgentRole | null;
  result: string | null;
  error: string | null;
  plan: string | null;
  branchName: string | null;
  baseBranch: string | null;
  commitSha: string | null;
  branchIsolated: boolean;
  mergedAt: number | null;
}

export interface RequestPlanReadyPayload {
  requestId: string;
  title: string;
  plan: string;
}

export interface RequestPlanResponse {
  action: 'approve' | 'revise';
  feedback?: string;
}

export interface GitInitPromptPayload {
  projectPath: string;
}

export interface GitRecoveryNote {
  level: 'info' | 'warning';
  message: string;
  requestId?: string;
}

export interface DiffHunkLine {
  type: 'add' | 'remove' | 'context' | 'meta';
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'binary';
  insertions: number;
  deletions: number;
  hunks: DiffHunkLine[];
  truncated: boolean;
}

export interface DiffResult {
  files: DiffFile[];
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
}
