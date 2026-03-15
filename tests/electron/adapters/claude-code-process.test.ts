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
  killed: false,
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
      killed: false,
    });
    mockProcess.kill.mockClear();
    vi.mocked(spawn).mockClear().mockReturnValue(mockProcess as any);
  });

  function createProc(dir = '/tmp/test', resumeSessionId?: string) {
    proc = new ClaudeCodeProcess(dir, 'freelancer', resumeSessionId);
    proc.on('agentEvent', (e: AgentEvent) => events.push(e));
    return proc;
  }

  // --- parseLine tests (unit tests for JSONL parsing) ---

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

  it('emits session:cost:update on result event with total_cost_usd', () => {
    createProc();
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-1' }));
    proc.parseLine(JSON.stringify({ type: 'result', total_cost_usd: 0.042 }));
    const costEvent = events.find(e => e.type === 'session:cost:update');
    expect(costEvent).toBeDefined();
    expect(costEvent!.cost).toBe(0.042);
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

  // --- sendPrompt tests ---

  it('spawns claude -p with stream-json verbose on sendPrompt', () => {
    createProc('/my/project');
    proc.sendPrompt('Fix the bug');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['-p', 'Fix the bug', '--output-format', 'stream-json', '--verbose'],
      expect.objectContaining({ cwd: '/my/project' }),
    );
  });

  it('includes --resume with sessionId on subsequent prompts', () => {
    createProc('/my/project');
    // Simulate first prompt setting sessionId via init
    proc.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'ses-abc' }));
    vi.mocked(spawn).mockClear();

    proc.sendPrompt('Next question');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['-p', 'Next question', '--output-format', 'stream-json', '--verbose', '--resume', 'ses-abc'],
      expect.objectContaining({ cwd: '/my/project' }),
    );
  });

  it('uses --resume from constructor when resumeSessionId is provided', () => {
    createProc('/my/project', 'ses-existing');
    proc.sendPrompt('Continue please');
    expect(spawn).toHaveBeenCalledWith(
      'claude',
      ['-p', 'Continue please', '--output-format', 'stream-json', '--verbose', '--resume', 'ses-existing'],
      expect.objectContaining({ cwd: '/my/project' }),
    );
  });

  // --- kill tests ---

  it('kill() sends SIGTERM to active process', () => {
    createProc();
    proc.sendPrompt('test');
    proc.kill();
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
