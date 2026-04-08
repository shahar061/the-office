import { describe, it, expect, beforeEach } from 'vitest';
import { StatsCollector } from '../../electron/stats/stats-collector';
import type { AgentEvent } from '../../shared/types';

let mockDirCounter = 0;
function freshMockDir(): string {
  return '/tmp/stats-test-' + Date.now() + '-' + (mockDirCounter++);
}

function costEvent(agentRole: string, cost: number, inputTokens: number, outputTokens: number): AgentEvent {
  return {
    agentId: 'test',
    agentRole: agentRole as any,
    source: 'sdk',
    type: 'session:cost:update',
    cost,
    tokens: inputTokens + outputTokens,
    timestamp: Date.now(),
  };
}

function createdEvent(agentRole: string): AgentEvent {
  return {
    agentId: 'test',
    agentRole: agentRole as any,
    source: 'sdk',
    type: 'agent:created',
    isTopLevel: true,
    timestamp: Date.now(),
  };
}

function closedEvent(agentRole: string): AgentEvent {
  return {
    agentId: 'test',
    agentRole: agentRole as any,
    source: 'sdk',
    type: 'agent:closed',
    timestamp: Date.now(),
  };
}

describe('StatsCollector', () => {
  let collector: StatsCollector;

  beforeEach(() => {
    collector = new StatsCollector(freshMockDir());
  });

  it('tracks session cost totals from cost events', () => {
    collector.onAgentEvent(costEvent('ceo', 0.15, 1000, 500));
    collector.onAgentEvent(costEvent('product-manager', 0.10, 800, 400));

    const state = collector.getState();
    expect(state.session.totalCost).toBeCloseTo(0.25);
  });

  it('tracks per-agent cost and tokens', () => {
    collector.onAgentEvent(costEvent('ceo', 0.15, 1000, 500));
    collector.onAgentEvent(costEvent('ceo', 0.05, 200, 100));

    const state = collector.getState();
    expect(state.agents['ceo']).toBeDefined();
    expect(state.agents['ceo'].cost).toBeCloseTo(0.20);
  });

  it('tracks phase timing', () => {
    collector.onPhaseStart('imagine');
    const state = collector.getState();
    expect(state.phases['imagine']).toBeDefined();
    expect(state.phases['imagine'].startedAt).toBeGreaterThan(0);
    expect(state.phases['imagine'].completedAt).toBeNull();

    collector.onPhaseComplete('imagine');
    const state2 = collector.getState();
    expect(state2.phases['imagine'].completedAt).toBeGreaterThan(0);
  });

  it('tracks act timing within phases', () => {
    collector.onPhaseStart('imagine');
    collector.onActStart('imagine', 'CEO Discovery');
    collector.onActComplete('imagine', 'CEO Discovery');
    collector.onActStart('imagine', 'PM Definition');

    const state = collector.getState();
    expect(state.phases['imagine'].acts).toHaveLength(2);
    expect(state.phases['imagine'].acts[0].name).toBe('CEO Discovery');
    expect(state.phases['imagine'].acts[0].completedAt).not.toBeNull();
    expect(state.phases['imagine'].acts[1].name).toBe('PM Definition');
    expect(state.phases['imagine'].acts[1].completedAt).toBeNull();
  });

  it('attributes cost to current phase', () => {
    collector.onPhaseStart('imagine');
    collector.onAgentEvent(costEvent('ceo', 0.15, 1000, 500));

    const state = collector.getState();
    expect(state.phases['imagine'].cost).toBeCloseTo(0.15);
  });

  it('tracks agent phase participation', () => {
    collector.onPhaseStart('imagine');
    collector.onAgentEvent(createdEvent('ceo'));
    collector.onAgentEvent(closedEvent('ceo'));
    collector.onPhaseComplete('imagine');

    collector.onPhaseStart('warroom');
    collector.onAgentEvent(createdEvent('project-manager'));
    collector.onAgentEvent(closedEvent('project-manager'));

    const state = collector.getState();
    expect(state.agents['ceo'].phases).toEqual(['imagine']);
    expect(state.agents['project-manager'].phases).toEqual(['warroom']);
  });

  it('stores rate limit info', () => {
    collector.onRateLimit({
      status: 'allowed_warning',
      utilization: 0.82,
      rateLimitType: 'five_hour',
      resetsAt: Date.now() + 3600000,
      isUsingOverage: false,
      overageStatus: undefined,
    });

    const state = collector.getState();
    expect(state.rateLimit).not.toBeNull();
    expect(state.rateLimit!.status).toBe('allowed_warning');
    expect(state.rateLimit!.utilization).toBe(0.82);
  });

  it('returns empty state initially', () => {
    const state = collector.getState();
    expect(state.session.totalCost).toBe(0);
    expect(Object.keys(state.phases)).toHaveLength(0);
    expect(Object.keys(state.agents)).toHaveLength(0);
    expect(state.rateLimit).toBeNull();
  });
});
