export interface ParsedRunMd {
  prerequisites: string[];
  installCommand: string | null;
  runCommand: string | null;
  notes: string;
  raw: string;
}

const EMPTY: ParsedRunMd = {
  prerequisites: [],
  installCommand: null,
  runCommand: null,
  notes: '',
  raw: '',
};

/**
 * Parse a RUN.md file into its constituent sections.
 * Forgiving: missing sections → null/empty, but `raw` always contains the original.
 */
export function parseRunMd(raw: string): ParsedRunMd {
  if (!raw) return { ...EMPTY, raw };

  const sections = splitSections(raw);

  const prerequisites = parsePrerequisites(sections.get('Prerequisites') ?? '');
  const installCommand = extractCommand(sections.get('Install') ?? '');
  const runCommand = extractCommand(sections.get('Run') ?? '');
  const notes = (sections.get('Notes') ?? '').trim();

  return { prerequisites, installCommand, runCommand, notes, raw };
}

/** Split by `## Heading` into a map of heading→body. */
function splitSections(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = content.split('\n');
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      result.set(currentHeading, currentLines.join('\n'));
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      currentLines = [];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return result;
}

function parsePrerequisites(body: string): string[] {
  const items: string[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (match) items.push(match[1]);
  }
  return items;
}

/**
 * Extract a command from a section body. Priority:
 * 1. First fenced code block content
 * 2. First inline code `...`
 * 3. First non-empty, non-parenthetical line
 * Returns null if the section starts with "(could not determine".
 */
function extractCommand(body: string): string | null {
  if (!body.trim()) return null;

  // Check for the "could not determine" escape hatch
  if (/\(could not determine/i.test(body)) return null;

  // Try fenced code block
  const fenceMatch = body.match(/```[\w-]*\n([\s\S]*?)```/);
  if (fenceMatch) {
    const cmd = fenceMatch[1].trim();
    if (cmd) return cmd;
  }

  // Try inline code
  const inlineMatch = body.match(/`([^`]+)`/);
  if (inlineMatch) {
    const cmd = inlineMatch[1].trim();
    if (cmd) return cmd;
  }

  // Fall back to first non-empty line that doesn't look like prose
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('(')) continue;
    return trimmed;
  }

  return null;
}
