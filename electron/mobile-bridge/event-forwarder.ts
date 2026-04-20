import type {
  AgentEvent,
  AgentWaitingPayload,
  ArchivedRun,
  ChatMessage,
  MobileMessageV2,
  SessionStatePatch,
} from '../../shared/types';
import { SnapshotBuilder } from './snapshot-builder';

export interface Broadcaster {
  broadcastToAuthenticated(msg: MobileMessageV2): void;
}

export class EventForwarder {
  constructor(
    private readonly snapshots: SnapshotBuilder,
    private readonly broadcaster: Broadcaster,
  ) {}

  onAgentEvent = (event: AgentEvent): void => {
    try {
      this.snapshots.ingestEvent(event);
      this.broadcaster.broadcastToAuthenticated({ type: 'event', v: 2, event });
    } catch (err) {
      console.warn('[mobile-bridge] onAgentEvent failed:', err);
    }
  };

  onChat = (messages: ChatMessage[]): void => {
    try {
      this.snapshots.ingestChat(messages);
      this.broadcaster.broadcastToAuthenticated({ type: 'chatFeed', v: 2, messages });
    } catch (err) {
      console.warn('[mobile-bridge] onChat failed:', err);
    }
  };

  onStatePatch = (patch: SessionStatePatch): void => {
    try {
      this.snapshots.applyStatePatch(patch);
      this.broadcaster.broadcastToAuthenticated({ type: 'state', v: 2, patch });
    } catch (err) {
      console.warn('[mobile-bridge] onStatePatch failed:', err);
    }
  };

  /**
   * Start / clear the waiting indicator. Called from desktop IPC:
   *   - `handleAgentWaiting` → `onAgentWaiting(payload)`
   *   - resolve / reject sites → `onAgentWaiting(null)`
   * Propagates to mobile via the same patch channel as `onStatePatch`.
   */
  onAgentWaiting = (payload: AgentWaitingPayload | null): void => {
    try {
      this.snapshots.setWaiting(payload);
      this.broadcaster.broadcastToAuthenticated({
        type: 'state', v: 2, patch: { kind: 'waiting', payload },
      });
    } catch (err) {
      console.warn('[mobile-bridge] onAgentWaiting failed:', err);
    }
  };

  onArchivedRuns = (runs: ArchivedRun[], resetTail: boolean): void => {
    try {
      this.snapshots.applyStatePatch({ kind: 'archivedRuns', runs, resetTail });
      this.broadcaster.broadcastToAuthenticated({
        type: 'state', v: 2, patch: { kind: 'archivedRuns', runs, resetTail },
      });
    } catch (err) {
      console.warn('[mobile-bridge] onArchivedRuns failed:', err);
    }
  };
}
