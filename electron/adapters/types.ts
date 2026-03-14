import { EventEmitter } from 'events';
import type { AgentEvent, AgentRole, SessionListItem } from '../../shared/types';

export * from '../../shared/types';

export interface AdapterConfig {
  projectDir: string;
}

export abstract class ToolAdapter extends EventEmitter {
  abstract start(config: AdapterConfig): void | Promise<void>;
  abstract stop(): void;
  dispatch?(prompt: string, agentRole: AgentRole): Promise<void>;

  protected emitAgentEvent(event: AgentEvent): void {
    this.emit('agentEvent', event);
  }

  protected emitSessionList(sessions: SessionListItem[]): void {
    this.emit('sessionListUpdate', sessions);
  }
}