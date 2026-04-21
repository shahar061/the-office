import type {
  AgentEvent,
  AgentWaitingPayload,
  ArchivedRun,
  ChatMessage,
  SessionSnapshot,
  SessionStatePatch,
  CharacterSnapshot,
  Phase,
} from '../../shared/types';
import { classifyActivity } from '../../shared/core/event-reducer';
import { extractToolTarget } from '../../shared/core/extract-tool-target';

export interface ScopeActive {
  active: true;
  sessionId: string;
  projectName: string;
  projectRoot?: string;
}
export interface ScopeInactive {
  active: false;
}
export type Scope = ScopeActive | ScopeInactive;

export class SnapshotBuilder {
  private sessionActive = false;
  private sessionId: string | null = null;
  private projectName: string | undefined;
  private projectRoot: string | undefined;
  private desktopName: string;
  private phase: Phase = 'idle';
  private startedAt: number = Date.now();
  private activeAgentId: string | null = null;
  private characters = new Map<string, CharacterSnapshot>();
  private chatTail: ChatMessage[] = [];
  private sessionEnded = false;
  private waiting: AgentWaitingPayload | null = null;
  private archivedRuns: ArchivedRun[] = [];

  constructor(desktopName: string) {
    this.desktopName = desktopName;
  }

  getSnapshot(): SessionSnapshot {
    const snap: SessionSnapshot = {
      sessionActive: this.sessionActive,
      sessionId: this.sessionId,
      desktopName: this.desktopName,
      phase: this.phase,
      startedAt: this.startedAt,
      activeAgentId: this.activeAgentId,
      characters: Array.from(this.characters.values()),
      chatTail: [...this.chatTail],
      sessionEnded: this.sessionEnded,
    };
    if (this.projectName !== undefined) snap.projectName = this.projectName;
    if (this.projectRoot !== undefined) snap.projectRoot = this.projectRoot;
    if (this.waiting) snap.waiting = this.waiting;
    if (this.archivedRuns.length > 0) snap.archivedRuns = [...this.archivedRuns];
    return snap;
  }

  /**
   * Single entry point for scope transitions. Always resets volatile state
   * (chat tail, archived runs, waiting, characters, phase, etc.) so the next
   * snapshot the phone receives hydrates from a clean slate.
   */
  setScope(scope: Scope): void {
    // Reset volatile state regardless of direction — this is the "fresh
    // reconnect" contract from the spec.
    this.phase = 'idle';
    this.activeAgentId = null;
    this.characters.clear();
    this.chatTail = [];
    this.sessionEnded = false;
    this.waiting = null;
    this.archivedRuns = [];
    this.startedAt = Date.now();

    if (scope.active) {
      this.sessionActive = true;
      this.sessionId = scope.sessionId;
      this.projectName = scope.projectName;
      this.projectRoot = scope.projectRoot;
    } else {
      this.sessionActive = false;
      this.sessionId = null;
      this.projectName = undefined;
      this.projectRoot = undefined;
    }
  }

  isActive(): boolean {
    return this.sessionActive;
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

  setArchivedRuns(runs: ArchivedRun[]): void {
    this.archivedRuns = runs;
  }

  ingestChat(messages: ChatMessage[]): void {
    const stamped = messages.map((m) => ({ ...m, phase: m.phase ?? this.phase }));
    this.chatTail = [...this.chatTail, ...stamped];
    // CAP REMOVED — tail grows with the current run; older runs live in archivedRuns
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
      case 'archivedRuns':
        this.archivedRuns = patch.runs;
        if (patch.resetTail) this.chatTail = [];
        break;
    }
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
