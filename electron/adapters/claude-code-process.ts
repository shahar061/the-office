import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import type { AgentEvent, AgentRole } from '../../shared/types';

export class ClaudeCodeProcess extends EventEmitter {
  private process: ChildProcess;
  private rl: readline.Interface;
  private _sessionId: string | null = null;
  private agentRole: AgentRole;
  private lastToolNames: Map<string, string> = new Map();

  get sessionId(): string | null {
    return this._sessionId;
  }

  constructor(directory: string, agentRole: AgentRole = 'freelancer', resumeSessionId?: string) {
    super();
    this.agentRole = agentRole;

    const args = ['--output-format', 'stream-json'];
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    this.process = spawn('claude', args, {
      cwd: directory,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.rl = readline.createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line) => this.parseLine(line));

    this.process.stderr?.on('data', (data: Buffer) => {
      console.warn('[ClaudeCodeProcess stderr]', data.toString().trim());
    });

    this.process.on('error', (err) => {
      this.emitEvent('agent:closed');
      this.emit('error', err);
    });

    this.process.on('exit', (code) => {
      this.emitEvent('agent:closed');
      this.emit('exit', code);
    });

    // Note: pre-init events use 'pending-claude' as agentId and are NOT replayed
    // once the real session_id is known. The init event is expected to arrive
    // before any assistant events, so this is a non-issue in practice.
  }

  sendPrompt(prompt: string): void {
    this.process.stdin!.write(prompt + '\n', (err) => {
      if (err) {
        this.emitEvent('agent:closed');
        this.emit('error', err);
      }
    });
  }

  kill(): void {
    this.process.kill('SIGTERM');
  }

  // Public so tests can call directly (bypasses async readline layer)
  parseLine(line: string): void {
    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }

    if (data.type === 'system' && data.subtype === 'init') {
      this._sessionId = data.session_id;
      this.emitEvent('agent:created');
      return;
    }

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

    if (data.type === 'tool_result') {
      const toolName = this.lastToolNames.get(data.tool_use_id);
      this.emitEvent('agent:tool:done', { toolName, toolId: data.tool_use_id });
      return;
    }

    if (data.type === 'result') {
      if (data.total_cost != null) {
        this.emitEvent('session:cost:update', { cost: data.total_cost });
      }
      this.emitEvent('agent:waiting');
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
