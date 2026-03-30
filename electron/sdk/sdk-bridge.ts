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
  model?: string;
  agents?: Record<string, { description: string; prompt: string; tools?: string[] }>;
  allowedTools?: string[];
  env?: Record<string, string>;
  maxTurns?: number;
  // User interaction callback for AskUserQuestion
  onWaiting?: (questions: Array<{
    question: string;
    header: string;
    options: { label: string; description: string }[];
    multiSelect: boolean;
  }>) => Promise<Record<string, string>>;
  // Tool permission callback for non-AskUserQuestion tools
  onToolPermission?: (toolName: string, input: Record<string, unknown>) => Promise<{
    behavior: 'allow' | 'deny';
    updatedInput?: Record<string, unknown>;
    message?: string;
  }>;
}

// ── Role resolution ──

export function resolveRole(name: string): AgentRole {
  const normalized = name.toLowerCase().replace(/[\s_]+/g, '-') as AgentRole;
  if ((AGENT_ROLES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  console.warn(`[SDKBridge] resolveRole: unknown task name "${name}" (normalized: "${normalized}") → falling back to freelancer`);
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
          isTopLevel: true,
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
          isTopLevel: false,
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

  // assistant messages — SDK wraps content in msg.message.content
  if (type === 'assistant') {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = (message?.content ?? msg.content) as unknown[] | undefined;
    if (!Array.isArray(content)) return [];

    const events: AgentEvent[] = [];

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const input = b.input as Record<string, unknown> | undefined;
        const toolInput = input
          ? (input.file_path as string) ?? (input.command as string) ?? (input.pattern as string) ?? (input.path as string) ?? ''
          : '';
        events.push({
          ...base,
          type: 'agent:tool:start',
          toolName: (b.name as string | undefined) ?? '',
          toolId: (b.id as string | undefined) ?? '',
          message: typeof toolInput === 'string' ? toolInput : '',
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
    const userMessage = msg.message as Record<string, unknown> | undefined;
    const content = (userMessage?.content ?? msg.content) as unknown[] | undefined;
    if (!Array.isArray(content)) return [];
    // Check if any block is a tool_result
    const hasToolResult = content.some((b: any) => b.type === 'tool_result');
    if (!hasToolResult) return [];

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

  // rate limit events
  if (type === 'rate_limit_event') {
    const retryAfter = (msg.retry_after as number | undefined) ?? 0;
    const message = retryAfter > 0
      ? `Rate limited by API — retrying in ${Math.ceil(retryAfter)}s...`
      : 'Rate limited by API — retrying...';
    return [
      {
        ...base,
        type: 'agent:message',
        message,
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
    if (config.allowedTools) options.allowedTools = config.allowedTools;
    if (config.maxTurns) options.maxTurns = config.maxTurns;
    if (config.model) options.model = config.model;

    // Pass full process.env merged with any auth overrides
    options.env = config.env
      ? { ...process.env, ...config.env }
      : { ...process.env };

    // Use 'default' permission mode so canUseTool callback fires
    options.permissionMode = 'default';

    // Route tool permissions through canUseTool callback
    options.canUseTool = async (toolName: string, input: Record<string, unknown>) => {
      // AskUserQuestion → route to user interaction
      if (toolName === 'AskUserQuestion' && config.onWaiting) {
        const questions = (input as any).questions || [];
        const answers = await config.onWaiting(questions);
        return {
          behavior: 'allow' as const,
          updatedInput: { questions, answers },
        };
      }

      // Tools in agent's allowed list → auto-approve
      if (config.allowedTools?.includes(toolName)) {
        return { behavior: 'allow' as const };
      }

      // Other tools → delegate to permission callback (or auto-approve if no callback)
      if (config.onToolPermission) {
        return config.onToolPermission(toolName, input);
      }
      return { behavior: 'allow' as const };
    };

    // Capture stderr from the claude subprocess
    options.stderr = (data: string) => {
      console.error('[SDKBridge] claude stderr:', data);
    };

    console.log('[SDKBridge] Starting query with options:', JSON.stringify({
      prompt: config.prompt.slice(0, 100) + '...',
      options: { ...options, agents: options.agents ? `[${Object.keys(options.agents as Record<string, unknown>).length} agents]` : undefined },
    }));

    const gen = query({ prompt: config.prompt, options });
    this.activeQuery = gen as unknown as { close(): void };

    try {
      for await (const msg of gen) {
        console.log('[SDKBridge] Message type:', (msg as any)?.type, (msg as any)?.subtype || '');
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
    } catch (err: any) {
      console.error('[SDKBridge] Session error:', err.message);
      // Dump all enumerable and non-enumerable properties for debugging
      const allKeys = Object.getOwnPropertyNames(err);
      for (const key of allKeys) {
        if (key !== 'stack' && key !== 'message') {
          try { console.error(`[SDKBridge] err.${key}:`, JSON.stringify(err[key]).slice(0, 500)); } catch { /* skip */ }
        }
      }
      throw err;
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
