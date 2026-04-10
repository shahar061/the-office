import fs from 'fs';
import path from 'path';
import type { Phase } from '../../shared/types';

const OFFICE_DIR = 'docs/office';
const UI_DESIGNS_DIR = 'docs/office/05-ui-designs';
const IMAGINE_ARTIFACTS = ['01-vision-brief.md', '04-system-design.md'];
const WARROOM_ARTIFACTS = ['tasks.yaml'];
const ALL_IMAGINE_DOCS = ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'];

const PHASE_ARTIFACTS: Record<string, string[]> = {
  imagine: ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'],
  warroom: ['plan.md', 'tasks.yaml'],
};

const PHASE_ORDER: Phase[] = ['idle', 'imagine', 'warroom', 'build', 'complete'];

export class ArtifactStore {
  private projectDir: string;
  constructor(projectDir: string) { this.projectDir = projectDir; }

  get officeDir(): string { return path.join(this.projectDir, OFFICE_DIR); }

  hasImagineArtifacts(): boolean {
    return IMAGINE_ARTIFACTS.every(f => fs.existsSync(path.join(this.officeDir, f)));
  }

  hasOnboardingScan(): boolean {
    return fs.existsSync(path.join(this.officeDir, 'PROJECT_CONTEXT.md'));
  }

  hasWarroomArtifacts(): boolean {
    return WARROOM_ARTIFACTS.every(f => fs.existsSync(path.join(this.officeDir, f)));
  }

  getImagineContext(): string {
    const parts: string[] = [];
    for (const file of ALL_IMAGINE_DOCS) {
      const filePath = path.join(this.officeDir, file);
      if (fs.existsSync(filePath)) {
        parts.push(`## ${file}\n\n${fs.readFileSync(filePath, 'utf-8')}`);
      }
    }
    // Include UI designs if present — reference HTML files, not inline them
    const uiIndexPath = path.join(this.projectDir, UI_DESIGNS_DIR, 'index.md');
    if (fs.existsSync(uiIndexPath)) {
      const uiIndex = fs.readFileSync(uiIndexPath, 'utf-8');
      parts.push(
        `## UI Designs (reference docs/office/05-ui-designs/*.html for mockups)\n\n${uiIndex}`
      );
    }
    // Workshop onboarding scan files
    const projectContextPath = path.join(this.officeDir, 'PROJECT_CONTEXT.md');
    if (fs.existsSync(projectContextPath)) {
      parts.push(`## Project Context\n\n${fs.readFileSync(projectContextPath, 'utf-8')}`);
    }
    const conventionsPath = path.join(this.officeDir, 'CONVENTIONS.md');
    if (fs.existsSync(conventionsPath)) {
      parts.push(`## Conventions\n\n${fs.readFileSync(conventionsPath, 'utf-8')}`);
    }
    return parts.join('\n\n---\n\n');
  }

  getSystemDesign(): string {
    return this.readArtifact('04-system-design.md');
  }

  getTasksYaml(): string | null {
    const filePath = path.join(this.officeDir, 'tasks.yaml');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  hasArtifact(filename: string): boolean {
    return fs.existsSync(path.join(this.officeDir, filename));
  }

  readArtifact(filename: string): string {
    const filePath = path.join(this.officeDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact not found: ${filename}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  ensureSpecsDir(): void {
    const specsDir = path.join(this.officeDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
  }

  getSpecForPhase(phaseId: string): string | null {
    const filePath = path.join(this.officeDir, 'specs', `phase-${phaseId}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Read docs/office/05-ui-designs/index.md and parse the mockup entries.
   * Returns an empty result if the index doesn't exist.
   */
  listUIDesigns(): { designDirection: string; mockups: Array<{ filename: string; caption: string; explanation: string }> } {
    const indexPath = path.join(this.projectDir, UI_DESIGNS_DIR, 'index.md');
    if (!fs.existsSync(indexPath)) {
      return { designDirection: '', mockups: [] };
    }
    const content = fs.readFileSync(indexPath, 'utf-8');

    // Parse "Design Direction" paragraph — everything between "## Design Direction" and the next "##"
    const directionMatch = content.match(/##\s+Design Direction\s*\n+([\s\S]*?)(?=\n##\s|$)/);
    const designDirection = directionMatch ? directionMatch[1].trim() : '';

    // Parse mockup entries — each is "### N. Caption\nFile: ./path\n\nExplanation..."
    const mockups: Array<{ filename: string; caption: string; explanation: string }> = [];
    const mockupRegex = /###\s+\d+\.\s+(.+?)\n+File:\s+\.\/(.+?)\n+([\s\S]*?)(?=\n###\s+\d+\.|$)/g;
    let match: RegExpExecArray | null;
    while ((match = mockupRegex.exec(content)) !== null) {
      mockups.push({
        caption: match[1].trim(),
        filename: match[2].trim(),
        explanation: match[3].trim(),
      });
    }

    return { designDirection, mockups };
  }

  hasUIDesigns(): boolean {
    return fs.existsSync(path.join(this.projectDir, UI_DESIGNS_DIR, 'index.md'));
  }

  /** Parse plan.md into milestone titles (best-effort heading extraction). */
  parsePlanMilestones(): { id: string; title: string }[] {
    const filePath = path.join(this.officeDir, 'plan.md');
    if (!fs.existsSync(filePath)) return [];
    const plan = fs.readFileSync(filePath, 'utf-8');
    const milestones: { id: string; title: string }[] = [];
    const lines = plan.split('\n');
    let idx = 0;
    for (const line of lines) {
      const match = line.match(/^#{2,3}\s+(.+)/);
      if (match) {
        idx++;
        milestones.push({ id: `m${idx}`, title: match[1].trim() });
      }
    }
    return milestones;
  }

  clearFrom(phase: Phase): void {
    const idx = PHASE_ORDER.indexOf(phase);
    const phasesToClear = PHASE_ORDER.slice(idx);

    for (const p of phasesToClear) {
      const artifacts = PHASE_ARTIFACTS[p];
      if (!artifacts) continue;
      for (const filename of artifacts) {
        const filePath = path.join(this.officeDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    // Clear UI designs directory if imagine or earlier is being cleared
    if (phasesToClear.includes('imagine')) {
      const uiDir = path.join(this.projectDir, UI_DESIGNS_DIR);
      if (fs.existsSync(uiDir)) {
        fs.rmSync(uiDir, { recursive: true, force: true });
      }
    }

    // Clear specs directory if warroom or earlier is being cleared
    if (phasesToClear.includes('warroom')) {
      const specsDir = path.join(this.officeDir, 'specs');
      if (fs.existsSync(specsDir)) {
        fs.rmSync(specsDir, { recursive: true, force: true });
      }
    }
  }

  /** Parse tasks.yaml into task entries grouped by milestone (best-effort). */
  parseTaskEntries(): { id: string; title: string; milestoneId: string }[] {
    const yaml = this.getTasksYaml();
    if (!yaml) return [];
    const tasks: { id: string; title: string; milestoneId: string }[] = [];
    let currentMilestone = 'm1';
    let phaseIdx = 0;
    let taskIdx = 0;
    for (const line of yaml.split('\n')) {
      const phaseMatch = line.match(/^(\w[\w\s-]*):\s*$/);
      if (phaseMatch) {
        phaseIdx++;
        currentMilestone = `m${phaseIdx}`;
        continue;
      }
      const taskMatch = line.match(/^\s+-\s+(?:name|description):\s*(.+)/);
      if (taskMatch) {
        taskIdx++;
        tasks.push({
          id: `t${taskIdx}`,
          title: taskMatch[1].trim().replace(/^["']|["']$/g, ''),
          milestoneId: currentMilestone,
        });
      }
    }
    return tasks;
  }
}
