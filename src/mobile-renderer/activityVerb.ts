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

// Emoji matching the verb — used by the Pixi character tool-bubble label
// on the Office tab.
const READ_EMOJI = '\u{1F4D6}';   // 📖
const WRITE_EMOJI = '\u{270F}\u{FE0F}'; // ✏️
const BASH_EMOJI = '\u26A1';       // ⚡
const AGENT_EMOJI = '\u{1F91D}';   // 🤝
const DEFAULT_EMOJI = '\u{1F527}'; // 🔧

export function toolEmoji(toolName: string): string {
  if (READ_TOOLS.has(toolName)) return READ_EMOJI;
  if (WRITE_TOOLS.has(toolName)) return WRITE_EMOJI;
  if (toolName === 'Bash') return BASH_EMOJI;
  if (toolName === 'Agent') return AGENT_EMOJI;
  return DEFAULT_EMOJI;
}
