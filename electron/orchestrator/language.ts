export type Language = 'en' | 'he' | 'es' | 'it' | 'de' | 'pt';

const LANGUAGE_NAMES: Record<Exclude<Language, 'en'>, string> = {
  he: 'Hebrew',
  es: 'Spanish',
  it: 'Italian',
  de: 'German',
  pt: 'Portuguese',
};

export function languageInstructions(lang: Language): string {
  if (lang === 'en') return '';

  const name = LANGUAGE_NAMES[lang];
  return [
    '',
    '## Language',
    `IMPORTANT: This user speaks ${name}.`,
    `CHAT-FACING TEXT must be in ${name}: every chat reply, every AskUserQuestion question text, every option label, every option description, every recommendation. The user only sees these — they are the conversation.`,
    'PERSISTED ARTIFACTS must remain in English: every Markdown file you Write to docs/office/ (01-vision-brief.md, 02-prd.md, 03-market-analysis.md, 04-system-design.md, 05-ui-designs/index.md, plan.md, tasks.yaml, phase specs) — content AND filenames. Downstream agents and code generation pipelines read these and reason better in English; mixed-language artifacts break consumption by later phases. The renderer offers a separate "View in [target language]" toggle for the user when they want to read an artifact translated.',
    'EXCEPTION: tool names (Read, Write, Grep, AskUserQuestion, etc.) are part of the SDK protocol — never translate them.',
    '',
  ].join('\n');
}

export function currentLanguageFromEnv(): Language {
  const v = process.env.OFFICE_LANGUAGE;
  if (v === 'he' || v === 'es' || v === 'it' || v === 'de' || v === 'pt') return v;
  return 'en';
}
