import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import type { AgentEvent, AgentRole } from '../../shared/types';

/**
 * Manages Claude Code sessions by spawning `claude -p` for each prompt.
 * Uses --resume to maintain conversation continuity across invocations.
 *
 * Why not a persistent subprocess? The `claude` CLI buffers stdout when
 * it detects a pipe (not a TTY), so piped-stdout mode produces zero bytes.
 * Print mode (`-p`) flushes output and exits, which works with piped stdio.
 */
export class ClaudeCodeProcess extends EventEmitter {
  private activeProcess: ChildProcess | null = null;
  private _sessionId: string | null = null;
  private directory: string;
  private agentRole: AgentRole;
  private lastToolNames: Map<string, string> = new Map();

  get sessionId(): string | null {
    return this._sessionId;
  }

  constructor(directory: string, agentRole: AgentRole = 'freelancer', resumeSessionId?: string) {
    super();
    this.directory = directory;
    this.agentRole = agentRole;
    if (resumeSessionId) {
      this._sessionId = resumeSessionId;
    }
  }

  sendPrompt(prompt: string): void {
    // Kill any still-running previous invocation
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill('SIGTERM');
    }

    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (this._sessionId) {
      args.push('--resume', this._sessionId);
    }

    const child = spawn('claude', args, {
      cwd: this.directory,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.activeProcess = child;

    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', (line) => this.parseLine(line));

    child.stderr?.on('data', (data: Buffer) => {
      console.warn('[ClaudeCodeProcess stderr]', data.toString().trim());
    });

    child.on('error', (err) => {
      this.activeProcess = null;
      rl.close();
      this.emitEvent('agent:closed');
      this.emit('error', err);
    });

    child.on('exit', (code) => {
      this.activeProcess = null;
      rl.close();
      // In print mode, exit code 0 is normal (response complete).
      // Emit agent:waiting to signal the session is idle and ready for next prompt.
      if (code === 0) {
        this.emitEvent('agent:waiting');
      } else {
        this.emitEvent('agent:closed');
        this.emit('exit', code);
      }
    });
  }

  kill(): void {
    if (this.activeProcess && !this.activeProcess.killed) {
      this.activeProcess.kill('SIGTERM');
    }
    this.activeProcess = null;
  }

  // Public so tests can call directly (bypasses async readline layer)
  parseLine(line: string): void {
    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }

    // Init event → extract session_id
    if (data.type === 'system' && data.subtype === 'init') {
      this._sessionId = data.session_id;
      this.emitEvent('agent:created');
      return;
    }

    // Assistant message → iterate content blocks
    if (data.type === 'assistant' && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === 'tool_use') {
          this.lastToolNames.set(block.id, block.name);
          this.emitEvent('agent:tool:start', { toolName: block.name, toolId: block.id });
        } else if (block.type === 'text' && block.text) {
          this.emitEvent('agent:message', { message: block.text });
        }
      }
      return;
    }

    // Tool result (top-level, not nested in assistant message)
    if (data.type === 'tool_result') {
      const toolName = this.lastToolNames.get(data.tool_use_id);
      this.lastToolNames.delete(data.tool_use_id);
      this.emitEvent('agent:tool:done', { toolName, toolId: data.tool_use_id });
      return;
    }

    // Result → cost update
    if (data.type === 'result') {
      if (data.total_cost_usd != null) {
        this.emitEvent('session:cost:update', { cost: data.total_cost_usd });
      }
    }
  }

  private emitEvent(
    type: AgentEvent['type'],
    extra: Partial<AgentEvent> = {},
  ): void {
    const event: AgentEvent = {
      agentId: this._sessionId ?? 'pending-claude',
      agentRole: this.agentRole,
      source: 'claude-process',
      type,
      timestamp: Date.now(),
      ...extra,
    };
    this.emit('agentEvent', event);
  }
}
