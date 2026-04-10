import { randomUUID } from 'crypto';
import type { BuildConfig, PermissionRequest, AgentRole } from '../../shared/types';

export interface PermissionResult {
  behavior: 'allow' | 'deny';
  updatedInput?: Record<string, unknown>;
  message?: string;
}

const SAFE_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch']);

interface PendingRequest {
  resolve: (result: PermissionResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PermissionHandler {
  private mode: BuildConfig['permissionMode'];
  private sendRequest: (req: PermissionRequest) => void;
  private timeoutMs: number;
  private pending = new Map<string, PendingRequest>();
  private denyPatterns: RegExp[];

  public lastRequestId: string | undefined;

  constructor(
    mode: BuildConfig['permissionMode'],
    sendRequest: (req: PermissionRequest) => void,
    timeoutMs: number = 5 * 60 * 1000,
    denyPatterns: RegExp[] = [],
  ) {
    this.mode = mode;
    this.sendRequest = sendRequest;
    this.timeoutMs = timeoutMs;
    this.denyPatterns = denyPatterns;
  }

  setMode(mode: BuildConfig['permissionMode']): void {
    this.mode = mode;
  }

  async handleToolRequest(
    toolName: string,
    input: Record<string, unknown>,
    agentRole: AgentRole,
  ): Promise<PermissionResult> {
    // Deny-list check (Bash commands only)
    if (toolName === 'Bash' && this.denyPatterns.length > 0) {
      const cmd = String(input.command ?? '');
      for (const pattern of this.denyPatterns) {
        if (pattern.test(cmd)) {
          return {
            behavior: 'deny',
            message:
              'Git write operations are managed by The Office — do not run git commands directly. You may use `git status`, `git diff`, `git log`, and `git show` for inspection.',
          };
        }
      }
    }

    if (this.mode === 'auto-all') {
      return { behavior: 'allow' };
    }

    if (this.mode === 'auto-safe' && SAFE_TOOLS.has(toolName)) {
      return { behavior: 'allow' };
    }

    // Prompt user (auto-safe with unsafe tool, or ask mode)
    return this.prompt(toolName, input, agentRole);
  }

  resolvePermission(requestId: string, approved: boolean): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve(
      approved
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: 'User denied permission' },
    );
  }

  private prompt(
    toolName: string,
    input: Record<string, unknown>,
    agentRole: AgentRole,
  ): Promise<PermissionResult> {
    const requestId = randomUUID();
    this.lastRequestId = requestId;

    return new Promise<PermissionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ behavior: 'deny', message: 'Permission request timed out' });
      }, this.timeoutMs);

      this.pending.set(requestId, { resolve, timer });

      const req: PermissionRequest = { requestId, agentRole, toolName, input };
      this.sendRequest(req);
    });
  }
}
