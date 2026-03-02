import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { SPEC_NEW } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, getTier, DEFAULT_MODEL } from '../util/config.js';

export function registerSpec(program: Command): void {
  const spec = program
    .command('spec')
    .description('Specification engineering');

  spec
    .command('new [name]')
    .description('3-phase interview to build a specification')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .action(async (name: string | undefined, opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();
      const outputFile = name ? join('specs', `${name}.md`) : 'SPEC.md';

      try {
        await runInterview(SPEC_NEW, client, io, {
          dryRun: opts.dryRun,
          outputFile,
          fresh: opts.fresh,
          tier: getTier(config),
        });
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });
}
