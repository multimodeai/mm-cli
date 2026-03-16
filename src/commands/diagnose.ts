import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { DIAGNOSE_QUICK, DIAGNOSE_DEEP, DIAGNOSE_HEALTH } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';

export function registerDiagnose(program: Command): void {
  program
    .command('diagnose')
    .description('Rapid diagnostic: score your AI workflow across 4 disciplines')
    .option('--deep', 'Deep diagnostic: 12-question interview with roadmap')
    .option('--health', 'Automated project health check: scores agent-readiness from codebase')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .option('--no-save', 'Print output to stdout only, do not save to file')
    .action(async (opts) => {
      const config = loadConfig();
      const template = opts.health ? DIAGNOSE_HEALTH : opts.deep ? DIAGNOSE_DEEP : DIAGNOSE_QUICK;

      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();
      const outputFile = opts.save !== false
        ? (opts.health ? 'HEALTH.md' : opts.deep ? 'DIAGNOSTIC.md' : 'CONTEXT.md')
        : undefined;

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
