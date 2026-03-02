import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { INTENT_INIT } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, getTier, DEFAULT_MODEL } from '../util/config.js';

export function registerIntent(program: Command): void {
  const intent = program
    .command('intent')
    .description('Intent & delegation engineering');

  intent
    .command('init')
    .description('3-phase interview to build INTENT.md')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .option('-o, --output <file>', 'Output file path', 'INTENT.md')
    .action(async (opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();

      try {
        await runInterview(INTENT_INIT, client, io, {
          dryRun: opts.dryRun,
          outputFile: opts.output,
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
