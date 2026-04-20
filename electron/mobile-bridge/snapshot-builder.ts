import type {
  AgentEvent,
  AgentWaitingPayload,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
  CharacterSnapshot,
  Phase,
} from '../../shared/types';
import { classifyActivity } from '../../shared/core/event-reducer';
import { extractToolTarget } from '../../shared/core/extract-tool-target';

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
  private waiting: AgentWaitingPayload | null = null;

  constructor(desktopName: string) {
    this.desktopName = desktopName;
  }

  getSnapshot(): SessionSnapshot {
    const snap: SessionSnapshot = {
      sessionId: this.sessionId,
      desktopName: this.desktopName,
      phase: this.phase,
      startedAt: this.startedAt,
      activeAgentId: this.activeAgentId,
      characters: Array.from(this.characters.values()),
      chatTail: [...this.chatTail],
      sessionEnded: this.sessionEnded,
    };
    if (this.waiting) snap.waiting = this.waiting;
    return snap;
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

    // Preserve / clear currentTool based on tool lifecycle. AskUserQuestion
    // is filtered because it's the mechanism behind the waiting indicator,
    // not a user-visible "running a tool" action.
    if (event.type === 'agent:tool:start' && event.toolName !== 'AskUserQuestion') {
      c.currentTool = {
        toolName: event.toolName ?? 'Tool',
        target: extractToolTarget(event) || undefined,
      };
    } else if (
      event.type === 'agent:tool:done' ||
      event.type === 'agent:tool:clear'
    ) {
      c.currentTool = undefined;
    }

    this.characters.set(event.agentId, c);

    if (event.type === 'agent:tool:start') {
      this.activeAgentId = event.agentId;
    }
  }

  ingestChat(messages: ChatMessage[]): void {
    const stamped = messages.map((m) => ({ ...m, phase: m.phase ?? this.phase }));
    this.chatTail = [...this.chatTail, ...stamped];
    if (this.chatTail.length > CHAT_TAIL_CAP) {
      this.chatTail = this.chatTail.slice(this.chatTail.length - CHAT_TAIL_CAP);
    }
  }

  setWaiting(payload: AgentWaitingPayload | null): void {
    this.waiting = payload;
  }

  applyStatePatch(patch: SessionStatePatch): void {
    switch (patch.kind) {
      case 'phase': this.phase = patch.phase; break;
      case 'activeAgent': this.activeAgentId = patch.agentId; break;
      case 'ended': this.sessionEnded = patch.ended; break;
      case 'waiting': this.waiting = patch.payload; break;
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.activeAgentId = null;
    this.characters.clear();
    this.chatTail = [];
    this.sessionEnded = false;
    this.waiting = null;
    this.startedAt = Date.now();
  }

  private ensureCharacter(event: AgentEvent): void {
    if (!this.characters.has(event.agentId)) {
      this.characters.set(event.agentId, {
        agentId: event.agentId,
        agentRole: event.agentRole,
        activity: 'idle',
      });
    }
  }
}
