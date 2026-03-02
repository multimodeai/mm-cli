import { Command } from 'commander';
import chalk from 'chalk';
import { PREFLIGHT_TEMPLATE } from '../templates/index.js';

export function registerPreflight(program: Command): void {
  program
    .command('preflight')
    .description('Pre-flight checklist: 7 questions before your next AI prompt')
    .option('--save', 'Save checklist to PREFLIGHT.md')
    .action(async (opts) => {
      const content = PREFLIGHT_TEMPLATE;

      if (opts.save) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync('PREFLIGHT.md', content, 'utf-8');
        console.log(chalk.green('✓ Saved to PREFLIGHT.md'));
      } else {
        console.log(content);
      }
    });
}
