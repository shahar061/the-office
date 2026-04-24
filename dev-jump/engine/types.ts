import type { Phase, AgentRole } from '../../shared/types';

export type JumpTarget =
  | 'imagine.ceo'
  | 'imagine.product-manager'
  | 'imagine.market-researcher'
  | 'imagine.ui-ux-expert'
  | 'imagine.chief-architect'
  | 'warroom.project-manager'
  | 'warroom.team-lead'
  | 'build.engineering';

export const ALL_JUMP_TARGETS: readonly JumpTarget[] = [
  'imagine.ceo',
  'imagine.product-manager',
  'imagine.market-researcher',
  'imagine.ui-ux-expert',
  'imagine.chief-architect',
  'warroom.project-manager',
  'warroom.team-lead',
  'build.engineering',
] as const;

export interface ActDefinition {
  /** Unique target identifier. */
  target: JumpTarget;
  /** Phase this act belongs to. */
  phase: Phase;
  /** Primary agent role for this act. */
  agentRole: AgentRole;
  /** Human-readable name shown in CLI output and the dev panel. */
  displayName: string;
  /** Artifact filenames (relative to docs/office/) that must exist BEFORE this act runs. */
  prerequisites: readonly string[];
  /** Artifact filename (relative to docs/office/) produced by this act. Must NOT exist when jumping. */
  output: string;
  /** Prior agent runs whose chat history is seeded when jumping here. */
  priorChatAgents: ReadonlyArray<{ phase: Phase; agentRole: AgentRole }>;
}

export interface ProjectStateAfterSeed {
  currentPhase: Phase;
  completedPhases: Phase[];
}
