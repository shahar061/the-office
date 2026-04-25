import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { IPC_CHANNELS } from '../../shared/types';
import type { AppSettings, GitIdentity } from '../../shared/types';
import {
  settingsStore,
  projectManager,
  send,
} from './state';
import { GitManager } from '../project/git-manager';
import { writeRepoIdentity } from '../project/git-identity-apply';

const execFileAsync = promisify(execFile);

export function initSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async (): Promise<AppSettings> => {
    return settingsStore.get();
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, async (_event, patch: Partial<AppSettings>) => {
    const next = settingsStore.update(patch);
    if (patch.language !== undefined) {
      process.env.OFFICE_LANGUAGE = next.language;
    }
    send(IPC_CHANNELS.SETTINGS_UPDATED, next);
    return next;
  });

  ipcMain.handle(
    IPC_CHANNELS.ADD_GIT_IDENTITY,
    async (_event, identity: Omit<GitIdentity, 'id'>) => {
      const created = settingsStore.addIdentity(identity);
      send(IPC_CHANNELS.SETTINGS_UPDATED, settingsStore.get());
      return created;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GIT_IDENTITY,
    async (_event, id: string, patch: Partial<Omit<GitIdentity, 'id'>>) => {
      const updated = settingsStore.updateIdentity(id, patch);
      if (updated) send(IPC_CHANNELS.SETTINGS_UPDATED, settingsStore.get());
      return updated;
    },
  );

  ipcMain.handle(IPC_CHANNELS.DELETE_GIT_IDENTITY, async (_event, id: string) => {
    const result = settingsStore.deleteIdentity(id);
    if (result.ok) send(IPC_CHANNELS.SETTINGS_UPDATED, settingsStore.get());
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.SET_DEFAULT_GIT_IDENTITY, async (_event, id: string | null) => {
    settingsStore.setDefaultIdentity(id);
    send(IPC_CHANNELS.SETTINGS_UPDATED, settingsStore.get());
  });

  ipcMain.handle(
    IPC_CHANNELS.SET_PROJECT_GIT_IDENTITY,
    async (_event, projectPath: string, id: string | null) => {
      projectManager.updateProjectState(projectPath, { gitIdentityId: id });
      // Write-through to .git/config best-effort
      try {
        const state = projectManager.getProjectState(projectPath);
        const resolved = settingsStore.resolveIdentityForProject(state);
        const gm = new GitManager(projectPath);
        await writeRepoIdentity(gm.getSimpleGitInstance(), resolved);
      } catch (err) {
        console.warn('[SET_PROJECT_GIT_IDENTITY] write-through failed:', err);
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.IMPORT_GITCONFIG_IDENTITY, async () => {
    let name = '';
    let email = '';
    try {
      const result = await execFileAsync('git', ['config', '--global', '--get', 'user.name']);
      name = result.stdout.trim();
    } catch {
      // Not set — leave empty
    }
    try {
      const result = await execFileAsync('git', ['config', '--global', '--get', 'user.email']);
      email = result.stdout.trim();
    } catch {
      // Not set — leave empty
    }
    if (!name && !email) return null;
    return { name, email };
  });
}
