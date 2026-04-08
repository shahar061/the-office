import fs from 'fs';
import path from 'path';
import type { AgentEvent, Phase, StatsState, RateLimitState, PhaseStats, AgentStats } from '../../shared/types';

const STATS_FILE = 'stats.json';
const OFFICE_DIR = '.the-office';

function emptySession(): StatsState['session'] {
  return {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    startedAt: Date.now(),
  };
}

function emptyAgentStats(): AgentStats {
  return {
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    timeActiveMs: 0,
    tasksCompleted: 0,
    phases: [],
  };
}

export class StatsCollector {
  private projectDir: string;
  private rateLimit: RateLimitState | null = null;
  private session: StatsState['session'];
  private phases: Record<string, PhaseStats> = {};
  private agents: Record<string, AgentStats> = {};
  private currentPhase: Phase | null = null;
  private agentStartTimes: Map<string, number> = new Map();
  private dirty = false;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.session = emptySession();
    this.load();
  }

  // ── Phase lifecycle ──

  onPhaseStart(phase: Phase): void {
    this.currentPhase = phase;
    if (!this.phases[phase]) {
      this.phases[phase] = {
        startedAt: Date.now(),
        completedAt: null,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        acts: [],
      };
    } else {
      // Restart — update start time but keep accumulated cost/tokens
      this.phases[phase].startedAt = Date.now();
      this.phases[phase].completedAt = null;
    }
    this.dirty = true;
  }

  onPhaseComplete(phase: Phase): void {
    if (this.phases[phase]) {
      this.phases[phase].completedAt = Date.now();
    }
    if (this.currentPhase === phase) {
      this.currentPhase = null;
    }
    this.dirty = true;
    this.flush();
  }

  // ── Act lifecycle ──

  onActStart(phase: Phase, actName: string): void {
    if (!this.phases[phase]) return;
    this.phases[phase].acts.push({
      name: actName,
      startedAt: Date.now(),
      completedAt: null,
      cost: 0,
      tokens: 0,
    });
    this.dirty = true;
  }

  onActComplete(phase: Phase, actName: string): void {
    if (!this.phases[phase]) return;
    const act = this.phases[phase].acts.find(a => a.name === actName && a.completedAt === null);
    if (act) {
      act.completedAt = Date.now();
    }
    this.dirty = true;
  }

  // ── Agent events ──

  onAgentEvent(event: AgentEvent): void {
    if (event.type === 'session:cost:update') {
      const cost = event.cost ?? 0;
      const tokens = event.tokens ?? 0;
      const inputTokens = Math.round(tokens * 0.7);
      const outputTokens = tokens - inputTokens;

      // Session totals
      this.session.totalCost += cost;
      this.session.totalInputTokens += inputTokens;
      this.session.totalOutputTokens += outputTokens;

      // Per-agent
      const agent = this.ensureAgent(event.agentRole);
      agent.cost += cost;
      agent.inputTokens += inputTokens;
      agent.outputTokens += outputTokens;

      // Per-phase
      if (this.currentPhase && this.phases[this.currentPhase]) {
        this.phases[this.currentPhase].cost += cost;
        this.phases[this.currentPhase].inputTokens += inputTokens;
        this.phases[this.currentPhase].outputTokens += outputTokens;

        // Per-act (attribute to latest open act)
        const acts = this.phases[this.currentPhase].acts;
        const currentAct = acts.findLast(a => a.completedAt === null) ?? acts[acts.length - 1];
        if (currentAct) {
          currentAct.cost += cost;
          currentAct.tokens += tokens;
        }
      }

      this.dirty = true;
    }

    if (event.type === 'agent:created' && event.isTopLevel) {
      this.agentStartTimes.set(event.agentRole, Date.now());
      const agent = this.ensureAgent(event.agentRole);
      if (this.currentPhase && !agent.phases.includes(this.currentPhase)) {
        agent.phases.push(this.currentPhase);
      }
      this.dirty = true;
    }

    if (event.type === 'agent:closed') {
      const startTime = this.agentStartTimes.get(event.agentRole);
      if (startTime) {
        const agent = this.ensureAgent(event.agentRole);
        agent.timeActiveMs += Date.now() - startTime;
        this.agentStartTimes.delete(event.agentRole);
      }
      this.dirty = true;
    }
  }

  // ── Rate limit ──

  onRateLimit(info: {
    status: 'allowed' | 'allowed_warning' | 'rejected';
    utilization?: number;
    rateLimitType?: string;
    resetsAt?: number;
    isUsingOverage?: boolean;
    overageStatus?: string;
  }): void {
    this.rateLimit = {
      status: info.status,
      utilization: info.utilization ?? 0,
      rateLimitType: info.rateLimitType ?? 'unknown',
      resetsAt: info.resetsAt ?? null,
      isUsingOverage: info.isUsingOverage ?? false,
      overageStatus: info.overageStatus ?? null,
    };
    this.dirty = true;
  }

  // ── Snapshot ──

  getState(): StatsState {
    return {
      rateLimit: this.rateLimit,
      session: { ...this.session },
      phases: JSON.parse(JSON.stringify(this.phases)),
      agents: JSON.parse(JSON.stringify(this.agents)),
    };
  }

  // ── Persistence ──

  flush(): void {
    if (!this.dirty) return;
    try {
      const dir = path.join(this.projectDir, OFFICE_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, STATS_FILE);
      const state = this.getState();
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
      this.dirty = false;
    } catch (err) {
      console.error('[StatsCollector] Failed to flush:', err);
    }
  }

  load(): void {
    try {
      const filePath = path.join(this.projectDir, OFFICE_DIR, STATS_FILE);
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf-8');
      const state = JSON.parse(raw) as StatsState;
      if (state.session) this.session = state.session;
      if (state.phases) this.phases = state.phases;
      if (state.agents) this.agents = state.agents;
      if (state.rateLimit) this.rateLimit = state.rateLimit;
    } catch {
      // Corrupted file — start fresh
    }
  }

  // ── Helpers ──

  private ensureAgent(role: string): AgentStats {
    if (!this.agents[role]) {
      this.agents[role] = emptyAgentStats();
    }
    return this.agents[role];
  }
}
