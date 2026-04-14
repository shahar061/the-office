import type {
  AgentEvent,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
  CharacterSnapshot,
  Phase,
} from '../../shared/types';
import { classifyActivity } from '../../shared/core/event-reducer';

const CHAT_TAIL_CAP = 50;

export class SnapshotBuilder {
  private sessionId = 'current';
  private desktopName: string;
  private phase: Phase = 'idle';
  private startedAt: number = Date.now();
  private activeAgentId: string | null = null;
  private characters = new Map<string, CharacterSnapshot>();
  private chatTail: ChatMessage[] = [];
  private sessionEnded = false;

  constructor(desktopName: string) {
    this.desktopName = desktopName;
  }

  getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      desktopName: this.desktopName,
      phase: this.phase,
      startedAt: this.startedAt,
      activeAgentId: this.activeAgentId,
      characters: Array.from(this.characters.values()),
      chatTail: [...this.chatTail],
      sessionEnded: this.sessionEnded,
    };
  }

  ingestEvent(event: AgentEvent): void {
    const result = classifyActivity(event);
    if (result === null) return;

    if ('removed' in result) {
      this.characters.delete(event.agentId);
      if (this.activeAgentId === event.agentId) this.activeAgentId = null;
      return;
    }

    this.ensureCharacter(event);
    const c = this.characters.get(event.agentId);
    if (!c) return;
    c.activity = result.activity;
    this.characters.set(event.agentId, c);

    if (event.type === 'agent:tool:start') {
      this.activeAgentId = event.agentId;
    }
  }

  ingestChat(messages: ChatMessage[]): void {
    this.chatTail = [...this.chatTail, ...messages];
    if (this.chatTail.length > CHAT_TAIL_CAP) {
      this.chatTail = this.chatTail.slice(this.chatTail.length - CHAT_TAIL_CAP);
    }
  }

  applyStatePatch(patch: SessionStatePatch): void {
    switch (patch.kind) {
      case 'phase': this.phase = patch.phase; break;
      case 'activeAgent': this.activeAgentId = patch.agentId; break;
      case 'ended': this.sessionEnded = patch.ended; break;
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.activeAgentId = null;
    this.characters.clear();
    this.chatTail = [];
    this.sessionEnded = false;
    this.startedAt = Date.now();
  }

  private ensureCharacter(event: AgentEvent): void {
    if (!this.characters.has(event.agentId)) {
      this.characters.set(event.agentId, {
        agentId: event.agentId,
        agentRole: event.agentRole,
        x: 0,
        y: 0,
        activity: 'idle',
      });
    }
  }
}
