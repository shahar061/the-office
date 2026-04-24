import fs from 'fs';
import path from 'path';
import type { ProjectState } from '../../shared/types';
import type { ProjectStateAfterSeed } from './types';

const OFFICE_DIR = '.the-office';
const CONFIG_FILE = 'config.json';

export function writeProjectConfig(
  projectDir: string,
  projectName: string,
  state: ProjectStateAfterSeed,
): void {
  const officeDir = path.join(projectDir, OFFICE_DIR);
  fs.mkdirSync(officeDir, { recursive: true });

  const config: ProjectState = {
    name: projectName,
    path: projectDir,
    currentPhase: state.currentPhase,
    completedPhases: state.completedPhases,
    interrupted: false,
    introSeen: true,
    buildIntroSeen: true,
    mode: 'greenfield',
  };

  fs.writeFileSync(
    path.join(officeDir, CONFIG_FILE),
    JSON.stringify(config, null, 2),
    'utf-8',
  );
}
