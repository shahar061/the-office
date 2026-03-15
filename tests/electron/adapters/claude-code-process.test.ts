import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import type { AgentEvent } from '../../../shared/types';

const mockProcess = Object.assign(new EventEmitter(), {
  stdout: new Readable({ read() {} }),
  stderr: new Readable({ read() {} }),
  stdin: new Writable({ write(_chunk, _enc, cb) { cb(); } }),
  pid: 12345,
  kill: vi.fn(),
});

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockProcess),
}));

import { ClaudeCodeProcess } from '../../../electron/adapters/claude-code-process';
import { spawn } from 'child_process';

describe('ClaudeCodeProcess', () => {
  let proc: ClaudeCodeProcess;
  let events: AgentEvent[];

  beforeEach(() => {
    events = [];
    mockProcess.removeAllListeners();
    Object.assign(mockProcess, {
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      stdin: new Writable({ write(_chunk, _enc, cb) { cb(); } }),
    });
    mockProcess.kill.mockClear();
    vi.mocked(spawn).mockClear().mockReturnValue(mockProcess as any);
  });

  function createProc(dir = '/tmp/test', resumeSessionId?: string) {
    proc = new ClaudeCodeProcess(dir, 'freelancer', resumeSessionId);
    proc.on('agentEvent', (e: AgentEvent) => events.push(e));
    return proc;
  }

  it('spawns claude with --output-format stream-json', () => {
    createProc('/my/project');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['--output-format', 'stream-json'],
      expect.objectContaining({ cwd: '/my/project' }),
    );
  });

  it('spawns with --resume when resumeSessionId is provided', () => {
    createProc('/my/project', 'ses-abc-123');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['--output-format', 'stream-json', '--resume', 'ses-abc-123'],
      expect.objectContaining({ cwd: '/my/project' }),
    );
  });

  it('emits agent:created on init event and exposes sessionId', () => {
    createProc();
    proc.parseLine(JSON.stringify({
      type: 'system', subtype: 'init', session_id: 'ses-xyz',
    }));
    expect(proc.sessionId).toBe('ses-xyz');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'agent:created',
      agentId: 'ses-xyz',
      agentRole: 'freelancer',
      source: 'claude-process',
    });
  });

  it('emits agent:tool:start for tool_use content blocks', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    proc.parseLine(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Read', id: 'tool-1' }] },
    }));
    const toolEvent = events.find(e => e.type === 'agent:tool:start');
    expect(toolEvent).toBeDefined();
    expect(toolEvent!.toolName).toBe('Read');
    expect(toolEvent!.toolId).toBe('tool-1');
    expect(toolEvent!.agentId).toBe('ses-1');
  });

  it('emits agent:tool:done for top-level tool_result events', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    proc.parseLine(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Edit', id: 'tool-2' }] },
    }));
    proc.parseLine(JSON.stringify({ type: 'tool_result', tool_use_id: 'tool-2' }));
    const doneEvent = events.find(e => e.type === 'agent:tool:done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.toolName).toBe('Edit');
    expect(doneEvent!.toolId).toBe('tool-2');
  });

  it('emits agent:message for text content blocks', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    proc.parseLine(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Working on it...' }] },
    }));
    const msgEvent = events.find(e => e.type === 'agent:message');
    expect(msgEvent).toBeDefined();
    expect(msgEvent!.message).toBe('Working on it...');
  });

  it('emits session:cost:update and agent:waiting on result event', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    proc.parseLine(JSON.stringify({ type: 'result', total_cost: 0.042, total_duration_ms: 5000 }));
    const costEvent = events.find(e => e.type === 'session:cost:update');
    expect(costEvent).toBeDefined();
    expect(costEvent!.cost).toBe(0.042);
    const waitEvent = events.find(e => e.type === 'agent:waiting');
    expect(waitEvent).toBeDefined();
  });

  it('writes prompt to stdin via sendPrompt()', () => {
    createProc();
    const writeSpy = vi.spyOn(mockProcess.stdin, 'write');
    proc.sendPrompt('Fix the bug');
    expect(writeSpy).toHaveBeenCalledWith('Fix the bug\n', expect.any(Function));
  });

  it('emits agent:closed on process exit', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    mockProcess.emit('exit', 0, null);
    const closedEvent = events.find(e => e.type === 'agent:closed');
    expect(closedEvent).toBeDefined();
    expect(closedEvent!.agentId).toBe('ses-1');
  });

  it('kill() sends SIGTERM to the process', () => {
    createProc();
    proc.kill();
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('skips invalid JSON lines without crashing', () => {
    createProc();
    proc.parseLine('not valid json');
    proc.parseLine('{"type":"system","subtype":"init","session_id":"ses-1"}');
    expect(proc.sessionId).toBe('ses-1');
  });

  it('handles multiple content blocks in a single assistant message', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    proc.parseLine(JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me read that file.' },
          { type: 'tool_use', name: 'Read', id: 'tool-5' },
        ],
      },
    }));
    expect(events.filter(e => e.type === 'agent:message')).toHaveLength(1);
    expect(events.filter(e => e.type === 'agent:tool:start')).toHaveLength(1);
  });
});
