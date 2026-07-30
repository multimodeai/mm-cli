import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { HARNESS_AUDIT, HARNESS_ROUTE, HARNESS_BRIEF, HARNESS_SECURITY } from '../engine/interview-templates.js';
import { registerVerifyCommand } from '../verify/command.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';

export function registerHarness(program: Command): void {
  const harness = program
    .command('harness')
    .description('Harness awareness: verify specs, audit lock-in, route tasks');

  // Subcommand 1: verify — deprecated alias. The real home is `mm spec verify`.
  registerVerifyCommand(harness, { deprecated: true });

  // Subcommand 2: audit
  harness
    .command('audit')
    .description('Audit your harness lock-in across 5 divergence dimensions')
    .option('--model <model>', 'Override Claude model')
    .option('--security', 'Security & resilience audit instead of lock-in audit')
    .option('--dry-run', 'Print system prompt without calling API')
    .action(async (opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });
      const io = new StdinIO();
      const template = opts.security ? HARNESS_SECURITY : HARNESS_AUDIT;
      const outputFile = opts.security ? 'SECURITY-AUDIT.md' : 'HARNESS-AUDIT.md';

      try {
        await runInterview(template, client, io, {
          dryRun: opts.dryRun,
          outputFile,
        });
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });

  // Subcommand 3: route
  harness
    .command('route')
    .description('Get a routing recommendation for a specific task')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print system prompt without calling API')
    .action(async (opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });
      const io = new StdinIO();

      try {
        await runInterview(HARNESS_ROUTE, client, io, {
          dryRun: opts.dryRun,
        });
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });

  // Subcommand 4: brief
  harness
    .command('brief')
    .description('Generate a one-page Architecture Decision Brief for leadership')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print system prompt without calling API')
    .action(async (opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });
      const io = new StdinIO();

      try {
        await runInterview(HARNESS_BRIEF, client, io, {
          dryRun: opts.dryRun,
          outputFile: 'HARNESS-BRIEF.md',
        });
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });
}
