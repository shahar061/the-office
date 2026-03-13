import { AGENT_COLORS, type AgentRole } from '../../../../../shared/types';

export interface AgentConfig {
  role: AgentRole;
  displayName: string;
  color: string;
  group: 'leadership' | 'coordination' | 'engineering';
  deskTile: { x: number; y: number };
  idleZone: 'boardroom' | 'coordination' | 'bullpen' | 'common';
}

export const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  'ceo': {
    role: 'ceo', displayName: 'CEO', color: AGENT_COLORS['ceo'],
    group: 'leadership', deskTile: { x: 5, y: 8 }, idleZone: 'boardroom',
  },
  'product-manager': {
    role: 'product-manager', displayName: 'Product Manager', color: AGENT_COLORS['product-manager'],
    group: 'leadership', deskTile: { x: 5, y: 10 }, idleZone: 'boardroom',
  },
  'market-researcher': {
    role: 'market-researcher', displayName: 'Market Researcher', color: AGENT_COLORS['market-researcher'],
    group: 'leadership', deskTile: { x: 7, y: 8 }, idleZone: 'boardroom',
  },
  'chief-architect': {
    role: 'chief-architect', displayName: 'Chief Architect', color: AGENT_COLORS['chief-architect'],
    group: 'leadership', deskTile: { x: 7, y: 10 }, idleZone: 'boardroom',
  },
  'agent-organizer': {
    role: 'agent-organizer', displayName: 'Agent Organizer', color: AGENT_COLORS['agent-organizer'],
    group: 'coordination', deskTile: { x: 14, y: 8 }, idleZone: 'coordination',
  },
  'project-manager': {
    role: 'project-manager', displayName: 'Project Manager', color: AGENT_COLORS['project-manager'],
    group: 'coordination', deskTile: { x: 14, y: 10 }, idleZone: 'coordination',
  },
  'team-lead': {
    role: 'team-lead', displayName: 'Team Lead', color: AGENT_COLORS['team-lead'],
    group: 'coordination', deskTile: { x: 14, y: 12 }, idleZone: 'coordination',
  },
  'backend-engineer': {
    role: 'backend-engineer', displayName: 'Backend Engineer', color: AGENT_COLORS['backend-engineer'],
    group: 'engineering', deskTile: { x: 24, y: 6 }, idleZone: 'bullpen',
  },
  'frontend-engineer': {
    role: 'frontend-engineer', displayName: 'Frontend Engineer', color: AGENT_COLORS['frontend-engineer'],
    group: 'engineering', deskTile: { x: 27, y: 6 }, idleZone: 'bullpen',
  },
  'mobile-developer': {
    role: 'mobile-developer', displayName: 'Mobile Developer', color: AGENT_COLORS['mobile-developer'],
    group: 'engineering', deskTile: { x: 30, y: 6 }, idleZone: 'bullpen',
  },
  'ui-ux-expert': {
    role: 'ui-ux-expert', displayName: 'UI/UX Expert', color: AGENT_COLORS['ui-ux-expert'],
    group: 'engineering', deskTile: { x: 33, y: 6 }, idleZone: 'bullpen',
  },
  'data-engineer': {
    role: 'data-engineer', displayName: 'Data Engineer', color: AGENT_COLORS['data-engineer'],
    group: 'engineering', deskTile: { x: 24, y: 10 }, idleZone: 'bullpen',
  },
  'devops': {
    role: 'devops', displayName: 'DevOps', color: AGENT_COLORS['devops'],
    group: 'engineering', deskTile: { x: 27, y: 10 }, idleZone: 'bullpen',
  },
  'automation-developer': {
    role: 'automation-developer', displayName: 'Automation Dev', color: AGENT_COLORS['automation-developer'],
    group: 'engineering', deskTile: { x: 30, y: 10 }, idleZone: 'bullpen',
  },
  'freelancer': {
    role: 'freelancer', displayName: 'Freelancer', color: AGENT_COLORS['freelancer'],
    group: 'engineering', deskTile: { x: 33, y: 10 }, idleZone: 'common',
  },
};

export function getAgentConfig(role: AgentRole): AgentConfig {
  return AGENT_CONFIGS[role];
}