import type { AgentRole } from '../../shared/types';
import type { Scenario } from './types';
// Scenario imports added as authored (Task 33 adds ui-ux-expert).

export const SCENARIOS: Partial<Record<AgentRole, Scenario>> = {
  // 'ui-ux-expert': uiUxExpertScenario,  ← Task 34
};
