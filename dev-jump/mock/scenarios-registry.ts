import type { AgentRole } from '../../shared/types';
import type { Scenario } from './types';
import { ceoScenario } from '../fixtures/scenarios/ceo';
import { productManagerScenario } from '../fixtures/scenarios/product-manager';
import { marketResearcherScenario } from '../fixtures/scenarios/market-researcher';
import { uiUxExpertScenario } from '../fixtures/scenarios/ui-ux-expert';
import { chiefArchitectScenario } from '../fixtures/scenarios/chief-architect';
import { projectManagerScenario } from '../fixtures/scenarios/project-manager';
import { teamLeadScenario } from '../fixtures/scenarios/team-lead';
import {
  backendEngineerScenario,
  frontendEngineerScenario,
  mobileDeveloperScenario,
  dataEngineerScenario,
  devopsScenario,
  automationDeveloperScenario,
} from '../fixtures/scenarios/engineers';

export const SCENARIOS: Partial<Record<AgentRole, Scenario>> = {
  // Imagine
  ceo: ceoScenario,
  'product-manager': productManagerScenario,
  'market-researcher': marketResearcherScenario,
  'ui-ux-expert': uiUxExpertScenario,
  'chief-architect': chiefArchitectScenario,
  // War Room
  'project-manager': projectManagerScenario,
  'team-lead': teamLeadScenario,
  // Build
  'backend-engineer': backendEngineerScenario,
  'frontend-engineer': frontendEngineerScenario,
  'mobile-developer': mobileDeveloperScenario,
  'data-engineer': dataEngineerScenario,
  devops: devopsScenario,
  'automation-developer': automationDeveloperScenario,
};
