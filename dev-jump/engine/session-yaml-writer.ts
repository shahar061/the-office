import fs from 'fs';
import path from 'path';
import type { ProjectStateAfterSeed } from './types';

export function writeSessionYaml(projectDir: string, state: ProjectStateAfterSeed): void {
  const officeDir = path.join(projectDir, 'docs', 'office');
  fs.mkdirSync(officeDir, { recursive: true });

  const completedJson = JSON.stringify(state.completedPhases);
  // Add spaces after commas for readability (["a", "b"] instead of ["a","b"])
  const formattedJson = completedJson.replace(/,/g, ', ');
  const content = [
    `current_phase: "${state.currentPhase}"`,
    `completed_phases: ${formattedJson}`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(officeDir, 'session.yaml'), content, 'utf-8');
}
