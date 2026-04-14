/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { installBridge, handleRawMessage } from '../bridge';
import { useSessionStore as useMobileSessionStore } from '../../../shared/stores/session.store';
import type { MobileMessage } from '../../shared/types';

describe('bridge', () => {
  beforeEach(() => {
    useMobileSessionStore.setState({ snapshot: null, pendingEvents: [] });
  });

  it('dispatches snapshot messages', () => {
    const msg: MobileMessage = {
      type: 'snapshot', v: 1,
      snapshot: {
        sessionId: 's', desktopName: 'test', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    handleRawMessage(JSON.stringify(msg));
    expect(useMobileSessionStore.getState().snapshot).not.toBeNull();
  });

  it('dispatches event messages', () => {
    handleRawMessage(JSON.stringify({
      type: 'event', v: 1,
      event: { agentId: 'a', agentRole: 'ceo', source: 'sdk', type: 'agent:created', timestamp: 1 },
    } as MobileMessage));
    expect(useMobileSessionStore.getState().pendingEvents).toHaveLength(1);
  });

  it('dispatches chat messages only when a snapshot exists', () => {
    handleRawMessage(JSON.stringify({
      type: 'chat', v: 1, messages: [{ id: 'm1', role: 'agent', text: 'hi', timestamp: 1 }],
    } as MobileMessage));
    // No snapshot yet — chat should be dropped silently
    expect(useMobileSessionStore.getState().snapshot).toBeNull();
  });

  it('ignores malformed JSON without throwing', () => {
    expect(() => handleRawMessage('not json')).not.toThrow();
  });

  it('ignores messages with wrong v field', () => {
    handleRawMessage(JSON.stringify({ type: 'event', v: 2, event: {} }));
    expect(useMobileSessionStore.getState().pendingEvents).toHaveLength(0);
  });

  it('ignores non-string raw inputs', () => {
    expect(() => handleRawMessage(42)).not.toThrow();
    expect(() => handleRawMessage(null)).not.toThrow();
    expect(() => handleRawMessage({ type: 'event' })).not.toThrow();
    expect(useMobileSessionStore.getState().pendingEvents).toHaveLength(0);
  });

  it('installBridge wires up window.addEventListener', () => {
    installBridge();
    const msg = {
      type: 'snapshot', v: 1,
      snapshot: {
        sessionId: 's', desktopName: 'via-window', phase: 'idle', startedAt: 1,
        activeAgentId: null, characters: [], chatTail: [], sessionEnded: false,
      },
    };
    const event = new MessageEvent('message', { data: JSON.stringify(msg) });
    window.dispatchEvent(event);
    expect(useMobileSessionStore.getState().snapshot?.desktopName).toBe('via-window');
  });
});
