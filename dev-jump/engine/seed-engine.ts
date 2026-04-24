import fs from 'fs';
import path from 'path';
import type { Phase } from '../../shared/types';
import { ACT_MANIFEST } from './act-manifest';
import type { JumpTarget, ActDefinition, ProjectStateAfterSeed } from './types';
import { resolveSafeProjectDir } from './safety';
import { writeSessionYaml } from './session-yaml-writer';
import { writeProjectConfig } from './project-config-writer';
import { writeChatHistoryFiles } from './chat-history-writer';

export class FixtureMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureMissingError';
  }
}

export interface SeedOptions {
  target: JumpTarget;
  mode: 'real' | 'mock';
  projectDir?: string;
  force?: boolean;
}

export class SeedEngine {
  static readonly FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

  static seed(opts: SeedOptions): { projectDir: string } {
    const projectDir = resolveSafeProjectDir(opts.projectDir, { force: opts.force });
    const act = ACT_MANIFEST[opts.target];
    if (!act || !act.target) {
      throw new Error(`Unknown jump target: ${opts.target}`);
    }

    // 1. Reset the state directories (leave the root project dir intact).
    SeedEngine.wipeDir(path.join(projectDir, 'docs', 'office'));
    SeedEngine.wipeDir(path.join(projectDir, '.the-office', 'chat-history'));

    fs.mkdirSync(projectDir, { recursive: true });

    // 2. Copy prerequisite artifact files from fixtures.
    SeedEngine.copyArtifacts(projectDir, act.prerequisites);

    // 3. Copy chat-history fixtures for prior runs.
    const chatFilenames = act.priorChatAgents.map(
      ({ phase, agentRole }) => `${phase}_${agentRole}_1.json`,
    );
    if (chatFilenames.length > 0) {
      writeChatHistoryFiles(
        projectDir,
        path.join(SeedEngine.FIXTURES_DIR, 'chat'),
        chatFilenames,
      );
    }

    // 4. Write session.yaml and config.json.
    const stateAfterSeed = SeedEngine.computePhaseState(act);
    writeSessionYaml(projectDir, stateAfterSeed);
    writeProjectConfig(projectDir, path.basename(projectDir), stateAfterSeed);

    // 5. Mock-mode flag (mock-mode.flag handling added in Task 24 wiring).
    // Placeholder: for now, just record nothing extra for mode='real'.

    return { projectDir };
  }

  private static wipeDir(dir: string): void {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
  }

  private static copyArtifacts(projectDir: string, filenames: readonly string[]): void {
    const destOffice = path.join(projectDir, 'docs', 'office');
    const srcArtifacts = path.join(SeedEngine.FIXTURES_DIR, 'artifacts');

    for (const name of filenames) {
      const src = path.join(srcArtifacts, name);
      if (!fs.existsSync(src)) {
        throw new FixtureMissingError(`Missing fixture artifact: ${src}`);
      }
      const dst = path.join(destOffice, name);
      fs.mkdirSync(path.dirname(dst), { recursive: true });

      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        fs.cpSync(src, dst, { recursive: true });
      } else {
        fs.copyFileSync(src, dst);
      }
    }
  }

  private static computePhaseState(act: ActDefinition): ProjectStateAfterSeed {
    const currentPhase: Phase = act.phase;
    const completedPhases: Phase[] = [];
    if (currentPhase === 'warroom') completedPhases.push('imagine');
    if (currentPhase === 'build') completedPhases.push('imagine', 'warroom');
    return { currentPhase, completedPhases };
  }
}
