import Database from 'better-sqlite3';
import * as path from 'path';
import { ToolAdapter, type AdapterConfig } from './types';
import type { AgentEvent, AgentRole } from '../shared/types';

interface SessionRow {
  id: string;
  status: string;
  tool_name?: string;
  tool_id?: string;
}

const POLL_INTERVAL = 1000;
const MAX_CONSECUTIVE_FAILURES = 10;

export class OpenCodeAdapter extends ToolAdapter {
  private db: Database.Database | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private knownSessions: Map<string, string> = new Map();
  private failureCount = 0;

  start(config: AdapterConfig): void {
    const dbPath = path.join(config.projectDir, '.opencode', 'state.db');
    try {
      this.db = new Database(dbPath, { readonly: true });
      this.failureCount = 0;
    } catch {
      return;
    }

    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.db?.close();
    this.db = null;
    this.knownSessions.clear();
  }

  private poll(): void {
    if (!this.db) return;

    try {
      const rows = this.db.prepare('SELECT id, status, tool_name, tool_id FROM sessions').all() as SessionRow[];
      this.failureCount = 0;

      for (const row of rows) {
        this.processSessionRow(row);
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

  processSessionRow(row: SessionRow): void {
    const prevStatus = this.knownSessions.get(row.id);
    const role: AgentRole = 'freelancer';

    if (!prevStatus) {
      this.knownSessions.set(row.id, row.status);
      this.emitAgentEvent({
        agentId: row.id,
        agentRole: role,
        source: 'opencode',
        type: 'agent:created',
        timestamp: Date.now(),
      });
    }

    if (row.status === 'completed' || row.status === 'error') {
      this.emitAgentEvent({
        agentId: row.id,
        agentRole: role,
        source: 'opencode',
        type: 'agent:closed',
        timestamp: Date.now(),
      });
      this.knownSessions.delete(row.id);
      return;
    }

    if (row.tool_name && row.status === 'active') {
      this.emitAgentEvent({
        agentId: row.id,
        agentRole: role,
        source: 'opencode',
        type: 'agent:tool:start',
        toolName: row.tool_name,
        toolId: row.tool_id,
        timestamp: Date.now(),
      });
    }

    this.knownSessions.set(row.id, row.status);
  }
}