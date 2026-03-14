import { AGENT_COLORS, type AgentRole } from '../../../../../shared/types';

export interface AgentConfig {
  role: AgentRole;
  displayName: string;
  color: string;
  group: 'leadership' | 'coordination' | 'engineering';
  spriteVariant: string;
  idleZone: 'boardroom' | 'open-work-area' | 'break-room';
}

export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  'ceo': {
    role: 'ceo', displayName: 'CEO', color: AGENT_COLORS['ceo'],
    group: 'leadership', spriteVariant: 'char_01', idleZone: 'boardroom',
  },
  'product-manager': {
    role: 'product-manager', displayName: 'Product Manager', color: AGENT_COLORS['product-manager'],
    group: 'leadership', spriteVariant: 'char_02', idleZone: 'boardroom',
  },
  'market-researcher': {
    role: 'market-researcher', displayName: 'Market Researcher', color: AGENT_COLORS['market-researcher'],
    group: 'leadership', spriteVariant: 'char_03', idleZone: 'boardroom',
  },
  'chief-architect': {
    role: 'chief-architect', displayName: 'Chief Architect', color: AGENT_COLORS['chief-architect'],
    group: 'leadership', spriteVariant: 'char_04', idleZone: 'boardroom',
  },
  'agent-organizer': {
    role: 'agent-organizer', displayName: 'Agent Organizer', color: AGENT_COLORS['agent-organizer'],
    group: 'coordination', spriteVariant: 'char_05', idleZone: 'open-work-area',
  },
  'project-manager': {
    role: 'project-manager', displayName: 'Project Manager', color: AGENT_COLORS['project-manager'],
    group: 'coordination', spriteVariant: 'char_06', idleZone: 'open-work-area',
  },
  'team-lead': {
    role: 'team-lead', displayName: 'Team Lead', color: AGENT_COLORS['team-lead'],
    group: 'coordination', spriteVariant: 'char_07', idleZone: 'open-work-area',
  },
  'backend-engineer': {
    role: 'backend-engineer', displayName: 'Backend Engineer', color: AGENT_COLORS['backend-engineer'],
    group: 'engineering', spriteVariant: 'char_08', idleZone: 'open-work-area',
  },
  'frontend-engineer': {
    role: 'frontend-engineer', displayName: 'Frontend Engineer', color: AGENT_COLORS['frontend-engineer'],
    group: 'engineering', spriteVariant: 'char_09', idleZone: 'open-work-area',
  },
  'mobile-developer': {
    role: 'mobile-developer', displayName: 'Mobile Developer', color: AGENT_COLORS['mobile-developer'],
    group: 'engineering', spriteVariant: 'char_10', idleZone: 'open-work-area',
  },
  'ui-ux-expert': {
    role: 'ui-ux-expert', displayName: 'UI/UX Expert', color: AGENT_COLORS['ui-ux-expert'],
    group: 'engineering', spriteVariant: 'char_11', idleZone: 'open-work-area',
  },
  'data-engineer': {
    role: 'data-engineer', displayName: 'Data Engineer', color: AGENT_COLORS['data-engineer'],
    group: 'engineering', spriteVariant: 'char_12', idleZone: 'open-work-area',
  },
  'devops': {
    role: 'devops', displayName: 'DevOps', color: AGENT_COLORS['devops'],
    group: 'engineering', spriteVariant: 'char_13', idleZone: 'open-work-area',
  },
  'automation-developer': {
    role: 'automation-developer', displayName: 'Automation Dev', color: AGENT_COLORS['automation-developer'],
    group: 'engineering', spriteVariant: 'char_14', idleZone: 'open-work-area',
  },
  'freelancer': {
    role: 'freelancer', displayName: 'Freelancer', color: AGENT_COLORS['freelancer'],
    group: 'engineering', spriteVariant: 'char_15', idleZone: 'break-room',
  },
};

export function getAgentConfig(role: AgentRole): AgentConfig {
  return AGENT_CONFIGS[role];
}
