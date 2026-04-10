import { describe, it, expect } from 'vitest';
import { parseRunMd } from '../../../../src/renderer/src/components/CompletionPanel/run-md-parser';

describe('parseRunMd', () => {
  it('returns empty result for empty input', () => {
    const result = parseRunMd('');
    expect(result.prerequisites).toEqual([]);
    expect(result.installCommand).toBeNull();
    expect(result.runCommand).toBeNull();
    expect(result.notes).toBe('');
    expect(result.raw).toBe('');
  });

  it('parses prerequisites as bullet points', () => {
    const input = `# How to Run

## Prerequisites
- Node.js 20+
- npm install

## Install
\`\`\`
npm install
\`\`\`

## Run
\`\`\`
npm run dev
\`\`\`
`;
    const result = parseRunMd(input);
    expect(result.prerequisites).toEqual(['Node.js 20+', 'npm install']);
  });

  it('extracts install command from code block', () => {
    const input = `## Install
\`\`\`
npm install
\`\`\`

## Run
\`\`\`
npm run dev
\`\`\`
`;
    const result = parseRunMd(input);
    expect(result.installCommand).toBe('npm install');
  });

  it('extracts run command from code block', () => {
    const input = `## Run
\`\`\`
npm run dev
\`\`\`
`;
    const result = parseRunMd(input);
    expect(result.runCommand).toBe('npm run dev');
  });

  it('extracts run command from inline code if no code block', () => {
    const input = `## Run

\`python main.py\`
`;
    const result = parseRunMd(input);
    expect(result.runCommand).toBe('python main.py');
  });

  it('extracts run command from plain text if no code formatting', () => {
    const input = `## Run

cargo run
`;
    const result = parseRunMd(input);
    expect(result.runCommand).toBe('cargo run');
  });

  it('returns null runCommand when section is missing', () => {
    const input = `## Install
\`\`\`
npm install
\`\`\`
`;
    const result = parseRunMd(input);
    expect(result.runCommand).toBeNull();
    expect(result.installCommand).toBe('npm install');
  });

  it('returns null runCommand when section says could not determine', () => {
    const input = `## Run

(could not determine automatically — see the project's README)
`;
    const result = parseRunMd(input);
    expect(result.runCommand).toBeNull();
  });

  it('preserves notes section', () => {
    const input = `## Run
\`\`\`
npm run dev
\`\`\`

## Notes
The app runs on http://localhost:5173.
Requires a .env file.
`;
    const result = parseRunMd(input);
    expect(result.notes).toContain('http://localhost:5173');
    expect(result.notes).toContain('Requires a .env file');
  });

  it('preserves raw content', () => {
    const input = `# How to Run\n\n## Run\n\`\`\`\nnpm run dev\n\`\`\`\n`;
    const result = parseRunMd(input);
    expect(result.raw).toBe(input);
  });
});
