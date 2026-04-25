import type { AgentRole } from '../../shared/types';
import type { Scenario } from './types';
import { uiUxExpertScenario } from '../fixtures/scenarios/ui-ux-expert';

export const SCENARIOS: Partial<Record<AgentRole, Scenario>> = {
  'ui-ux-expert': uiUxExpertScenario,
};
