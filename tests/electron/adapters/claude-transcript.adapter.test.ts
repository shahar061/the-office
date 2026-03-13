import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeTranscriptAdapter } from '../../../electron/adapters/claude-transcript.adapter';
import type { AgentEvent } from '../../../shared/types';

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn(),
  })),
}));

describe('ClaudeCodeTranscriptAdapter', () => {
  let adapter: ClaudeCodeTranscriptAdapter;
  const events: AgentEvent[] = [];

  beforeEach(() => {
    adapter = new ClaudeCodeTranscriptAdapter();
    adapter.on('agentEvent', (e: AgentEvent) => events.push(e));
    events.length = 0;
  });

  afterEach(() => {
    adapter.stop();
  });

  it('parses a tool_use JSONL line into agent:tool:start event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Read',
          id: 'tool-abc',
        }],
      },
    });
    adapter.processLine(line, 'test-session');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:tool:start');
    expect(events[0].toolName).toBe('Read');
    expect(events[0].toolId).toBe('tool-abc');
  });

  it('parses a tool_result JSONL line into agent:tool:done event', () => {
    adapter.processLine(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Read', id: 'tool-abc' }] },
    }), 'test-session');

    adapter.processLine(JSON.stringify({
      type: 'tool_result',
      tool_use_id: 'tool-abc',
    }), 'test-session');

    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('agent:tool:done');
  });

  it('skips invalid JSON lines without crashing', () => {
    adapter.processLine('not valid json', 'test-session');
    expect(events).toHaveLength(0);
  });

  it('emits agent:message for text content blocks', () => {
    adapter.processLine(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello from assistant' }],
      },
    }), 'test-session');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent:message');
    expect(events[0].message).toBe('Hello from assistant');
  });
});