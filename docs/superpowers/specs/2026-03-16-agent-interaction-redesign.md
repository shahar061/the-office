# Agent Interaction Redesign — Sequential Sessions with User Dialogue

## Overview

Redesign the Electron app's agent interaction to match the office plugin's behavior. Replace the current single-session-per-phase model with sequential per-agent `query()` sessions, each capable of interactive user dialogue via `AskUserQuestion`. The Electron orchestrator manages transitions between agents, verifies artifacts, and emits system messages.

---

## Problem

The current Electron app runs one SDK `query()` session per phase with a prompt like "You are the CEO." This has two critical issues:

1. **No real subagents** — a single session pretends to be multiple agents by switching roles in the prompt. Context bloats, agent identity is ambiguous.
2. **No user interaction** — agents ask questions via `agent:message` events, but user responses typed in the chat are never sent back to the SDK. The `SEND_MESSAGE` IPC handler is a placeholder.

The office plugin solves both by spawning each agent as a separate Task invocation with interactive dialogue. The Agent SDK fully supports this pattern via separate `query()` calls with `AskUserQuestion`.

---

## Architecture

### Session Model

Each agent role gets its own `query()` session. The Electron orchestrator (TypeScript) controls sequencing, passes artifacts between sessions via the filesystem, and handles state transitions.

**Imagine phase flow:**

```
Orchestrator (TypeScript)
  │
  ├─ runAgentSession(CEO)
  │    └─ CEO asks user questions <-> user responds (AskUserQuestion)
  │    └─ CEO writes 01-vision-brief.md
  │    └─ Session ends
  │
  ├─ Orchestrator verifies 01-vision-brief.md exists
  ├─ Orchestrator emits system message: "CEO completed Discovery. PM starting Definition..."
  │
  ├─ runAgentSession(PM, context: 01-vision-brief.md)
  │    └─ PM asks user questions <-> user responds
  │    └─ PM writes 02-prd.md
  │    └─ Session ends
  │
  ├─ Orchestrator verifies, emits system message
  │
  ├─ runAgentSession(Market Researcher, context: 01 + 02)
  │    └─ Researcher works autonomously (WebSearch, no user questions)
  │    └─ Writes 03-market-analysis.md
  │
  ├─ Orchestrator verifies, emits system message
  │
  └─ runAgentSession(Architect, context: 01 + 02 + 03)
       └─ Architect asks tech stack questions <-> user responds
       └─ Writes 04-system-design.md
```

Warroom and Build follow the same pattern — sequential agent sessions with the orchestrator managing transitions.

No Agent Organizer sessions are needed — the Electron main process already has `PhaseMachine` for state tracking and `ArtifactStore` for reading artifacts. The plugin needs the Agent Organizer because Skills don't have persistent state between Task invocations; the Electron app does.

### Shared Session Runner

A reusable `runAgentSession()` function encapsulates the common logic:

```typescript
async function runAgentSession(config: {
  agentName: string;               // e.g., 'ceo'
  agentsDir: string;               // path to agents/ directory
  prompt: string;
  cwd: string;
  env: Record<string, string>;     // auth credentials (apiKey, etc.)
  expectedOutput?: string;         // file path to verify after session ends
  onEvent: (event: AgentEvent) => void;
  onWaiting: (questions: AskQuestion[]) => Promise<Record<string, string>>;
}): Promise<void>
```

The function:
1. Loads the agent definition via `AgentLoader.loadAgentDefinition(path.join(agentsDir, agentName + '.md'))` — the existing API takes a file path
2. Merges `AskUserQuestion` into the agent's allowedTools list (unless explicitly excluded, e.g., build agents)
3. Builds the `SessionConfig` and calls `SDKBridge.runSession()`
4. After session ends, verifies `expectedOutput` file exists (if specified) — throws if missing
5. Returns session result (cost, tokens, success/failure)

Each phase orchestrator calls this multiple times with different agents and contexts. The `onWaiting` callback is wired to the IPC user-response flow.

---

## User Interaction Flow (AskUserQuestion)

### Permission Mode Change (Critical)

The current SDK bridge uses `permissionMode: 'bypassPermissions'` which auto-approves all tools and **never calls the `canUseTool` callback**. To intercept `AskUserQuestion`, the bridge must switch to `permissionMode: 'default'`. This means `canUseTool` must now handle ALL tool permission decisions — not just `AskUserQuestion`.

The `canUseTool` callback becomes the single permission handler:
- `AskUserQuestion` → route to user interaction flow (see below)
- Tools in the agent's `allowedTools` list → `{ behavior: 'allow' }` (auto-approve)
- Other tools → delegate to existing `PermissionHandler` for user approval via UI

### AskUserQuestion Input/Output Format

The SDK's `AskUserQuestion` tool uses a **structured multi-question format**, not simple text:

**Input (what the agent sends):**
```typescript
{
  questions: [
    {
      question: "What tech stack do you prefer?",
      header: "Stack",           // short label, max 12 chars
      options: [
        { label: "React + Node", description: "Full JS stack" },
        { label: "Python + FastAPI", description: "Python backend" }
      ],
      multiSelect: false
    }
  ]
}
```

**Output (what we return via `updatedInput`):**
```typescript
{
  questions: input.questions,  // pass through original questions
  answers: {
    "What tech stack do you prefer?": "React + Node"  // question text → selected label
  }
}
```

For `multiSelect: true`, join selected labels with `", "`.

### End-to-End Flow

```
Agent calls AskUserQuestion with structured questions
  → canUseTool callback fires (permissionMode: 'default')
  → bridge extracts questions array from tool input
  → bridge calls onWaiting(questions) → returns Promise<answers>
  → main emits AGENT_WAITING to renderer (questions + agentRole)
  → renderer shows questions with options in the chat bubble
  → user selects options / types response
  → renderer sends USER_RESPONSE via IPC (answers map)
  → main resolves the pending promise with answers
  → canUseTool returns { behavior: 'allow', updatedInput: { questions, answers } }
  → SDK resumes agent session with the user's selections
```

### Promise Management

The main process maintains a `Map<string, PendingQuestion>` (keyed by session ID) to handle the async waiting:

```typescript
interface PendingQuestion {
  resolve: (answers: Record<string, string>) => void;
  reject: (error: Error) => void;
  sessionId: string;
}
```

**Error handling:**
- If the SDK session errors/aborts while waiting, `reject` is called to clean up
- If the user closes the app, the `window-all-closed` handler rejects all pending questions
- The `USER_RESPONSE` IPC includes a `sessionId` to prevent stale responses from being delivered to the wrong agent
- If `USER_RESPONSE` arrives with no matching pending question, it is silently ignored

No timeout — the agent waits indefinitely for the user.

---

## Chat UI Changes

### Waiting State Bubble

When `agent:waiting` is received, the latest agent message gets:
- A pulsing left-border animation (cycles between the agent's color at full opacity and 30% opacity, ~1.5s)
- A small "Awaiting your response" label below the message text, in `#666`, italic, 10px
- If the agent provided structured options, display them as clickable chips/buttons below the question. Clicking a chip fills the input with that option's label. The user can also type a free-text response.

**CSS keyframes:** Since the codebase uses inline styles (no CSS files), the pulsing animation requires injecting a `<style>` tag into the component. Add a single `@keyframes pulse-border` animation in a `<style>` element rendered by `OfficeView`. The animation is applied via `className` (the only use of CSS class in this component) rather than inline `animation` property, since React inline styles cannot express `@keyframes`.

### Input Placeholder

Changes from "Type a message..." to "Responding to [Agent Name]..." while `waitingForResponse` is true. Reverts when the response is sent.

### System Message Dividers

Between agent sessions, the orchestrator emits a system message:
- Uses the `'system'` role (gray bubble from existing chat bubble styling)
- Text format: "[Agent] completed [Sub-phase]. [Next Agent] starting [Next Sub-phase]..."
- Example: "CEO completed Discovery phase. Product Manager starting Definition..."
- The pixel office characters animate the transition simultaneously (character walks away, next character walks to desk)

### No Other Chat UI Changes

The bubble styling, expanded layout, tab bar, and ResizeObserver fix from the previous UI/UX improvements carry over unchanged.

---

## IPC & Type Changes

### New Event Type

Add `agent:waiting` to `AgentEventType` in `shared/types.ts`:

```typescript
type AgentEventType =
  | 'agent:created'
  | 'agent:tool:start'
  | 'agent:tool:done'
  | 'agent:tool:clear'
  | 'agent:waiting'      // already exists, now actively used
  | 'agent:permission'
  | 'agent:message'
  | 'agent:message:delta'
  | 'agent:closed'
  | 'session:cost:update';
```

Note: `agent:waiting` already exists in the type union but is never emitted. This design activates it.

### New IPC Channels

Add to `IPC_CHANNELS`:

```typescript
AGENT_WAITING: 'office:agent-waiting',
USER_RESPONSE: 'office:user-response',
```

The `AGENT_WAITING` channel carries `AgentWaitingPayload` from main to renderer. The `USER_RESPONSE` channel carries `{ sessionId: string; answers: Record<string, string> }` from renderer to main.

### New OfficeAPI Method

Add to the `OfficeAPI` interface:

```typescript
respondToAgent(sessionId: string, answers: Record<string, string>): Promise<void>;
onAgentWaiting(callback: (payload: AgentWaitingPayload) => void): () => void;
```

### New Types

```typescript
interface AskQuestion {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
}

interface AgentWaitingPayload {
  sessionId: string;
  agentRole: AgentRole;
  questions: AskQuestion[];
}
```

---

## Chat Store Changes

Add waiting state to `ChatStore`:

```typescript
interface ChatStore {
  messages: ChatMessage[];
  waitingForResponse: boolean;
  waitingAgentRole: AgentRole | null;
  waitingSessionId: string | null;
  waitingQuestions: AskQuestion[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setWaiting: (payload: AgentWaitingPayload | null) => void;
}
```

`setWaiting(payload)` sets `waitingForResponse: true`, `waitingAgentRole`, `waitingSessionId`, and `waitingQuestions` from the payload. `setWaiting(null)` clears all four fields. The renderer reads `waitingQuestions` to display option chips in the UI.

---

## SDK Bridge Changes

### Permission Mode

Change from `bypassPermissions` to `default`:

```typescript
// Before:
options.permissionMode = 'bypassPermissions';
options.dangerouslySkipPermissions = true;

// After:
options.permissionMode = 'default';
// Remove dangerouslySkipPermissions entirely
```

### canUseTool Callback

The `SDKBridge.runSession()` method now provides a `canUseTool` callback that handles all tool permissions:

```typescript
canUseTool: async (toolName, input) => {
  if (toolName === 'AskUserQuestion') {
    // Route to user interaction
    const answers = await config.onWaiting(input.questions);
    return {
      behavior: 'allow',
      updatedInput: {
        questions: input.questions,
        answers,
      },
    };
  }

  // Auto-approve tools in the agent's allowed list
  if (config.allowedTools?.includes(toolName)) {
    return { behavior: 'allow' };
  }

  // Delegate to PermissionHandler for other tools (prompts user via UI)
  return permissionHandler.handleToolRequest(toolName, input, config.agentRole);
}
```

### Session Config

```typescript
interface SessionConfig {
  agentId: string;
  agentRole: AgentRole;
  prompt: string;
  cwd: string;
  allowedTools: string[];
  agents?: Record<string, AgentDefinition>;
  env?: Record<string, string>;
  onWaiting: (questions: AskQuestion[]) => Promise<Record<string, string>>;
}
```

Note: `onWaiting` takes the structured `AskQuestion[]` array and returns a `Record<string, string>` mapping question text to selected answer labels.

### Wiring canUseTool to the SDK

The SDK's `query()` function accepts `canUseTool` as a field on the options object. The current `SDKBridge.runSession()` builds `options` as a `Record<string, unknown>` and passes it to `query({ prompt, options })`. To wire the callback:

```typescript
options.permissionMode = 'default';
options.canUseTool = async (toolName: string, input: Record<string, unknown>) => {
  // ... routing logic as shown above
};
```

This replaces the current `options.permissionMode = 'bypassPermissions'` and `options.dangerouslySkipPermissions = true`.

---

## Orchestrator Refactors

### run-agent-session.ts (New File)

Shared session runner that:
1. Loads agent definition via `AgentLoader`
2. Builds the `SessionConfig` with tools from agent frontmatter + `AskUserQuestion`
3. Calls `SDKBridge.runSession()`
4. After session ends, verifies `expectedOutput` file exists (if specified)
5. Returns session result (cost, tokens, success/failure)

### imagine.ts (Refactor)

Replace single-session approach with four sequential calls:

```typescript
export async function runImagine(userIdea: string, config: PhaseConfig): Promise<void> {
  const { projectDir, onEvent, onWaiting, artifactStore } = config;

  // 1. CEO — Discovery
  await runAgentSession({
    agentName: 'ceo',
    prompt: buildCeoPrompt(userIdea),
    cwd: projectDir,
    expectedOutput: 'docs/office/01-vision-brief.md',
    onEvent,
    onWaiting,
  });
  emitSystemMessage(onEvent, 'CEO completed Discovery phase. Product Manager starting Definition...');

  // 2. PM — Definition
  const visionBrief = artifactStore.readArtifact('01-vision-brief.md');
  await runAgentSession({
    agentName: 'product-manager',
    prompt: buildPmPrompt(visionBrief),
    cwd: projectDir,
    expectedOutput: 'docs/office/02-prd.md',
    onEvent,
    onWaiting,
  });
  emitSystemMessage(onEvent, 'Product Manager completed Definition. Market Researcher starting Validation...');

  // 3. Market Researcher — Validation
  const prd = artifactStore.readArtifact('02-prd.md');
  await runAgentSession({
    agentName: 'market-researcher',
    prompt: buildResearcherPrompt(visionBrief, prd),
    cwd: projectDir,
    expectedOutput: 'docs/office/03-market-analysis.md',
    onEvent,
    onWaiting,
  });
  emitSystemMessage(onEvent, 'Market Researcher completed Validation. Chief Architect starting Architecture...');

  // 4. Chief Architect — Architecture
  const allDocs = artifactStore.getImagineContext();
  await runAgentSession({
    agentName: 'chief-architect',
    prompt: buildArchitectPrompt(allDocs),
    cwd: projectDir,
    expectedOutput: 'docs/office/04-system-design.md',
    onEvent,
    onWaiting,
  });
  emitSystemMessage(onEvent, 'Chief Architect completed Architecture. Imagine phase complete.');
}
```

**Note:** `ArtifactStore` currently lacks a `readArtifact(filename)` method — it only has `getImagineContext()` and `getTasksYaml()`. A new `readArtifact(filename: string): string` method must be added that reads `path.join(projectDir, 'docs/office', filename)` and returns the file contents.

**Note:** `PhaseConfig` is a new type extending the existing phase config interfaces:
```typescript
interface PhaseConfig {
  projectDir: string;
  agentsDir: string;               // path to agents/ directory
  env: Record<string, string>;     // auth credentials (ANTHROPIC_API_KEY, etc.)
  onEvent: (event: AgentEvent) => void;
  onWaiting: (questions: AskQuestion[]) => Promise<Record<string, string>>;
  artifactStore: ArtifactStore;
}
```

**Note:** `emitSystemMessage` is a utility function that constructs a `ChatMessage` with `role: 'system'` and dispatches it via IPC to the renderer.

### warroom.ts (Refactor)

Same pattern — sequential `runAgentSession()` calls for PM (plan.md) and Team Lead (tasks.yaml).

### build.ts (Refactor)

Already runs parallel phase sessions. Refactor each phase session to use `runAgentSession()`. The parallel scheduling logic stays the same.

**Build agents should NOT use `AskUserQuestion`** — their tools list should exclude it. Build agents work autonomously on implementation tasks. If multiple parallel agents could ask questions simultaneously, the UI would need a question queue (out of scope for this redesign). Only imagine and warroom agents interact with the user.

### main.ts (Modify)

- Add `USER_RESPONSE` IPC handler that resolves the pending `onWaiting` promise
- Wire `onWaiting` callback: when called, emit `AGENT_WAITING` to renderer, create a promise, store its resolve function, return the promise
- Emit system messages between agent sessions as `ChatMessage` with `role: 'system'`

### preload.ts (Modify)

Expose new API methods:
- `respondToAgent(text: string)` — sends `USER_RESPONSE` IPC
- `onAgentWaiting(callback)` — listens for `AGENT_WAITING` IPC events

---

## Summary of New/Modified Files

| File | Action | Purpose |
|------|--------|---------|
| `shared/types.ts` | Modify | Add `AGENT_WAITING` + `USER_RESPONSE` IPC channels, `AskQuestion`, `AgentWaitingPayload`, `PhaseConfig` types, `respondToAgent` and `onAgentWaiting` to `OfficeAPI` |
| `electron/sdk/sdk-bridge.ts` | Modify | Switch to `permissionMode: 'default'`, add `canUseTool` callback routing `AskUserQuestion` + tool permissions, `onWaiting` in `SessionConfig` |
| `electron/orchestrator/run-agent-session.ts` | Create | Shared session runner: loads agent via `AgentLoader`, merges `AskUserQuestion` into tools, runs session, verifies artifacts |
| `electron/orchestrator/imagine.ts` | Modify | Refactor to 4 sequential `runAgentSession()` calls with system message dividers |
| `electron/orchestrator/warroom.ts` | Modify | Refactor to sequential sessions |
| `electron/orchestrator/build.ts` | Modify | Refactor phase sessions to use `runAgentSession()` (no `AskUserQuestion` for build agents) |
| `electron/project/artifact-store.ts` | Modify | Add `readArtifact(filename: string): string` method |
| `electron/main.ts` | Modify | Add `USER_RESPONSE` handler with `Map<string, PendingQuestion>`, wire `onWaiting`, emit system messages, cleanup on abort/close |
| `electron/preload.ts` | Modify | Expose `respondToAgent()` and `onAgentWaiting()` |
| `src/renderer/src/stores/chat.store.ts` | Modify | Add `waitingForResponse`, `waitingAgentRole`, `waitingQuestions`, `setWaiting()` |
| `src/renderer/src/components/OfficeView/OfficeView.tsx` | Modify | Pulsing bubble border (CSS keyframes), option chips, dynamic input placeholder, send-to-agent flow |
