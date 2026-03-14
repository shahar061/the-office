import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { ToolAdapter, type AdapterConfig } from './types';
import type { AgentEvent, SessionListItem } from '../../shared/types';

const POLL_INTERVAL = 1000;
const MAX_CONSECUTIVE_FAILURES = 10;
const ACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

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
  project_id: string;
  time_created: number;
  time_updated: number;
}

export class OpenCodeAdapter extends ToolAdapter {
  private db: SqlJsDatabase | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private projectDir = '';
  private failureCount = 0;
  private dbPath: string;
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

  private knownSessions = new Set<string>();
  private watermarks = new Map<string, number>();
  private toolStates = new Map<string, Map<string, string>>();
  private statusCache = new Map<string, { timeUpdated: number; status: 'busy' | 'waiting' | 'stale' }>();

  constructor(dbPath?: string) {
    super();
    this.dbPath = dbPath ?? path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  }

  async start(config: AdapterConfig): Promise<void> {
    this.projectDir = config.projectDir;
    console.log('[OpenCodeAdapter] Starting with dbPath:', this.dbPath);
    
    try {
      this.SQL = await initSqlJs();
      
      if (!fs.existsSync(this.dbPath)) {
        console.error('[OpenCodeAdapter] Database file not found:', this.dbPath);
        return;
      }
      
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      
      this.failureCount = 0;
      this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL);
      this.poll();
      console.log('[OpenCodeAdapter] Successfully connected to OpenCode database');
    } catch (err) {
      console.error('[OpenCodeAdapter] Failed to connect:', err);
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
    this.SQL = null;
    this.knownSessions.clear();
    this.watermarks.clear();
    this.toolStates.clear();
    this.statusCache.clear();
  }

  private poll(): void {
    if (!this.db || !this.SQL) return;

    try {
      // Re-open the database to get latest changes
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db.close();
      this.db = new this.SQL.Database(fileBuffer);
      
      const sessions = this.db.exec(
        `SELECT id, title, directory, project_id, time_created, time_updated FROM session WHERE parent_id IS NULL AND time_archived IS NULL ORDER BY time_updated DESC`
      );

      if (sessions.length === 0 || sessions[0].values.length === 0) {
        this.failureCount = 0;
        // Emit empty session list when no sessions
        this.emitSessionList([]);
        return;
      }

      const sessionRows: SessionRow[] = sessions[0].values.map(row => ({
        id: row[0] as string,
        title: row[1] as string,
        directory: row[2] as string,
        project_id: row[3] as string,
        time_created: row[4] as number,
        time_updated: row[5] as number,
      }));

      // Build and emit session list with activity status
      const sessionList: SessionListItem[] = sessionRows.map(session => ({
        sessionId: session.id,
        title: session.title,
        directory: session.directory,
        projectName: path.basename(session.directory) || session.directory,
        status: this.getSessionStatus(session.id, session.time_updated),
        lastUpdated: session.time_updated,
        createdAt: session.time_created,
      }));
      this.emitSessionList(sessionList);

      this.failureCount = 0;
      const currentIds = new Set(sessionRows.map(s => s.id));

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
          this.statusCache.delete(id);
        }
      }

      for (const session of sessionRows) {
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
        const partsResult = this.db.exec(
          `SELECT id, session_id, time_created, time_updated, data FROM part WHERE session_id = '${session.id.replace(/'/g, "''")}' AND time_updated > ${watermark} ORDER BY time_updated ASC`
        );

        if (partsResult.length > 0) {
          const parts: PartRow[] = partsResult[0].values.map(row => ({
            id: row[0] as string,
            session_id: row[1] as string,
            time_created: row[2] as number,
            time_updated: row[3] as number,
            data: row[4] as string,
          }));

          let maxUpdated = watermark;
          for (const part of parts) {
            this.processPart(session.id, part);
            if (part.time_updated > maxUpdated) maxUpdated = part.time_updated;
          }
          this.watermarks.set(session.id, maxUpdated);
        }
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

  private getSessionStatus(sessionId: string, sessionTimeUpdated: number): 'busy' | 'waiting' | 'stale' {
    if (!this.db) return 'stale';

    // Use cached status if session hasn't changed
    const cached = this.statusCache.get(sessionId);
    if (cached && cached.timeUpdated === sessionTimeUpdated) return cached.status;

    const stmt = this.db.prepare(
      'SELECT data, time_updated FROM part WHERE session_id = ? ORDER BY time_updated DESC LIMIT 1'
    );
    stmt.bind([sessionId]);

    let status: 'busy' | 'waiting' | 'stale' = 'stale';
    if (stmt.step()) {
      const [data, timeUpdated] = stmt.get() as [string, number];
      try {
        const parsed: Record<string, unknown> = JSON.parse(data);
        if (parsed.type === 'step-start') status = 'busy';
        else if (parsed.type === 'step-finish') {
          if (parsed.reason === 'tool-calls') status = 'busy';
          else if (parsed.reason === 'stop' && Date.now() - timeUpdated < ACTIVITY_TIMEOUT) status = 'waiting';
        }
      } catch { /* stale */ }
    }
    stmt.free();

    this.statusCache.set(sessionId, { timeUpdated: sessionTimeUpdated, status });
    return status;
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
