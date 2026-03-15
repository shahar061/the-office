import { EventEmitter } from 'events';
import type { AgentEvent, AgentRole } from '../../shared/types';
import { AGENT_ROLES } from '../../shared/types';

// ── Types ──

export interface SessionConfig {
  agentId: string;
  agentRole: AgentRole;
  prompt: string;
  systemPrompt?: string;
  cwd?: string;
  agents?: Record<string, { description: string; prompt: string; tools?: string[] }>;
  permissionMode?: string;
  allowedTools?: string[];
  env?: Record<string, string>;
  maxTurns?: number;
}

// ── Role resolution ──

export function resolveRole(name: string): AgentRole {
  const normalized = name.toLowerCase().replace(/[\s_]+/g, '-') as AgentRole;
  if ((AGENT_ROLES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return 'freelancer';
}

// ── Message translation ──

export function translateMessage(
  msg: Record<string, unknown>,
  defaultRole: AgentRole,
): AgentEvent[] {
  const now = Date.now();
  const base = {
    agentId: (msg.agent_id as string | undefined) ?? 'unknown',
    agentRole: defaultRole,
    source: 'sdk' as const,
    timestamp: now,
  };

  const type = msg.type as string | undefined;

  // system messages
  if (type === 'system') {
    const subtype = msg.subtype as string | undefined;

    if (subtype === 'init') {
      const sessionId = (msg.session_id as string | undefined) ?? '';
      return [
        {
          ...base,
          type: 'agent:created',
          message: sessionId,
        },
      ];
    }

    if (subtype === 'task_started') {
      const taskName = (msg.task_name as string | undefined) ?? '';
      const role = resolveRole(taskName);
      return [
        {
          ...base,
          agentRole: role,
          type: 'agent:created',
          message: taskName,
        },
      ];
    }

    if (subtype === 'task_notification') {
      const taskName = (msg.task_name as string | undefined) ?? '';
      const role = resolveRole(taskName);
      return [
        {
          ...base,
          agentRole: role,
          type: 'agent:closed',
        },
      ];
    }

    return [];
  }

  // assistant messages
  if (type === 'assistant') {
    const content = msg.content as unknown[] | undefined;
    if (!Array.isArray(content)) return [];

    const events: AgentEvent[] = [];

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        events.push({
          ...base,
          type: 'agent:tool:start',
          toolName: (b.name as string | undefined) ?? '',
          toolId: (b.id as string | undefined) ?? '',
        });
      } else if (b.type === 'text') {
        events.push({
          ...base,
          type: 'agent:message',
          message: (b.text as string | undefined) ?? '',
        });
      }
    }

    return events;
  }

  // user messages (tool results)
  if (type === 'user') {
    const toolUseResult = msg.tool_use_result;
    if (!toolUseResult) return [];

    const content = msg.content as unknown[] | undefined;
    if (!Array.isArray(content)) return [];

    const events: AgentEvent[] = [];

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_result') {
        events.push({
          ...base,
          type: 'agent:tool:done',
          toolId: (b.tool_use_id as string | undefined) ?? '',
        });
      }
    }

    return events;
  }

  // result message
  if (type === 'result') {
    const cost = (msg.total_cost_usd as number | undefined) ?? 0;
    const usage = msg.usage as Record<string, unknown> | undefined;
    let tokens = 0;
    if (usage) {
      const inputTokens = (usage.input_tokens as number | undefined) ?? 0;
      const outputTokens = (usage.output_tokens as number | undefined) ?? 0;
      tokens = inputTokens + outputTokens;
    }
    return [
      {
        ...base,
        type: 'session:cost:update',
        cost,
        tokens,
      },
    ];
  }

  // stream_event messages
  if (type === 'stream_event') {
    const event = msg.event as Record<string, unknown> | undefined;
    if (event && event.type === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta && delta.type === 'text_delta') {
        return [
          {
            ...base,
            type: 'agent:message:delta',
            message: (delta.text as string | undefined) ?? '',
          },
        ];
      }
    }
    return [];
  }

  return [];
}

// ── SDKBridge ──

export class SDKBridge extends EventEmitter {
  private activeQuery: { close(): void } | null = null;

  async runSession(config: SessionConfig): Promise<void> {
    // Dynamic import so tests don't need the SDK installed
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const { query } = sdk;

    // Build SDK options — only include defined fields
    const options: Record<string, unknown> = {};
    if (config.systemPrompt) options.systemPrompt = config.systemPrompt;
    if (config.cwd) options.cwd = config.cwd;
    if (config.agents) options.agents = config.agents;
    if (config.env) options.env = config.env;
    if (config.allowedTools) options.allowedTools = config.allowedTools;
    if (config.maxTurns) options.maxTurns = config.maxTurns;
    // Default to bypassing permissions — the app handles them via UI
    options.permissionMode = config.permissionMode || 'bypassPermissions';

    const gen = query({ prompt: config.prompt, options });
    this.activeQuery = gen as unknown as { close(): void };

    try {
      for await (const msg of gen) {
        const events = translateMessage(
          msg as unknown as Record<string, unknown>,
          config.agentRole,
        );
        for (const event of events) {
          const enrichedEvent: AgentEvent = {
            ...event,
            agentId: config.agentId,
          };
          this.emit('agentEvent', enrichedEvent);
        }
      }
    } finally {
      this.activeQuery = null;
      const closedEvent: AgentEvent = {
        agentId: config.agentId,
        agentRole: config.agentRole,
        source: 'sdk',
        type: 'agent:closed',
        timestamp: Date.now(),
      };
      this.emit('agentEvent', closedEvent);
    }
  }

  abort(): void {
    if (this.activeQuery && typeof (this.activeQuery as Record<string, unknown>).close === 'function') {
      (this.activeQuery as { close(): void }).close();
    }
  }
}
