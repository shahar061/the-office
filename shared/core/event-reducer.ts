// shared/core/event-reducer.ts — Shared event classification logic
import type { AgentEvent } from '../types';
import type { CharacterActivity } from '../types';

export const READ_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent',
]);

/**
 * Classify an AgentEvent into the character activity it implies.
 * Returns `{ activity }` for visual state changes, `{ removed: true }` for
 * agent:closed, or `null` for non-visual events.
 */
export function classifyActivity(
  event: AgentEvent,
): { activity: CharacterActivity } | { removed: true } | null {
  switch (event.type) {
    case 'agent:created':
      return { activity: 'idle' };
    case 'agent:tool:start': {
      const isRead = event.toolName ? READ_TOOLS.has(event.toolName) : false;
      return { activity: isRead ? 'reading' : 'typing' };
    }
    case 'agent:tool:done':
    case 'agent:tool:clear':
      return { activity: 'idle' };
    case 'agent:waiting':
      return { activity: 'waiting' };
    case 'agent:closed':
      return { removed: true };
    default:
      return null;
  }
}
