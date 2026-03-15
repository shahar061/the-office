import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { ToolAdapter, type AdapterConfig } from './types';
import type { AgentEvent, AgentRole, SessionListItem } from '../shared/types';

export class ClaudeCodeTranscriptAdapter extends ToolAdapter {
  private watcher: chokidar.FSWatcher | null = null;
  private filePositions: Map<string, number> = new Map();
  private sessionRoles: Map<string, AgentRole> = new Map();
  private knownSessions: Map<string, { filePath: string; createdAt: number }> = new Map();

  start(config: AdapterConfig): void {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    console.log('[ClaudeTranscriptAdapter] Watching for transcript files in:', claudeDir);
    this.watcher = chokidar.watch(`${claudeDir}/**/*.jsonl`, {
      ignoreInitial: false,
      persistent: true,
    });

    this.watcher.on('add', (filePath: string) => this.handleNewFile(filePath));
    this.watcher.on('change', (filePath: string) => this.handleFileChange(filePath));
    console.log('[ClaudeTranscriptAdapter] Watcher started successfully');
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    this.filePositions.clear();
    this.sessionRoles.clear();
    this.knownSessions.clear();
  }

  private getSessionId(filePath: string): string {
    return path.basename(filePath, '.jsonl');
  }

  private buildSessionList(): void {
    const sessions: SessionListItem[] = [];
    for (const [sessionId, info] of this.knownSessions) {
      try {
        const stats = fs.statSync(info.filePath);
        const ageMs = Date.now() - stats.mtimeMs;
        let status: SessionListItem['status'] = 'stale';
        if (ageMs < 30_000) status = 'busy';
        else if (ageMs < 600_000) status = 'waiting';

        const projectDir = path.basename(path.dirname(info.filePath));
        const directory = projectDir.startsWith('-')
          ? projectDir.slice(1).replace(/-/g, '/')
          : projectDir;

        sessions.push({
          sessionId,
          title: sessionId.slice(0, 8),
          directory: '/' + directory,
          projectName: directory.split('/').pop() || directory,
          status,
          lastUpdated: stats.mtimeMs,
          createdAt: info.createdAt,
          source: 'claude-code',
        });
      } catch { /* file may have been deleted */ }
    }
    this.emitSessionList(sessions);
  }

  private async handleNewFile(filePath: string): Promise<void> {
    const sessionId = this.getSessionId(filePath);
    this.filePositions.set(filePath, 0);
    try {
      const stats = fs.statSync(filePath);
      this.knownSessions.set(sessionId, { filePath, createdAt: stats.birthtimeMs });
    } catch { /* ignore */ }
    this.emitAgentEvent({
      agentId: sessionId,
      agentRole: this.sessionRoles.get(sessionId) ?? 'freelancer',
      source: 'transcript',
      type: 'agent:created',
      timestamp: Date.now(),
    });
    this.buildSessionList();
    await this.readNewLines(filePath);
  }

  private async handleFileChange(filePath: string): Promise<void> {
    await this.readNewLines(filePath);
    this.buildSessionList();
  }

  private async readNewLines(filePath: string): Promise<void> {
    const startPos = this.filePositions.get(filePath) ?? 0;
    const stats = fs.statSync(filePath);
    if (stats.size <= startPos) return;

    const stream = fs.createReadStream(filePath, { start: startPos, encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream });
    const sessionId = this.getSessionId(filePath);

    for await (const line of rl) {
      this.processLine(line, sessionId);
    }

    this.filePositions.set(filePath, stats.size);
  }

  processLine(line: string, sessionId: string): void {
    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }

    const role = this.sessionRoles.get(sessionId) ?? 'freelancer';

    if (data.type === 'assistant' && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === 'tool_use') {
          this.emitAgentEvent({
            agentId: sessionId,
            agentRole: role,
            source: 'transcript',
            type: 'agent:tool:start',
            toolName: block.name,
            toolId: block.id,
            timestamp: Date.now(),
          });
        } else if (block.type === 'text' && block.text) {
          this.emitAgentEvent({
            agentId: sessionId,
            agentRole: role,
            source: 'transcript',
            type: 'agent:message',
            message: block.text,
            timestamp: Date.now(),
          });
        }
      }
    }

    if (data.type === 'tool_result') {
      this.emitAgentEvent({
        agentId: sessionId,
        agentRole: role,
        source: 'transcript',
        type: 'agent:tool:done',
        toolId: data.tool_use_id,
        timestamp: Date.now(),
      });
    }
  }
}
