import os from 'os';
import path from 'path';

export class UnsafeProjectDirError extends Error {
  constructor(attempted: string, safe: string) {
    super(
      `Refusing to operate on ${attempted}. Dev-jump only works on ${safe}. ` +
      `Pass { force: true } if you really mean it.`,
    );
    this.name = 'UnsafeProjectDirError';
  }
}

export function safeProjectDir(): string {
  return path.join(os.homedir(), 'office-dev-project');
}

export function resolveSafeProjectDir(
  input?: string,
  opts: { force?: boolean } = {},
): string {
  const safe = safeProjectDir();
  if (input === undefined) return safe;

  const resolved = path.resolve(input);
  if (opts.force) return resolved;
  if (resolved !== safe) throw new UnsafeProjectDirError(resolved, safe);
  return resolved;
}
