import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
}

export function loadAgentDefinition(mdPath: string): [string, AgentDefinition] {
  const raw = fs.readFileSync(mdPath, 'utf-8');
  const { data: frontmatter, content: body } = matter(raw);
  const name = frontmatter.name as string;
  if (!name) throw new Error(`Agent file missing 'name' in frontmatter: ${mdPath}`);
  return [name, {
    description: (frontmatter.description as string) || name,
    prompt: body.trim(),
    tools: (frontmatter.tools as string[] | undefined) || undefined,
  }];
}

export function loadAllAgents(agentsDir: string): Record<string, AgentDefinition> {
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  const entries = files.map(f => loadAgentDefinition(path.join(agentsDir, f)));
  return Object.fromEntries(entries);
}
