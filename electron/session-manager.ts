import { EventEmitter } from 'events';
import { ToolAdapter, type AdapterConfig } from './adapters/types';
import type { AgentEvent, SessionInfo, SessionListItem } from '../shared/types';

export class SessionManager extends EventEmitter {
  private adapters: ToolAdapter[];
  private sessions: Map<string, SessionInfo> = new Map();
  private config: AdapterConfig | null = null;
  private adapterSessions: Map<ToolAdapter, SessionListItem[]> = new Map();

  constructor(adapters: ToolAdapter[]) {
    super();
    this.adapters = adapters;
  }

  async start(config: AdapterConfig): Promise<void> {
    this.config = config;
    for (const adapter of this.adapters) {
      adapter.on('agentEvent', (event: AgentEvent) => {
        this.handleAgentEvent(event);
      });
      adapter.on('sessionListUpdate', (sessions: SessionListItem[]) => {
        this.adapterSessions.set(adapter, sessions);
        const merged = Array.from(this.adapterSessions.values()).flat();
        this.emit('sessionListUpdate', merged);
      });
      const result = adapter.start(config);
      if (result instanceof Promise) {
        await result;
      }
    }
  }

  stop(): void {
    for (const adapter of this.adapters) {
      adapter.stop();
    }
    this.sessions.clear();
    this.adapterSessions.clear();
  }

  private handleAgentEvent(event: AgentEvent): void {
    if (event.type === 'agent:created') {
      this.sessions.set(event.agentId, {
        sessionId: event.agentId,
        agentRole: event.agentRole,
        source: event.source,
        startedAt: event.timestamp,
      });
    } else if (event.type === 'agent:closed') {
      this.sessions.delete(event.agentId);
    }
    this.emit('agentEvent', event);
  }

  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }
}