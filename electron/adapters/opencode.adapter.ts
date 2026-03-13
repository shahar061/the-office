import Database from 'better-sqlite3';
import * as os from 'os';
import * as path from 'path';
import { ToolAdapter, type AdapterConfig } from './types';
import type { AgentEvent } from '../../shared/types';

const POLL_INTERVAL = 1000;
const MAX_CONSECUTIVE_FAILURES = 10;

interface PartRow {
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

interface SessionRow {
  id: string;
  title: string;
  directory: string;
  time_updated: number;
}

export class OpenCodeAdapter extends ToolAdapter {
  private db: Database.Database | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private projectDir = '';
  private failureCount = 0;
  private dbPath: string;

  private knownSessions = new Set<string>();
  private watermarks = new Map<string, number>();
  // sessionId -> (callID -> last seen status)
  private toolStates = new Map<string, Map<string, string>>();

  constructor(dbPath?: string) {
    super();
    this.dbPath = dbPath ?? path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  }

  start(config: AdapterConfig): void {
    this.projectDir = config.projectDir;
    try {
      this.db = new Database(this.dbPath, { readonly: true });
      this.failureCount = 0;
      this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
      this.poll();
    } catch {
      return;
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.db?.close();
    this.db = null;
    this.knownSessions.clear();
    this.watermarks.clear();
    this.toolStates.clear();
  }

  private poll(): void {
    if (!this.db) return;

    try {
      const sessions = this.db.prepare(
        'SELECT id, title, directory, time_updated FROM session WHERE directory = ?'
      ).all(this.projectDir) as SessionRow[];

      this.failureCount = 0;
      const currentIds = new Set(sessions.map(s => s.id));

      // Detect removed/archived sessions
      for (const id of this.knownSessions) {
        if (!currentIds.has(id)) {
          this.emitAgentEvent({
            agentId: id,
            agentRole: 'freelancer',
            source: 'opencode',
            type: 'agent:closed',
            timestamp: Date.now(),
          });
          this.knownSessions.delete(id);
          this.watermarks.delete(id);
          this.toolStates.delete(id);
        }
      }

      for (const session of sessions) {
        // New session discovered
        if (!this.knownSessions.has(session.id)) {
          this.knownSessions.add(session.id);
          this.toolStates.set(session.id, new Map());
          this.emitAgentEvent({
            agentId: session.id,
            agentRole: 'freelancer',
            source: 'opencode',
            type: 'agent:created',
            message: session.title,
            timestamp: Date.now(),
          });
        }

        // Fetch parts updated since our last watermark
        const watermark = this.watermarks.get(session.id) ?? 0;
        const parts = this.db!.prepare(
          'SELECT id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? AND time_updated > ? ORDER BY time_updated ASC'
        ).all(session.id, watermark) as PartRow[];

        let maxUpdated = watermark;
        for (const part of parts) {
          this.processPart(session.id, part);
          if (part.time_updated > maxUpdated) maxUpdated = part.time_updated;
        }
        this.watermarks.set(session.id, maxUpdated);
      }
    } catch {
      this.failureCount++;
      if (this.failureCount >= MAX_CONSECUTIVE_FAILURES) {
        this.emitAgentEvent({
          agentId: 'opencode-bridge',
          agentRole: 'freelancer',
          source: 'opencode',
          type: 'agent:closed',
          message: 'OpenCode connection lost after repeated failures',
          timestamp: Date.now(),
        });
        this.stop();
      }
    }
  }

  private processPart(sessionId: string, part: PartRow): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(part.data);
    } catch {
      return;
    }

    switch (data.type) {
      case 'tool':
        this.processToolPart(sessionId, data, part.time_updated);
        break;
      case 'step-finish':
        this.processStepFinish(sessionId, data, part.time_updated);
        break;
    }
  }

  private processToolPart(sessionId: string, data: Record<string, unknown>, timestamp: number): void {
    const callID = data.callID as string;
    const toolName = data.tool as string;
    const state = data.state as { status: string } | undefined;
    if (!callID || !state) return;

    const tools = this.toolStates.get(sessionId)!;
    const prev = tools.get(callID);
    const next = state.status;

    if (prev === next) return;
    tools.set(callID, next);

    if (next === 'running') {
      this.emitAgentEvent({
        agentId: sessionId, agentRole: 'freelancer', source: 'opencode',
        type: 'agent:tool:start', toolName, toolId: callID, timestamp,
      });
    } else if (next === 'completed' || next === 'error') {
      if (!prev) {
        // Missed the running state (poll gap) — emit start first
        this.emitAgentEvent({
          agentId: sessionId, agentRole: 'freelancer', source: 'opencode',
          type: 'agent:tool:start', toolName, toolId: callID, timestamp,
        });
      }
      this.emitAgentEvent({
        agentId: sessionId, agentRole: 'freelancer', source: 'opencode',
        type: 'agent:tool:done', toolName, toolId: callID, timestamp,
      });
    }
  }

  private processStepFinish(sessionId: string, data: Record<string, unknown>, timestamp: number): void {
    const reason = data.reason as string | undefined;
    const cost = data.cost as number | undefined;
    const tokens = data.tokens as { total: number } | undefined;

    if (cost != null) {
      this.emitAgentEvent({
        agentId: sessionId, agentRole: 'freelancer', source: 'opencode',
        type: 'session:cost:update', cost, tokens: tokens?.total, timestamp,
      });
    }

    if (reason === 'stop') {
      this.emitAgentEvent({
        agentId: sessionId, agentRole: 'freelancer', source: 'opencode',
        type: 'agent:waiting', timestamp,
      });
    }
  }
}
