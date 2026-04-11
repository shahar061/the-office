import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { AppSettings, GitIdentity, ProjectState } from '../../shared/types';

const SETTINGS_FILE = 'settings.json';

interface ProjectManagerLike {
  getRecentProjects(): Array<{ path: string }>;
  getProjectState(projectPath: string): ProjectState;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultModelPreset: 'default',
  defaultPermissionMode: 'auto-safe',
  maxParallelTLs: 4,
  gitIdentities: [],
  defaultGitIdentityId: null,
  gitPreferences: { includeOfficeStateInRepo: false },
};

export class SettingsStore {
  private filePath: string;
  private projectManager: ProjectManagerLike;
  private settings: AppSettings;

  constructor(userDataDir: string, projectManager: ProjectManagerLike) {
    this.filePath = path.join(userDataDir, SETTINGS_FILE);
    this.projectManager = projectManager;
    this.settings = this.load();
  }

  get(): AppSettings {
    return { ...this.settings, gitIdentities: [...this.settings.gitIdentities] };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...patch };
    this.save();
    return this.get();
  }

  addIdentity(identity: Omit<GitIdentity, 'id'>): GitIdentity {
    const created: GitIdentity = { id: randomUUID(), ...identity };
    this.settings = {
      ...this.settings,
      gitIdentities: [...this.settings.gitIdentities, created],
    };
    this.save();
    return { ...created };
  }

  updateIdentity(id: string, patch: Partial<Omit<GitIdentity, 'id'>>): GitIdentity | null {
    const idx = this.settings.gitIdentities.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const updated: GitIdentity = { ...this.settings.gitIdentities[idx], ...patch, id };
    const next = [...this.settings.gitIdentities];
    next[idx] = updated;
    this.settings = { ...this.settings, gitIdentities: next };
    this.save();
    return { ...updated };
  }

  deleteIdentity(id: string): { ok: boolean; affectedProjects: number } {
    const exists = this.settings.gitIdentities.some((i) => i.id === id);
    if (!exists) return { ok: false, affectedProjects: 0 };

    // Count affected projects before mutation
    let affectedProjects = 0;
    try {
      const projects = this.projectManager.getRecentProjects();
      for (const p of projects) {
        try {
          const state = this.projectManager.getProjectState(p.path);
          if (state.gitIdentityId === id) affectedProjects++;
        } catch {
          // Ignore unreadable project states
        }
      }
    } catch {
      // Ignore — affectedProjects stays 0
    }

    const nextIdentities = this.settings.gitIdentities.filter((i) => i.id !== id);
    const nextDefault =
      this.settings.defaultGitIdentityId === id ? null : this.settings.defaultGitIdentityId;
    this.settings = {
      ...this.settings,
      gitIdentities: nextIdentities,
      defaultGitIdentityId: nextDefault,
    };
    this.save();
    return { ok: true, affectedProjects };
  }

  setDefaultIdentity(id: string | null): void {
    if (id !== null && !this.settings.gitIdentities.some((i) => i.id === id)) {
      // Unknown id — no-op
      return;
    }
    this.settings = { ...this.settings, defaultGitIdentityId: id };
    this.save();
  }

  resolveIdentityForProject(projectState: Pick<ProjectState, 'gitIdentityId'>): GitIdentity | null {
    if (projectState.gitIdentityId) {
      const match = this.settings.gitIdentities.find((i) => i.id === projectState.gitIdentityId);
      if (match) return { ...match };
    }
    if (this.settings.defaultGitIdentityId) {
      const match = this.settings.gitIdentities.find((i) => i.id === this.settings.defaultGitIdentityId);
      if (match) return { ...match };
    }
    return null;
  }

  private load(): AppSettings {
    try {
      if (!fs.existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        defaultModelPreset: parsed.defaultModelPreset ?? DEFAULT_SETTINGS.defaultModelPreset,
        defaultPermissionMode: parsed.defaultPermissionMode ?? DEFAULT_SETTINGS.defaultPermissionMode,
        maxParallelTLs: parsed.maxParallelTLs ?? DEFAULT_SETTINGS.maxParallelTLs,
        windowBounds: parsed.windowBounds,
        gitIdentities: Array.isArray(parsed.gitIdentities) ? parsed.gitIdentities : [],
        defaultGitIdentityId: parsed.defaultGitIdentityId ?? null,
        gitPreferences: parsed.gitPreferences ?? DEFAULT_SETTINGS.gitPreferences,
      };
    } catch (err) {
      console.warn('[SettingsStore] Corrupted settings.json, using defaults:', err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Atomic write: tmp + rename
    const tmpPath = this.filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }
}
