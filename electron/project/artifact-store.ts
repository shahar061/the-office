import fs from 'fs';
import path from 'path';

const OFFICE_DIR = 'docs/office';
const IMAGINE_ARTIFACTS = ['01-vision-brief.md', '04-system-design.md'];
const WARROOM_ARTIFACTS = ['tasks.yaml'];
const ALL_IMAGINE_DOCS = ['01-vision-brief.md', '02-prd.md', '03-market-analysis.md', '04-system-design.md'];

export class ArtifactStore {
  private projectDir: string;
  constructor(projectDir: string) { this.projectDir = projectDir; }

  get officeDir(): string { return path.join(this.projectDir, OFFICE_DIR); }

  hasImagineArtifacts(): boolean {
    return IMAGINE_ARTIFACTS.every(f => fs.existsSync(path.join(this.officeDir, f)));
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
    return parts.join('\n\n---\n\n');
  }

  getTasksYaml(): string | null {
    const filePath = path.join(this.officeDir, 'tasks.yaml');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  readArtifact(filename: string): string {
    const filePath = path.join(this.officeDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact not found: ${filename}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
}
