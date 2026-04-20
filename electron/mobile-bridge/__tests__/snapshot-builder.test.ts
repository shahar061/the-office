import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotBuilder } from '../snapshot-builder';
import type { AgentEvent, ChatMessage } from '../../../shared/types';

function mkEvent(partial: Partial<AgentEvent>): AgentEvent {
  return {
    agentId: 'a1',
    agentRole: 'ceo',
    source: 'sdk',
    type: 'agent:created',
    timestamp: 1,
    ...partial,
  };
}

function mkChat(id: string, text: string): ChatMessage {
  return { id, role: 'agent', text, timestamp: 1 };
}

describe('SnapshotBuilder', () => {
  let builder: SnapshotBuilder;

  beforeEach(() => {
    builder = new SnapshotBuilder('Test Desktop');
  });

  it('starts with empty snapshot', () => {
    const s = builder.getSnapshot();
    expect(s.desktopName).toBe('Test Desktop');
    expect(s.characters).toEqual([]);
    expect(s.chatTail).toEqual([]);
    expect(s.phase).toBe('idle');
    expect(s.activeAgentId).toBeNull();
  });

  it('adds a character on agent:created', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1', agentRole: 'ceo' }));
    const chars = builder.getSnapshot().characters;
    expect(chars).toHaveLength(1);
    expect(chars[0].agentId).toBe('a1');
    expect(chars[0].agentRole).toBe('ceo');
  });

  it('sets activity to reading on agent:tool:start with Read', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1' }));
    expect(builder.getSnapshot().characters[0].activity).toBe('reading');
  });

  it('sets activity to typing on agent:tool:start with Write', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:start', agentId: 'a1', toolName: 'Write', toolId: 't2' }));
    expect(builder.getSnapshot().characters[0].activity).toBe('typing');
  });

  it('returns to idle on agent:tool:done', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:done', agentId: 'a1', toolId: 't1' }));
    expect(builder.getSnapshot().characters[0].activity).toBe('idle');
  });

  it('sets waiting on agent:waiting', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:waiting', agentId: 'a1' }));
    expect(builder.getSnapshot().characters[0].activity).toBe('waiting');
  });

  it('removes a character on agent:closed', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:closed', agentId: 'a1' }));
    expect(builder.getSnapshot().characters).toHaveLength(0);
  });

  it('tracks activeAgentId from most recent tool:start', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a2' }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:start', agentId: 'a2', toolName: 'Read', toolId: 't1' }));
    expect(builder.getSnapshot().activeAgentId).toBe('a2');
  });

  it('chat tail caps at 50 messages', () => {
    for (let i = 0; i < 60; i++) builder.ingestChat([mkChat(`m${i}`, `hi${i}`)]);
    const tail = builder.getSnapshot().chatTail;
    expect(tail).toHaveLength(50);
    expect(tail[0].id).toBe('m10');
    expect(tail[49].id).toBe('m59');
  });

  it('applies state patches', () => {
    builder.applyStatePatch({ kind: 'phase', phase: 'warroom' });
    expect(builder.getSnapshot().phase).toBe('warroom');
    builder.applyStatePatch({ kind: 'ended', ended: true });
    expect(builder.getSnapshot().sessionEnded).toBe(true);
  });

  // ── currentTool preservation ──

  it('populates currentTool on agent:tool:start with target extracted from message', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1',
      message: '/Users/x/foo.ts',
    }));
    expect(builder.getSnapshot().characters[0].currentTool).toEqual({
      toolName: 'Read', target: 'foo.ts',
    });
  });

  it('clears currentTool on agent:tool:done', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1', message: 'foo.ts',
    }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:done', agentId: 'a1', toolId: 't1' }));
    expect(builder.getSnapshot().characters[0].currentTool).toBeUndefined();
  });

  it('clears currentTool on agent:tool:clear', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'Read', toolId: 't1', message: 'foo.ts',
    }));
    builder.ingestEvent(mkEvent({ type: 'agent:tool:clear', agentId: 'a1' }));
    expect(builder.getSnapshot().characters[0].currentTool).toBeUndefined();
  });

  it('does NOT populate currentTool for AskUserQuestion tool', () => {
    builder.ingestEvent(mkEvent({ type: 'agent:created', agentId: 'a1' }));
    builder.ingestEvent(mkEvent({
      type: 'agent:tool:start', agentId: 'a1', toolName: 'AskUserQuestion', toolId: 't1',
    }));
    expect(builder.getSnapshot().characters[0].currentTool).toBeUndefined();
  });

  // ── chat phase stamping ──

  it('stamps phase on each appended chat message from the current snapshot phase', () => {
    builder.applyStatePatch({ kind: 'phase', phase: 'warroom' });
    builder.ingestChat([mkChat('m1', 'hi')]);
    expect(builder.getSnapshot().chatTail[0].phase).toBe('warroom');
  });

  it('preserves an already-tagged phase on incoming chat', () => {
    builder.applyStatePatch({ kind: 'phase', phase: 'warroom' });
    builder.ingestChat([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1, phase: 'imagine' }]);
    expect(builder.getSnapshot().chatTail[0].phase).toBe('imagine');
  });

  // ── waiting state ──

  it('setWaiting populates and clears snapshot.waiting', () => {
    const payload = { sessionId: 's1', agentRole: 'ceo' as const, questions: [] };
    builder.setWaiting(payload);
    expect(builder.getSnapshot().waiting).toEqual(payload);
    builder.setWaiting(null);
    expect(builder.getSnapshot().waiting).toBeUndefined();
  });

  it('applyStatePatch waiting sets and clears snapshot.waiting', () => {
    const payload = { sessionId: 's1', agentRole: 'ceo' as const, questions: [] };
    builder.applyStatePatch({ kind: 'waiting', payload });
    expect(builder.getSnapshot().waiting).toEqual(payload);
    builder.applyStatePatch({ kind: 'waiting', payload: null });
    expect(builder.getSnapshot().waiting).toBeUndefined();
  });

  it('reset clears waiting', () => {
    builder.setWaiting({ sessionId: 's1', agentRole: 'ceo', questions: [] });
    builder.reset();
    expect(builder.getSnapshot().waiting).toBeUndefined();
  });
});
