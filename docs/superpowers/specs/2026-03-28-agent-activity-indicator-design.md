# Agent Activity Indicator — Design Spec

## Overview

Add a real-time activity indicator to the chat panel that shows what an agent is currently doing (reading files, writing code, running commands). The indicator replaces the chat input area while an agent is working, signaling to the user that they should wait and that work is in progress.

## Requirements

- Show tool-level detail: which agent, what tool, what file/command
- Display a rolling stack of the last 3 actions in a vertical timeline style
- Replace the input area entirely while the agent is active (no typing possible)
- Restore the input area when the agent finishes or asks a question
- Use existing agent event stream — no new IPC channels or main-process changes

## Data Model

### State: `agentActivity` in `office.store.ts`

Add to the existing `useOfficeStore` alongside the character state tracking, since both consume the same `handleAgentEvent` handler:

```typescript
interface ActivityAction {
  id: string;            // toolId from AgentEvent, for matching start/done
  toolName: string;      // "Read", "Write", "Bash", etc.
  target: string;        // "plan.md", "npm test", etc.
  status: 'running' | 'done';
}

// New fields in OfficeStore:
agentActivity: {
  isActive: boolean;
  agentRole: AgentRole | null;
  actions: ActivityAction[];   // rolling buffer, max 3
};
```

### Event Mapping

Events are already received in `handleAgentEvent`. Add activity tracking to the same handler:

| Event | Action |
|-------|--------|
| `agent:created` with `isTopLevel: true` | Set `isActive: true`, set `agentRole` |
| `agent:tool:start` | Push new action `{ id: toolId, toolName, target: extractToolTarget(event), status: 'running' }`. Keep last 3. Update `agentRole` from event (sub-agents may take over). |
| `agent:tool:done` | Find action by `toolId`, set `status: 'done'` |
| Phase change (`setPhaseInfo`) to `completed` / `failed` / `interrupted` | Set `isActive: false`, clear `actions`, clear `agentRole` |

Note: `agent:closed` only fires for sub-tasks (via `task_notification`), not the top-level agent. Activity clears when the phase completes instead. The `agentRole` on tool events updates the displayed agent name so it reflects whichever agent is currently working (e.g., sub-agent taking over from the orchestrator).

### Tool Target Extraction

Pure function `extractToolTarget(event: AgentEvent): string`:

| toolName | Target source | Example output |
|----------|--------------|----------------|
| `Read` | File path from `event.message` → basename | `plan.md` |
| `Write` | File path from `event.message` → basename | `App.tsx` |
| `Edit` | File path from `event.message` → basename | `store.ts` |
| `Grep` | Pattern or file from `event.message` | `"handleClick"` |
| `Glob` | Pattern from `event.message` | `**/*.tsx` |
| `Bash` | First ~40 chars of command from `event.message` | `npm test` |
| Other / missing | Tool name as fallback | `Agent` |

The `event.message` field on `agent:tool:start` events contains the tool input. Parse it based on `toolName` to extract the most useful short description. Use `path.basename()` equivalent (split on `/`, take last segment) for file paths. Truncate long strings to ~40 chars with ellipsis.

## Component: `ActivityIndicator.tsx`

New component in `src/renderer/src/components/OfficeView/`.

### Layout (Timeline Style)

```
┌──────────────────────────────────────┐
│ ● Project Manager                    │  ← colored dot + display name
│ │                                    │
│ │  ✓  Read config.json               │  ← done: green check, dimmed text
│ │  ✓  Read App.tsx                   │  ← done: green check, dimmed text
│ │  ◎  Write plan.md...               │  ← running: spinner, bright text
│                                      │
└──────────────────────────────────────┘
```

### Visual Specs

- **Container**: same padding/border-top as the existing input area (`padding: 8px 12px 12px`, `border-top: 1px solid colors.border`)
- **Agent header**: `colors.dot` = agent color from `AGENT_COLORS[role]`, name via `agentDisplayName(role)`, font-size 11px, weight 600
- **Timeline border**: 2px solid, agent's color at 30% opacity, left of action items, 14px left padding
- **Done action**: green checkmark (`colors.success`), text in `colors.textDark`, font-size 10px
- **Running action**: CSS spinner (8px, border-based, agent's color), text in `colors.text`, font-size 10px, font-weight 500, "..." suffix
- **Max 3 actions visible**: when 4th arrives, oldest drops off top

### Transitions

- New actions fade in (opacity 0 → 1, ~200ms)
- When `isActive` goes false: indicator fades out over 300ms, then input area renders

## ChatPanel Integration

In `ChatPanel.tsx`, replace the input area render:

```
// Bottom of ChatPanel render:
if (agentActivity.isActive && !waitingForResponse) {
  render <ActivityIndicator />
} else {
  render existing input area
}
```

When `waitingForResponse` is true, the agent is asking a question — the input area must be visible for the user to respond, even if `isActive` is still true.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/src/stores/office.store.ts` | Add `agentActivity` state, `clearAgentActivity()` action, update logic in `handleAgentEvent` |
| `src/renderer/src/stores/project.store.ts` | In `setPhaseInfo`, clear agent activity on terminal statuses (`completed`/`failed`/`interrupted`) |
| `src/renderer/src/components/OfficeView/ActivityIndicator.tsx` | **New file** — timeline indicator component |
| `src/renderer/src/components/OfficeView/ChatPanel.tsx` | Conditional render: indicator vs input area |
| `src/renderer/src/utils.ts` | Add `extractToolTarget()` utility function |

## Edge Cases

- **Rapid tool calls**: Buffer keeps last 3 — older ones drop off naturally. No accumulation.
- **Agent asks question mid-work**: `waitingForResponse` takes priority — input area shows, indicator hides. When user responds and agent resumes, indicator comes back.
- **Agent crashes / fails**: Phase transitions to `failed`/`interrupted`, which triggers `clearAgentActivity()`. Indicator clears.
- **Multiple agents / sub-agents**: `agentRole` updates from each `tool:start` event, so the indicator naturally reflects whichever agent is currently active. Sub-agent tool calls will show the sub-agent's name.
- **No tool events**: If agent only emits `agent:message` without tools, `isActive` is true but `actions` is empty — show just the agent name header with "Thinking..." fallback text.
