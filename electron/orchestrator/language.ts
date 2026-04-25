export type Language = 'en' | 'he';

export function languageInstructions(lang: Language): string {
  if (lang === 'en') return '';

  return [
    '',
    '## Language',
    'IMPORTANT: This user speaks Hebrew. All chat replies, AskUserQuestion text, and option labels MUST be in Hebrew.',
    'Markdown documents you write to docs/office/ should also be in Hebrew (vision-brief.md, prd.md, market-analysis.md, system-design.md, plan.md, ui-designs/index.md).',
    'EXCEPTION: actual code (variable names, function names, file paths) stays in English. Code comments and docstrings may be Hebrew or English at your discretion.',
    'EXCEPTION: tool names (Read, Write, Grep, AskUserQuestion, etc.) are part of the SDK protocol — never translate them.',
    'EXCEPTION: filenames in docs/office/ stay English (01-vision-brief.md, etc.) — only the *content* is Hebrew.',
    '',
  ].join('\n');
}

export function currentLanguageFromEnv(): Language {
  return process.env.OFFICE_LANGUAGE === 'he' ? 'he' : 'en';
}
