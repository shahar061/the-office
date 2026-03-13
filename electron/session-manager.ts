import { EventEmitter } from 'events';
import { ToolAdapter, type AdapterConfig } from './adapters/types';
import type { AgentEvent, SessionInfo } from '../shared/types';

export class SessionManager extends EventEmitter {
  private adapters: ToolAdapter[];
  private sessions: Map<string, SessionInfo> = new Map();
  private config: AdapterConfig | null = null;

  constructor(adapters: ToolAdapter[]) {
    super();
    this.adapters = adapters;
  }

  start(config: AdapterConfig): void {
    this.config = config;
    for (const adapter of this.adapters) {
      adapter.on('agentEvent', (event: AgentEvent) => {
        this.handleAgentEvent(event);
      });
      adapter.start(config);
    }
  }

  stop(): void {
    for (const adapter of this.adapters) {
      adapter.stop();
    }
    this.sessions.clear();
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