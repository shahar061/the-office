import type { AgentRole } from '../../shared/types';

export interface TriageResult {
  title: string;
  assignedAgent: AgentRole;
  reasoning: string;
}

const ALLOWED_AGENTS: ReadonlySet<AgentRole> = new Set<AgentRole>([
  'backend-engineer',
  'frontend-engineer',
  'mobile-developer',
  'data-engineer',
  'automation-developer',
  'devops',
]);

const FALLBACK_AGENT: AgentRole = 'backend-engineer';

/**
 * Parse the Team Lead's triage response. The TL is expected to output a JSON
 * block with title, assignedAgent, reasoning. On any parse failure (no JSON,
 * malformed, missing fields, unknown agent), returns a safe fallback.
 */
export function parseTriageOutput(
  raw: string,
  fallbackDescription: string,
): TriageResult {
  const fallback: TriageResult = {
    title: fallbackDescription.slice(0, 60),
    assignedAgent: FALLBACK_AGENT,
    reasoning: 'fallback — triage failed',
  };

  const jsonBlock = extractFirstJsonBlock(raw);
  if (!jsonBlock) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return fallback;
  }

  if (typeof parsed !== 'object' || parsed === null) return fallback;
  const obj = parsed as Record<string, unknown>;

  const title = typeof obj.title === 'string' ? obj.title : null;
  const assignedAgent = typeof obj.assignedAgent === 'string' ? obj.assignedAgent : null;
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';

  if (!title || !title.trim()) return fallback;
  if (!assignedAgent || !ALLOWED_AGENTS.has(assignedAgent as AgentRole)) return fallback;

  return {
    title: title.trim(),
    assignedAgent: assignedAgent as AgentRole,
    reasoning: reasoning.trim(),
  };
}

/**
 * Extract the first balanced {...} block from a string, accounting for
 * nested braces. Returns null if no balanced block exists.
 */
function extractFirstJsonBlock(raw: string): string | null {
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  for (let i = startIdx; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return raw.slice(startIdx, i + 1);
      }
    }
  }

  return null; // unbalanced
}
