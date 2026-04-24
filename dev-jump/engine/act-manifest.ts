import type { ActDefinition, JumpTarget } from './types';

export const ACT_MANIFEST: Record<JumpTarget, ActDefinition> = {
  'imagine.ceo': {
    target: 'imagine.ceo',
    phase: 'imagine',
    agentRole: 'ceo',
    displayName: 'CEO — Discovery',
    prerequisites: [],
    output: '01-vision-brief.md',
    priorChatAgents: [],
  },
  'imagine.product-manager': {
    target: 'imagine.product-manager',
    phase: 'imagine',
    agentRole: 'product-manager',
    displayName: 'Product Manager — Definition',
    prerequisites: ['01-vision-brief.md'],
    output: '02-prd.md',
    priorChatAgents: [
      { phase: 'imagine', agentRole: 'ceo' },
    ],
  },
  'imagine.market-researcher': {
    target: 'imagine.market-researcher',
    phase: 'imagine',
    agentRole: 'market-researcher',
    displayName: 'Market Researcher — Validation',
    prerequisites: ['01-vision-brief.md', '02-prd.md'],
    output: '03-market-analysis.md',
    priorChatAgents: [
      { phase: 'imagine', agentRole: 'ceo' },
      { phase: 'imagine', agentRole: 'product-manager' },
    ],
  },
  'imagine.ui-ux-expert': {
    target: 'imagine.ui-ux-expert',
    phase: 'imagine',
    agentRole: 'ui-ux-expert',
    displayName: 'UI/UX Expert — Design',
    prerequisites: ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md'],
    output: '05-ui-designs/index.md',
    priorChatAgents: [
      { phase: 'imagine', agentRole: 'ceo' },
      { phase: 'imagine', agentRole: 'product-manager' },
      { phase: 'imagine', agentRole: 'market-researcher' },
    ],
  },
  'imagine.chief-architect': {
    target: 'imagine.chief-architect',
    phase: 'imagine',
    agentRole: 'chief-architect',
    displayName: 'Chief Architect — Architecture',
    prerequisites: ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '05-ui-designs/index.md'],
    output: '04-system-design.md',
    priorChatAgents: [
      { phase: 'imagine', agentRole: 'ceo' },
      { phase: 'imagine', agentRole: 'product-manager' },
      { phase: 'imagine', agentRole: 'market-researcher' },
      { phase: 'imagine', agentRole: 'ui-ux-expert' },
    ],
  },
  // Warroom and build entries added in Task 15
  'warroom.project-manager': {} as ActDefinition,
  'warroom.team-lead': {} as ActDefinition,
  'build.engineering': {} as ActDefinition,
};
