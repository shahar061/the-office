import { create } from 'zustand';
import type { AgentRole } from '@shared/types';
import { agentDisplayName, extractToolTarget } from '../utils';
import type { AgentEvent } from '@shared/types';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'tool-start' | 'tool-done' | 'agent-message' | 'user-message' | 'agent-lifecycle' | 'phase-transition';
  agentRole?: AgentRole;
  toolName?: string;
  target?: string;
  text?: string;
}

interface LogStore {
  entries: LogEntry[];
  unreadCount: number;
  lastFlushedIndex: number;

  addEntry: (entry: LogEntry) => void;
  clearUnread: () => void;
  markFlushed: () => void;

  logAgentEvent: (event: AgentEvent) => void;
  logMessage: (role: 'user' | 'agent', text: string, agentRole?: AgentRole) => void;
  logPhaseTransition: (phase: string) => void;

  serializeUnflushed: () => string;
  reset: () => void;
}

let entryCounter = 0;

function nextId(): string {
  return `log-${Date.now()}-${++entryCounter}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function serializeEntry(entry: LogEntry): string {
  const time = formatTimestamp(entry.timestamp);
  const agent = entry.agentRole ? agentDisplayName(entry.agentRole) : 'System';

  switch (entry.type) {
    case 'tool-start':
      return `[${time}] ${agent} ⟳ ${entry.toolName ?? 'Tool'} ${entry.target ?? ''}`.trimEnd();
    case 'tool-done':
      return `[${time}] ${agent} ✓ ${entry.toolName ?? 'Tool'} ${entry.target ?? ''}`.trimEnd();
    case 'agent-message': {
      const preview = entry.text && entry.text.length > 80
        ? entry.text.slice(0, 80) + '…'
        : entry.text ?? '';
      return `[${time}] ${agent} → message\n    "${preview}"`;
    }
    case 'user-message': {
      const preview = entry.text && entry.text.length > 80
        ? entry.text.slice(0, 80) + '…'
        : entry.text ?? '';
      return `[${time}] You → message\n    "${preview}"`;
    }
    case 'agent-lifecycle':
      return `[${time}] ${agent} — ${entry.text ?? 'event'}`;
    case 'phase-transition':
      return `═══ Phase: ${entry.text ?? 'Unknown'} ═══`;
    default:
      return `[${time}] ${entry.text ?? ''}`;
  }
}

export const useLogStore = create<LogStore>((set, get) => ({
  entries: [],
  unreadCount: 0,
  lastFlushedIndex: -1,

  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, entry],
      unreadCount: state.unreadCount + 1,
    })),

  clearUnread: () => set({ unreadCount: 0 }),

  markFlushed: () =>
    set((state) => ({ lastFlushedIndex: state.entries.length - 1 })),

  logAgentEvent: (event) => {
    const { addEntry } = get();
    const ts = event.timestamp;
    const role = event.agentRole;

    if (event.type === 'agent:created' && event.isTopLevel) {
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'agent-lifecycle',
        agentRole: role,
        text: 'agent started',
      });
    } else if (event.type === 'agent:tool:start') {
      const toolName = event.toolName ?? 'Tool';
      if (toolName === 'AskUserQuestion') return;
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'tool-start',
        agentRole: role,
        toolName,
        target: extractToolTarget(event),
      });
    } else if (event.type === 'agent:tool:done') {
      const toolName = event.toolName ?? 'Tool';
      if (toolName === 'AskUserQuestion') return;
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'tool-done',
        agentRole: role,
        toolName,
        target: extractToolTarget(event),
      });
    } else if (event.type === 'agent:message' && event.message) {
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'agent-message',
        agentRole: role,
        text: event.message,
      });
    } else if (event.type === 'agent:closed') {
      addEntry({
        id: nextId(),
        timestamp: ts,
        type: 'agent-lifecycle',
        agentRole: role,
        text: 'agent closed',
      });
    }
  },

  logMessage: (role, text, agentRole) => {
    get().addEntry({
      id: nextId(),
      timestamp: Date.now(),
      type: role === 'user' ? 'user-message' : 'agent-message',
      agentRole,
      text,
    });
  },

  logPhaseTransition: (phase) => {
    get().addEntry({
      id: nextId(),
      timestamp: Date.now(),
      type: 'phase-transition',
      text: phase,
    });
  },

  serializeUnflushed: () => {
    const { entries, lastFlushedIndex } = get();
    const unflushed = entries.slice(lastFlushedIndex + 1);
    if (unflushed.length === 0) return '';
    return unflushed.map(serializeEntry).join('\n') + '\n';
  },

  reset: () =>
    set({
      entries: [],
      unreadCount: 0,
      lastFlushedIndex: -1,
    }),
}));
