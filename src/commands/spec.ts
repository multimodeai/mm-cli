import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { SPEC_NEW, SPEC_QA } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';

const SPEC_TYPES: Record<string, typeof SPEC_NEW> = {
  default: SPEC_NEW,
  qa: SPEC_QA,
};

export function registerSpec(program: Command): void {
  const spec = program
    .command('spec')
    .description('Specification engineering');

  spec
    .command('new [name]')
    .description('3-phase interview to build a specification')
    .option('--model <model>', 'Override Claude model')
    .option('--type <type>', 'Spec type: default, qa', 'default')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .action(async (name: string | undefined, opts) => {
      const template = SPEC_TYPES[opts.type];
      if (!template) {
        console.error(chalk.red(`Unknown spec type: ${opts.type}. Available: ${Object.keys(SPEC_TYPES).join(', ')}`));
        process.exit(1);
      }

      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();
      const defaultFile = template.outputFile || 'SPEC.md';
      const outputFile = name ? join('specs', `${name}.md`) : defaultFile;

      try {
        await runInterview(template, client, io, {
          dryRun: opts.dryRun,
          outputFile,
          fresh: opts.fresh,
        });
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });
}
