import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { REWRITE } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, getTier, DEFAULT_MODEL } from '../util/config.js';

export function registerRewrite(program: Command): void {
  program
    .command('rewrite [file]')
    .description('Rewrite vague requests into structured problem statements')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--save', 'Save output to REWRITE.md')
    .action(async (file: string | undefined, opts) => {
      const config = loadConfig();

      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();

      try {
        // Read initial input from file, piped stdin, or start interactive
        let initialInput: string | undefined;

        if (file) {
          initialInput = readFileSync(file, 'utf-8').trim();
          if (!initialInput) {
            console.error(chalk.red('✗ File is empty'));
            process.exit(1);
          }
        } else if (!process.stdin.isTTY) {
          // Piped input: echo "update the dashboard" | mm rewrite
          initialInput = await readStdin();
          if (!initialInput) {
            console.error(chalk.red('✗ No input received from stdin'));
            process.exit(1);
          }
        }

        await runInterview(REWRITE, client, io, {
          dryRun: opts.dryRun,
          initialInput,
          outputFile: opts.save ? 'REWRITE.md' : undefined,
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

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data.trim()); });
  });
}
