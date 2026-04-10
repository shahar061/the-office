import { ArtifactStore } from '../project/artifact-store';
import { runAgentSession } from './run-agent-session';
import type { PhaseConfig, UIDesignReviewPayload, UIDesignReviewResponse } from '../../shared/types';

export interface ImagineConfig extends PhaseConfig {
  onSystemMessage: (text: string) => void;
  onArtifactAvailable: (payload: { key: string; filename: string; agentRole: string }) => void;
  onUIReviewReady: (payload: UIDesignReviewPayload) => Promise<UIDesignReviewResponse>;
}

interface Act {
  name: string;
  artifact: { key: string; filename: string; agentRole: string };
  run: () => Promise<void>;
}

/**
 * Run a single act, skipping it if its artifact already exists on disk.
 * This is the core resume mechanism: each act is idempotent based on its output file.
 */
async function runAct(act: Act, artifactStore: ArtifactStore, config: ImagineConfig): Promise<void> {
  if (artifactStore.hasArtifact(act.artifact.filename)) {
    config.onSystemMessage(`Resuming — ${act.artifact.filename} exists, skipping ${act.name}.`);
  } else {
    config.onActStart?.(act.name);
    await act.run();
    config.onActComplete?.(act.name);
  }
  config.onArtifactAvailable(act.artifact);
}

export async function runImagine(userIdea: string, config: ImagineConfig): Promise<void> {
  const { projectDir, agentsDir, env, onEvent, onWaiting } = config;
  const artifactStore = new ArtifactStore(projectDir);

  // 1. CEO — Discovery
  await runAct({
    name: 'CEO Discovery',
    artifact: { key: 'vision-brief', filename: '01-vision-brief.md', agentRole: 'ceo' },
    run: () => runAgentSession({
      agentName: 'ceo',
      agentsDir,
      prompt: [
        'You are the CEO leading the Discovery phase.',
        'Ask the user clarifying questions to understand their idea deeply.',
        'Use AskUserQuestion to ask structured questions with options when possible.',
        'For each option, include a description explaining it and tradeoffs (short pros/cons).',
        'Set recommendation to the label of the option you think is best.',
        'When you have enough understanding, write the vision brief to docs/office/01-vision-brief.md.',
        '',
        `The user's idea: ${userIdea}`,
      ].join('\n'),
      cwd: projectDir,
      env,
      expectedOutput: 'docs/office/01-vision-brief.md',
      onEvent,
      onWaiting,
    }),
  }, artifactStore, config);

  // 2. PM — Definition
  await runAct({
    name: 'PM Definition',
    artifact: { key: 'prd', filename: '02-prd.md', agentRole: 'product-manager' },
    run: () => {
      const visionBrief = artifactStore.readArtifact('01-vision-brief.md');
      return runAgentSession({
        agentName: 'product-manager',
        agentsDir,
        prompt: [
          'You are the Product Manager leading the Definition phase.',
          'Based on the vision brief below, ask the user questions to refine requirements.',
          'Use AskUserQuestion for structured questions when possible.',
          'For each option, include a description explaining it and tradeoffs (short pros/cons).',
          'Set recommendation to the label of the option you think is best.',
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
    },
  }, artifactStore, config);

  // 3. Market Researcher — Validation
  await runAct({
    name: 'Market Research',
    artifact: { key: 'market-analysis', filename: '03-market-analysis.md', agentRole: 'market-researcher' },
    run: () => {
      const visionBrief = artifactStore.readArtifact('01-vision-brief.md');
      const prd = artifactStore.readArtifact('02-prd.md');
      return runAgentSession({
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
    },
  }, artifactStore, config);

  // 3.5. UI/UX Expert — Design
  await runAct({
    name: 'UI/UX Design',
    artifact: { key: 'ui-designs', filename: '05-ui-designs/index.md', agentRole: 'ui-ux-expert' },
    run: async () => {
      const visionBrief = artifactStore.readArtifact('01-vision-brief.md');
      const prd = artifactStore.readArtifact('02-prd.md');
      const marketAnalysis = artifactStore.readArtifact('03-market-analysis.md');

      const basePrompt = [
        'You are the UI/UX Expert leading the UI Design act.',
        'Produce 3-5 HTML mockups of the product\'s key screens based on the documents below.',
        'Each mockup must be self-contained (inline CSS, no external dependencies).',
        'Write the mockups to docs/office/05-ui-designs/NN-slug.html and create docs/office/05-ui-designs/index.md with captions and explanations.',
        '',
        '## Vision Brief',
        visionBrief,
        '',
        '## PRD',
        prd,
        '',
        '## Market Analysis',
        marketAnalysis,
      ].join('\n');

      let feedback: string | undefined;
      while (true) {
        const prompt = feedback
          ? `REVISION REQUEST: The user reviewed your mockups and wants these changes:\n\n${feedback}\n\nRead the existing files in docs/office/05-ui-designs/ and apply the feedback.\n\n${basePrompt}`
          : basePrompt;

        await runAgentSession({
          agentName: 'ui-ux-expert',
          agentsDir,
          prompt,
          cwd: projectDir,
          env,
          expectedOutput: 'docs/office/05-ui-designs/index.md',
          onEvent,
          onWaiting,
        });

        // Parse the produced files and present for review
        const uiDesigns = artifactStore.listUIDesigns();
        const response = await config.onUIReviewReady({
          designDirection: uiDesigns.designDirection,
          mockups: uiDesigns.mockups,
        });

        if (response.approved) break;
        feedback = response.feedback;
        if (!feedback) break; // no feedback = implicit approval
      }
    },
  }, artifactStore, config);

  // 4. Chief Architect — Architecture
  await runAct({
    name: 'Architecture',
    artifact: { key: 'system-design', filename: '04-system-design.md', agentRole: 'chief-architect' },
    run: () => {
      const allDocs = artifactStore.getImagineContext();
      return runAgentSession({
        agentName: 'chief-architect',
        agentsDir,
        prompt: [
          'You are the Chief Architect leading the Architecture phase.',
          'Based on the design documents below, ask the user about tech stack preferences.',
          'Use AskUserQuestion for structured questions when possible.',
          'For each option, include a description explaining it and tradeoffs (short pros/cons).',
          'Set recommendation to the label of the option you think is best.',
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
    },
  }, artifactStore, config);
}
