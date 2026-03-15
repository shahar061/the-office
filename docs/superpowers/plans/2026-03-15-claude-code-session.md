# Claude Code Session Creation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spawn and manage persistent `claude` CLI subprocesses from the app, with stdin-based prompt delivery and stdout-based event parsing.

**Architecture:** A new `ClaudeCodeProcess` class wraps a persistent `claude --output-format stream-json` subprocess. It parses JSONL stdout into `AgentEvent`s. The `DISPATCH` IPC handler branches on `pendingSession.tool` to either use `ClaudeCodeProcess` (claude-code) or the existing `spawnOpenCode` (opencode).

**Tech Stack:** Electron IPC, Node child_process, JSONL stream parsing, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-claude-code-session-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `shared/types.ts` | Modify | Add `'claude-process'` to source unions |
| `electron/adapters/claude-code-process.ts` | Create | Persistent subprocess wrapper + JSONL parser |
| `electron/main.ts` | Modify | Tool-aware DISPATCH branching + CANCEL cleanup |
| `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx` | Modify | Enable Claude Code button |
| `tests/electron/adapters/claude-code-process.test.ts` | Create | Unit tests for process wrapper |

---

## Chunk 1: Types + ClaudeCodeProcess + Tests

### Task 1: Add `'claude-process'` to source unions

**Files:**
- Modify: `shared/types.ts:49` (AgentEvent.source)
- Modify: `shared/types.ts:82` (SessionInfo.source)

- [ ] **Step 1: Update AgentEvent.source union**

In `shared/types.ts`, line 49, change:
```typescript
source: 'sdk' | 'transcript' | 'opencode';
```
to:
```typescript
source: 'sdk' | 'transcript' | 'opencode' | 'claude-process';
```

- [ ] **Step 2: Update SessionInfo.source union**

In `shared/types.ts`, line 82, change:
```typescript
source: 'sdk' | 'transcript' | 'opencode';
```
to:
```typescript
source: 'sdk' | 'transcript' | 'opencode' | 'claude-process';
```

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `npx vitest run`
Expected: All existing tests pass (the new union value is additive).

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add 'claude-process' to AgentEvent and SessionInfo source unions"
```

---

### Task 2: Write failing tests for ClaudeCodeProcess

**Files:**
- Create: `tests/electron/adapters/claude-code-process.test.ts`

Tests call `parseLine()` directly (bypassing readline's async stream layer), matching the pattern in `claude-transcript.adapter.test.ts`. The `parseLine` method must be public for this.

- [ ] **Step 1: Write test file with all test cases**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import type { AgentEvent } from '../../../shared/types';

// Mock child_process.spawn
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

// Import after mock
import { ClaudeCodeProcess } from '../../../electron/adapters/claude-code-process';
import { spawn } from 'child_process';

describe('ClaudeCodeProcess', () => {
  let proc: ClaudeCodeProcess;
  let events: AgentEvent[];

  beforeEach(() => {
    events = [];
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/electron/adapters/claude-code-process.test.ts`
Expected: FAIL — `Cannot find module '../../../electron/adapters/claude-code-process'`

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/electron/adapters/claude-code-process.test.ts
git commit -m "test: add failing tests for ClaudeCodeProcess"
```

---

### Task 3: Implement ClaudeCodeProcess

**Files:**
- Create: `electron/adapters/claude-code-process.ts`

- [ ] **Step 1: Implement the class**

```typescript
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import type { AgentEvent, AgentRole } from '../../shared/types';

export class ClaudeCodeProcess extends EventEmitter {
  private process: ChildProcess;
  private rl: readline.Interface;
  private _sessionId: string | null = null;
  private agentRole: AgentRole;
  private lastToolNames: Map<string, string> = new Map();

  get sessionId(): string | null {
    return this._sessionId;
  }

  constructor(directory: string, agentRole: AgentRole = 'freelancer', resumeSessionId?: string) {
    super();
    this.agentRole = agentRole;

    const args = ['--output-format', 'stream-json'];
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    this.process = spawn('claude', args, {
      cwd: directory,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.rl = readline.createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line) => this.parseLine(line));

    this.process.stderr?.on('data', (data: Buffer) => {
      console.warn('[ClaudeCodeProcess stderr]', data.toString().trim());
    });

    this.process.on('error', (err) => {
      this.emitEvent('agent:closed');
      this.emit('error', err);
    });

    this.process.on('exit', (code) => {
      this.emitEvent('agent:closed');
      this.emit('exit', code);
    });

    // Note: pre-init events use 'pending-claude' as agentId and are NOT replayed
    // once the real session_id is known. The init event is expected to arrive
    // before any assistant events, so this is a non-issue in practice.
  }

  sendPrompt(prompt: string): void {
    this.process.stdin!.write(prompt + '\n', (err) => {
      if (err) {
        this.emitEvent('agent:closed');
        this.emit('error', err);
      }
    });
  }

  kill(): void {
    this.process.kill('SIGTERM');
  }

  // Public so tests can call directly (bypasses async readline layer)
  parseLine(line: string): void {
    let data: any;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }

    // Init event → extract session_id
    if (data.type === 'system' && data.subtype === 'init') {
      this._sessionId = data.session_id;
      this.emitEvent('agent:created');
      return;
    }

    // Assistant message → iterate content blocks
    if (data.type === 'assistant' && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === 'tool_use') {
          this.lastToolNames.set(block.id, block.name);
          this.emitEvent('agent:tool:start', { toolName: block.name, toolId: block.id });
        } else if (block.type === 'text' && block.text) {
          this.emitEvent('agent:message', { message: block.text });
        }
      }
      return;
    }

    // Tool result (top-level)
    if (data.type === 'tool_result') {
      const toolName = this.lastToolNames.get(data.tool_use_id);
      this.emitEvent('agent:tool:done', { toolName, toolId: data.tool_use_id });
      return;
    }

    // Result → cost update + waiting
    if (data.type === 'result') {
      if (data.total_cost != null) {
        this.emitEvent('session:cost:update', { cost: data.total_cost });
      }
      this.emitEvent('agent:waiting');
    }
  }

  private emitEvent(
    type: AgentEvent['type'],
    extra: Partial<AgentEvent> = {},
  ): void {
    const event: AgentEvent = {
      agentId: this._sessionId ?? 'pending-claude',
      agentRole: this.agentRole,
      source: 'claude-process',
      type,
      timestamp: Date.now(),
      ...extra,
    };
    this.emit('agentEvent', event);
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/electron/adapters/claude-code-process.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (no regressions).

- [ ] **Step 4: Commit**

```bash
git add electron/adapters/claude-code-process.ts
git commit -m "feat: implement ClaudeCodeProcess subprocess wrapper"
```

---

## Chunk 2: Main process integration + UI

### Task 4: Refactor DISPATCH handler for tool branching

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add import and state variable**

At the top of `electron/main.ts`, add after the existing imports:

```typescript
import { ClaudeCodeProcess } from './adapters/claude-code-process';
```

After line 17 (`const activeProcesses = ...`), add:

```typescript
let activeClaudeProcess: ClaudeCodeProcess | null = null;
```

- [ ] **Step 2: Refactor the DISPATCH handler**

Replace the entire `ipcMain.handle(IPC_CHANNELS.DISPATCH, ...)` block (lines 147-177) with:

```typescript
  ipcMain.handle(IPC_CHANNELS.DISPATCH, async (_event, prompt: string) => {
    if (!pendingSession) return { error: 'no-session' };

    // ── Claude Code path ──
    if (pendingSession.tool === 'claude-code') {
      if (!activeClaudeProcess) {
        activeClaudeProcess = new ClaudeCodeProcess(
          pendingSession.directory,
          'freelancer',
        );

        activeClaudeProcess.on('agentEvent', (agentEvent) => {
          // Forward to SessionManager and renderer
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.AGENT_EVENT, agentEvent);
          }

          // Session linking: on init event, link immediately
          if (agentEvent.type === 'agent:created' && activeClaudeProcess?.sessionId) {
            linkedSessionId = activeClaudeProcess.sessionId;
            if (mainWindow) {
              mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINKED, {
                sessionId: linkedSessionId,
                title: `Claude Code — ${pendingSession?.directory.split('/').pop() ?? ''}`,
              });
            }
          }
        });

        activeClaudeProcess.on('error', (err) => {
          console.error('[Main] ClaudeCodeProcess error:', err.message);
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, { error: err.message });
          }
          // If crash happened before init (no sessionId), send link failure
          if (!linkedSessionId && mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINK_FAILED, {
              error: err.message,
            });
          }
          activeClaudeProcess = null;
        });

        activeClaudeProcess.on('exit', (code) => {
          console.log('[Main] ClaudeCodeProcess exited:', code);
          if (code !== 0 && code !== null && mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.DISPATCH_ERROR, {
              error: `claude exited with code ${code}`,
            });
          }
          // If crash happened before init (no sessionId), send link failure
          if (!linkedSessionId && mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINK_FAILED, {
              error: `claude exited unexpectedly (code ${code})`,
            });
          }
          activeClaudeProcess = null;
        });
      }

      activeClaudeProcess.sendPrompt(prompt);
      return { sessionId: linkedSessionId ?? 'pending' };
    }

    // ── OpenCode path (unchanged) ──
    if (linkedSessionId) {
      const args = ['run', prompt, '--session', linkedSessionId, '--dir', pendingSession.directory, '--format', 'json'];
      spawnOpenCode(args);
      return { sessionId: linkedSessionId };
    }

    if (!dispatchInFlight) {
      dispatchInFlight = true;
      const args = ['run', prompt, '--dir', pendingSession.directory, '--format', 'json'];
      spawnOpenCode(args);

      linkingTimer = setTimeout(() => {
        if (!linkedSessionId && mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.SESSION_LINK_FAILED, {
            error: 'Timed out waiting for session to appear',
          });
          dispatchInFlight = false;
        }
      }, 30_000);

      return { sessionId: 'pending' };
    }

    if (dispatchInFlight) {
      return { error: 'session-starting' };
    }

    return { error: 'no-session' };
  });
```

- [ ] **Step 3: Update CANCEL_SESSION handler**

Replace the `ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, ...)` block (lines 221-231) with:

```typescript
  ipcMain.handle(IPC_CHANNELS.CANCEL_SESSION, async () => {
    console.log('[Main] Session cancelled');
    // Kill Claude Code process if active
    if (activeClaudeProcess) {
      activeClaudeProcess.kill();
      activeClaudeProcess = null;
    }
    // Kill OpenCode processes
    for (const proc of activeProcesses) {
      proc.kill();
    }
    activeProcesses.clear();
    // Reset state
    pendingSession = null;
    linkedSessionId = null;
    dispatchInFlight = false;
    if (linkingTimer) { clearTimeout(linkingTimer); linkingTimer = null; }
  });
```

- [ ] **Step 4: Update window-all-closed handler**

In the `app.on('window-all-closed', ...)` handler, add Claude cleanup before the existing process cleanup:

```typescript
  if (activeClaudeProcess) {
    activeClaudeProcess.kill();
    activeClaudeProcess = null;
  }
```

- [ ] **Step 5: Build to verify no compilation errors**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add Claude Code tool branching to DISPATCH and CANCEL handlers"
```

---

### Task 5: Enable Claude Code button in LobbyFAB

**Files:**
- Modify: `src/renderer/src/components/LobbyFAB/LobbyFAB.tsx:8`

- [ ] **Step 1: Change enabled flag**

In `LobbyFAB.tsx`, line 8, change:
```typescript
  { id: 'claude-code', label: 'Claude Code', enabled: false },
```
to:
```typescript
  { id: 'claude-code', label: 'Claude Code', enabled: true },
```

- [ ] **Step 2: Build to verify**

Run: `npx electron-vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/LobbyFAB/LobbyFAB.tsx
git commit -m "feat: enable Claude Code option in session creation UI"
```
