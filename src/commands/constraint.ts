import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { CONSTRAINT_DESIGNER } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, getTier, DEFAULT_MODEL } from '../util/config.js';

export function registerConstraint(program: Command): void {
  program
    .command('constraint <task>')
    .description('3-phase constraint architecture interview')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .action(async (task: string, opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();
      const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      try {
        await runInterview(CONSTRAINT_DESIGNER, client, io, {
          dryRun: opts.dryRun,
          outputFile: join('constraints', `${slug}.md`),
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
