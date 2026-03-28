import type { AgentEvent } from '@shared/types';

export function agentDisplayName(role: string): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatAge(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~');
}

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
