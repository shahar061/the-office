import type { AgentEvent, ChatMessage, MobileMessage, SessionStatePatch } from '../../shared/types';
import { SnapshotBuilder } from './snapshot-builder';

export interface Broadcaster {
  broadcastToAuthenticated(msg: MobileMessage): void;
}

export class EventForwarder {
  constructor(
    private readonly snapshots: SnapshotBuilder,
    private readonly broadcaster: Broadcaster,
  ) {}

  onAgentEvent = (event: AgentEvent): void => {
    try {
      this.snapshots.ingestEvent(event);
      this.broadcaster.broadcastToAuthenticated({ type: 'event', v: 1, event });
    } catch (err) {
      console.warn('[mobile-bridge] onAgentEvent failed:', err);
    }
  };

  onChat = (messages: ChatMessage[]): void => {
    try {
      this.snapshots.ingestChat(messages);
      this.broadcaster.broadcastToAuthenticated({ type: 'chat', v: 1, messages });
    } catch (err) {
      console.warn('[mobile-bridge] onChat failed:', err);
    }
  };

  onStatePatch = (patch: SessionStatePatch): void => {
    try {
      this.snapshots.applyStatePatch(patch);
      this.broadcaster.broadcastToAuthenticated({ type: 'state', v: 1, patch });
    } catch (err) {
      console.warn('[mobile-bridge] onStatePatch failed:', err);
    }
  };
}
