// shared/core/extract-tool-target.ts — Pure helper that turns an AgentEvent
// into a short, user-facing target string (e.g. "foo.ts" for Read).
// Kept in shared/core/ so both the main-process SnapshotBuilder and the
// desktop renderer can use the same implementation.

import type { AgentEvent } from '../types';

export function extractToolTarget(event: AgentEvent): string {
  const tool = event.toolName ?? '';
  const msg = event.message ?? '';

  if (!msg) return tool || 'Working';

  const FILE_TOOLS = ['Read', 'Write', 'Edit'];
  if (FILE_TOOLS.includes(tool)) {
    const segments = msg.split('/');
    return segments[segments.length - 1] || msg;
  }

  if (tool === 'Bash') {
    const trimmed = msg.trim();
    return trimmed.length > 40 ? trimmed.slice(0, 40) + '\u2026' : trimmed;
  }

  if (tool === 'Grep' || tool === 'Glob') {
    return msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg;
  }

  // Fallback: show tool name or truncated message
  return tool || (msg.length > 40 ? msg.slice(0, 40) + '\u2026' : msg);
}
