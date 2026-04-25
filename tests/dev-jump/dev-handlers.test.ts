import { describe, it, expect, vi, beforeEach } from 'vitest';

// dev-handlers.ts now imports from ./state, which calls app.getPath() at
// module-evaluation time. Mock electron before the import to prevent the crash.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/dev-handlers-test' },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() },
}));

import { handleDevJump, type DevJumpDeps } from '../../electron/ipc/dev-handlers';

function makeDeps(overrides: Partial<DevJumpDeps> = {}): DevJumpDeps & {
  _seed: ReturnType<typeof vi.fn>;
  _startImagine: ReturnType<typeof vi.fn>;
  _startWarroom: ReturnType<typeof vi.fn>;
  _startBuild: ReturnType<typeof vi.fn>;
  _abort: ReturnType<typeof vi.fn>;
  _reload: ReturnType<typeof vi.fn>;
} {
  const _seed = vi.fn().mockReturnValue({ projectDir: '/tmp/dj' });
  const _startImagine = vi.fn().mockResolvedValue(undefined);
  const _startWarroom = vi.fn().mockResolvedValue(undefined);
  const _startBuild = vi.fn().mockResolvedValue(undefined);
  const _abort = vi.fn();
  const _reload = vi.fn();
  return {
    seed: _seed as unknown as DevJumpDeps['seed'],
    abortActivePhase: _abort,
    reloadProjectState: _reload,
    startImagine: _startImagine as unknown as DevJumpDeps['startImagine'],
    startWarroom: _startWarroom as unknown as DevJumpDeps['startWarroom'],
    startBuild: _startBuild as unknown as DevJumpDeps['startBuild'],
    _seed, _startImagine, _startWarroom, _startBuild, _abort, _reload,
    ...overrides,
  };
}

describe('handleDevJump', () => {
  it('calls seed + reloadProject + startImagine for imagine targets', async () => {
    const deps = makeDeps();
    await handleDevJump({ target: 'imagine.ui-ux-expert', mode: 'real' }, deps);

    expect(deps._seed).toHaveBeenCalledWith({ target: 'imagine.ui-ux-expert', mode: 'real', projectDir: undefined });
    expect(deps._abort).toHaveBeenCalledOnce();
    expect(deps._reload).toHaveBeenCalledWith('/tmp/dj');
    expect(deps._startImagine).toHaveBeenCalledWith('', true);
    expect(deps._startWarroom).not.toHaveBeenCalled();
    expect(deps._startBuild).not.toHaveBeenCalled();
  });

  it('calls startWarroom for warroom targets', async () => {
    const deps = makeDeps();
    await handleDevJump({ target: 'warroom.project-manager', mode: 'real' }, deps);
    expect(deps._startWarroom).toHaveBeenCalledOnce();
  });

  it('calls startBuild for build targets with auto-all permission', async () => {
    const deps = makeDeps();
    await handleDevJump({ target: 'build.engineering', mode: 'real' }, deps);
    expect(deps._startBuild).toHaveBeenCalledWith(expect.objectContaining({ permissionMode: 'auto-all' }));
  });
});
