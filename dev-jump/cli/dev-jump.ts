#!/usr/bin/env tsx
import { Command } from 'commander';
import { SeedEngine } from '../engine/seed-engine';
import { ACT_MANIFEST } from '../engine/act-manifest';
import { ALL_JUMP_TARGETS, type JumpTarget } from '../engine/types';
import { writeModeFlag } from '../mock/mode-flag'; // wired in Task 24; falls back gracefully until then

const program = new Command();
program
  .name('dev:jump')
  .description('Seed the dev project to a specific act and launch it')
  .argument('<target>', `Jump target (one of: ${ALL_JUMP_TARGETS.join(', ')})`)
  .option('--mock', 'Use mocked agents instead of real LLM')
  .option('--force', 'Allow a non-standard project dir (use --project-dir)')
  .option('--project-dir <dir>', 'Target project directory (requires --force)')
  .action((target: string, opts: { mock?: boolean; force?: boolean; projectDir?: string }) => {
    if (!ALL_JUMP_TARGETS.includes(target as JumpTarget)) {
      console.error(`Unknown target: ${target}`);
      console.error(`Valid targets:\n  ${ALL_JUMP_TARGETS.join('\n  ')}`);
      process.exit(2);
    }

    const result = SeedEngine.seed({
      target: target as JumpTarget,
      mode: opts.mock ? 'mock' : 'real',
      projectDir: opts.projectDir,
      force: opts.force,
    });

    // Write mode flag so Electron picks it up at project-open time.
    try {
      writeModeFlag(result.projectDir, opts.mock ? 'mock' : 'real');
    } catch (err) {
      console.warn('[dev-jump] Could not write mode flag (mock-mode wiring not yet in place):', err);
    }

    const act = ACT_MANIFEST[target as JumpTarget];
    console.log(`\n✓ Seeded for ${act.displayName} (${opts.mock ? 'MOCK' : 'REAL'} mode)`);
    console.log(`  Project: ${result.projectDir}`);
    console.log(`  Next: open this project in the Office app and press Start.`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
