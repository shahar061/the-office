import fs from 'fs';
import path from 'path';
import type { Phase, ProjectInfo, ProjectState } from '../../shared/types';

const OFFICE_DIR = '.the-office';
const CONFIG_FILE = 'config.json';
const RECENT_PROJECTS_FILE = 'recent-projects.json';

const DEFAULT_STATE: Omit<ProjectState, 'name' | 'path'> = {
  currentPhase: 'idle' as Phase,
  completedPhases: [],
  interrupted: false,
  introSeen: false,
  buildIntroSeen: false,
};

export class ProjectManager {
  private appDataDir: string;
  private recentProjectsPath: string;

  constructor(appDataDir: string) {
    this.appDataDir = appDataDir;
    this.recentProjectsPath = path.join(appDataDir, RECENT_PROJECTS_FILE);
  }

  createProject(name: string, projectPath: string): void {
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const officeDir = path.join(projectPath, OFFICE_DIR);
    if (!fs.existsSync(officeDir)) {
      fs.mkdirSync(officeDir, { recursive: true });
    }

    const configPath = path.join(officeDir, CONFIG_FILE);
    const initialState: ProjectState = {
      name,
      path: projectPath,
      currentPhase: 'idle',
      completedPhases: [],
      interrupted: false,
      introSeen: false,
      buildIntroSeen: false,
    };
    fs.writeFileSync(configPath, JSON.stringify(initialState, null, 2), 'utf-8');

    this.addToRecentProjects(name, projectPath, null);
  }

  openProject(projectPath: string): void {
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project directory does not exist: ${projectPath}`);
    }

    const state = this.getProjectState(projectPath);
    this.addToRecentProjects(state.name, projectPath, state.currentPhase === 'idle' ? null : state.currentPhase);
  }

  getRecentProjects(): ProjectInfo[] {
    const projects = this.readRecentProjects();
    return projects.sort((a, b) => b.lastOpened - a.lastOpened);
  }

  getProjectState(projectPath: string): ProjectState {
    const configPath = path.join(projectPath, OFFICE_DIR, CONFIG_FILE);
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw) as ProjectState;
      return {
        name: data.name ?? path.basename(projectPath),
        path: data.path ?? projectPath,
        currentPhase: data.currentPhase ?? 'idle',
        completedPhases: data.completedPhases ?? [],
        interrupted: data.interrupted ?? false,
        introSeen: data.introSeen ?? true,
        buildIntroSeen: data.buildIntroSeen ?? false,
      };
    } catch {
      return {
        name: path.basename(projectPath),
        path: projectPath,
        ...DEFAULT_STATE,
        introSeen: true,
        buildIntroSeen: false,
      };
    }
  }

  updateProjectState(projectPath: string, updates: Partial<ProjectState>): void {
    const existing = this.getProjectState(projectPath);
    const updated: ProjectState = { ...existing, ...updates };

    const officeDir = path.join(projectPath, OFFICE_DIR);
    if (!fs.existsSync(officeDir)) {
      fs.mkdirSync(officeDir, { recursive: true });
    }

    const configPath = path.join(officeDir, CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  private readRecentProjects(): ProjectInfo[] {
    try {
      const raw = fs.readFileSync(this.recentProjectsPath, 'utf-8');
      return JSON.parse(raw) as ProjectInfo[];
    } catch {
      return [];
    }
  }

  private writeRecentProjects(projects: ProjectInfo[]): void {
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
    fs.writeFileSync(this.recentProjectsPath, JSON.stringify(projects, null, 2), 'utf-8');
  }

  private addToRecentProjects(name: string, projectPath: string, lastPhase: Phase | null): void {
    const projects = this.readRecentProjects();
    const index = projects.findIndex(p => p.path === projectPath);
    const entry: ProjectInfo = {
      name,
      path: projectPath,
      lastPhase,
      lastOpened: Date.now(),
    };

    if (index !== -1) {
      projects[index] = entry;
    } else {
      projects.push(entry);
    }

    this.writeRecentProjects(projects);
  }
}
