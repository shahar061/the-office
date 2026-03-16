import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig } from '../../shared/types';

export interface ImagineConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
  onArtifactAvailable: (payload: { key: string; filename: string; agentRole: string }) => void;
}

export async function runImagine(userIdea: string, config: ImagineConfig): Promise<void> {
  const { projectDir, agentsDir, env, onEvent, onWaiting, onSystemMessage, onArtifactAvailable } = config;
  const artifactStore = new ArtifactStore(projectDir);

  // 1. CEO — Discovery
  await runAgentSession({
    agentName: 'ceo',
    agentsDir,
    prompt: [
      'You are the CEO leading the Discovery phase.',
      'Ask the user clarifying questions to understand their idea deeply.',
      'Use AskUserQuestion to ask structured questions with options when possible.',
      'When you have enough understanding, write the vision brief to docs/office/01-vision-brief.md.',
      '',
      `The user's idea: ${userIdea}`,
    ].join('\n'),
    cwd: projectDir,
    env,
    expectedOutput: 'docs/office/01-vision-brief.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('CEO completed Discovery phase. Product Manager starting Definition...');
  onArtifactAvailable({ key: 'vision-brief', filename: '01-vision-brief.md', agentRole: 'ceo' });

  // 2. PM — Definition
  const visionBrief = artifactStore.readArtifact('01-vision-brief.md');
  await runAgentSession({
    agentName: 'product-manager',
    agentsDir,
    prompt: [
      'You are the Product Manager leading the Definition phase.',
      'Based on the vision brief below, ask the user questions to refine requirements.',
      'Use AskUserQuestion for structured questions when possible.',
      'Produce a detailed PRD and write it to docs/office/02-prd.md.',
      '',
      '## Vision Brief',
      visionBrief,
    ].join('\n'),
    cwd: projectDir,
    env,
    expectedOutput: 'docs/office/02-prd.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Product Manager completed Definition. Market Researcher starting Validation...');
  onArtifactAvailable({ key: 'prd', filename: '02-prd.md', agentRole: 'product-manager' });

  // 3. Market Researcher — Validation
  const prd = artifactStore.readArtifact('02-prd.md');
  await runAgentSession({
    agentName: 'market-researcher',
    agentsDir,
    prompt: [
      'You are the Market Researcher leading the Validation phase.',
      'Research the market landscape, competitors, and opportunities.',
      'Use WebSearch to gather real data.',
      'Write your analysis to docs/office/03-market-analysis.md.',
      '',
      '## Vision Brief',
      visionBrief,
      '',
      '## PRD',
      prd,
    ].join('\n'),
    cwd: projectDir,
    env,
    excludeAskUser: true,
    expectedOutput: 'docs/office/03-market-analysis.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Market Researcher completed Validation. Chief Architect starting Architecture...');
  onArtifactAvailable({ key: 'market-analysis', filename: '03-market-analysis.md', agentRole: 'market-researcher' });

  // 4. Chief Architect — Architecture
  const allDocs = artifactStore.getImagineContext();
  await runAgentSession({
    agentName: 'chief-architect',
    agentsDir,
    prompt: [
      'You are the Chief Architect leading the Architecture phase.',
      'Based on the design documents below, ask the user about tech stack preferences.',
      'Use AskUserQuestion for structured questions when possible.',
      'Design the system architecture and write it to docs/office/04-system-design.md.',
      '',
      allDocs,
    ].join('\n'),
    cwd: projectDir,
    env,
    expectedOutput: 'docs/office/04-system-design.md',
    onEvent,
    onWaiting,
  });
  onSystemMessage('Chief Architect completed Architecture. Imagine phase complete.');
  onArtifactAvailable({ key: 'system-design', filename: '04-system-design.md', agentRole: 'chief-architect' });
}
