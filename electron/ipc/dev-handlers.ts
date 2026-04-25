import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type { BuildConfig } from '../../shared/types';
import { ACT_MANIFEST } from '../../dev-jump/engine/act-manifest';
import type { JumpTarget } from '../../dev-jump/engine/types';

export interface DevJumpDeps {
  seed: (opts: { target: JumpTarget; mode: 'real' | 'mock'; projectDir?: string }) => { projectDir: string };
  abortActivePhase: () => void;
  reloadProjectState: (projectDir: string) => void;
  startImagine: (userIdea: string, resume: boolean) => Promise<void>;
  startWarroom: () => Promise<void>;
  startBuild: (config: BuildConfig) => Promise<void>;
}

/**
 * Pure implementation used by both the real IPC handler and the unit tests.
 */
export async function handleDevJump(
  req: { target: string; mode: 'real' | 'mock' },
  deps: DevJumpDeps,
): Promise<{ projectDir: string }> {
  const target = req.target as JumpTarget;
  const act = ACT_MANIFEST[target];
  if (!act || !act.target) {
    throw new Error(`Unknown dev-jump target: ${target}`);
  }

  deps.abortActivePhase();

  const { projectDir } = deps.seed({ target, mode: req.mode, projectDir: undefined });

  deps.reloadProjectState(projectDir);

  if (act.phase === 'imagine') {
    await deps.startImagine('', true);
  } else if (act.phase === 'warroom') {
    await deps.startWarroom();
  } else if (act.phase === 'build') {
    await deps.startBuild({ modelPreset: 'default', retryLimit: 1, permissionMode: 'auto-all' });
  }

  return { projectDir };
}

/**
 * Register the IPC channel only when OFFICE_DEV=1.
 */
export function initDevHandlers(deps: DevJumpDeps): void {
  if (process.env.OFFICE_DEV !== '1') return;

  ipcMain.handle(IPC_CHANNELS.DEV_JUMP, async (_evt, req: { target: string; mode: 'real' | 'mock' }) => {
    return handleDevJump(req, deps);
  });
}
