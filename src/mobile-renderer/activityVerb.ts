// Maps tool names to gerund verbs used by the mobile ActivityFooter.
// Kept deliberately small — desktop's ActivityIndicator uses a richer
// per-tool visual timeline, which is out of scope for sub-project 2.

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);
const WRITE_TOOLS = new Set(['Write', 'Edit']);

export function toolVerb(toolName: string): string {
  if (READ_TOOLS.has(toolName)) return 'reading';
  if (WRITE_TOOLS.has(toolName)) return 'writing';
  if (toolName === 'Bash') return 'running';
  if (toolName === 'Agent') return 'delegating';
  return 'running';
}
