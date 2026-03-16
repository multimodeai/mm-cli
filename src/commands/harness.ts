import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { HARNESS_AUDIT, HARNESS_ROUTE, HARNESS_BRIEF, HARNESS_SECURITY } from '../engine/interview-templates.js';
import { runSpecVerify, formatVerifyResult, VERIFY_SYSTEM_PROMPT } from '../verify/index.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';
import { findProjectRoot, fileExists } from '../util/fs.js';

export function registerHarness(program: Command): void {
  const harness = program
    .command('harness')
    .description('Harness awareness: verify specs, audit lock-in, route tasks');

  // Subcommand 1: verify
  harness
    .command('verify [spec-file]')
    .description('Verify codebase against a specification')
    .option('--model <model>', 'Override Claude model')
    .option('--verbose', 'Show detailed evidence')
    .option('--json', 'Output raw JSON result')
    .option('--dry-run', 'Print system prompt without calling API')
    .action(async (specFile: string | undefined, opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      try {
        // Resolve spec file
        const resolvedSpec = resolveSpecFile(specFile);
        const specContent = readFileSync(resolvedSpec, 'utf-8');

        if (opts.dryRun) {
          console.log(chalk.yellow('\n--- DRY RUN ---'));
          console.log(chalk.dim('System prompt:'));
          console.log(VERIFY_SYSTEM_PROMPT);
          console.log(chalk.dim('\nSpec file: ' + resolvedSpec));
          console.log(chalk.dim('No API calls will be made.'));
          return;
        }

        console.log(chalk.bold.cyan('\nSpec Verification'));
        console.log(chalk.dim(`Verifying: ${resolvedSpec}`));
        console.log(chalk.dim('This may take a few minutes as Claude explores the codebase...\n'));

        const result = await runSpecVerify(specContent, client, resolvedSpec, {
          verbose: opts.verbose,
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatVerifyResult(result));
        }

        // Save result to verify/<spec-name>/<timestamp>.json
        const specName = basename(resolvedSpec, '.md');
        const projectRoot = findProjectRoot() || process.cwd();
        const verifyDir = join(projectRoot, 'verify', specName);
        mkdirSync(verifyDir, { recursive: true });
        const ts = result.timestamp.replace(/[:.]/g, '-');
        const outPath = join(verifyDir, `${ts}.json`);
        writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(chalk.green(`\n✓ Saved to ${outPath}`));
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      }
    });

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

function resolveSpecFile(specFile?: string): string {
  if (specFile) {
    const resolved = resolve(specFile);
    if (!fileExists(resolved)) {
      throw new Error(`Spec file not found: ${specFile}`);
    }
    return resolved;
  }

  // Look for SPEC.md in project root
  const projectRoot = findProjectRoot() || process.cwd();
  const specMd = join(projectRoot, 'SPEC.md');
  if (fileExists(specMd)) {
    return specMd;
  }

  // Check specs/ directory
  const specsDir = join(projectRoot, 'specs');
  if (fileExists(specsDir)) {
    try {
      const files = readdirSync(specsDir).filter(f => f.endsWith('.md'));
      if (files.length === 1) {
        return join(specsDir, files[0]);
      }
      if (files.length > 1) {
        throw new Error(
          `Multiple specs found in specs/. Specify which one:\n` +
          files.map(f => `  mm harness verify specs/${f}`).join('\n')
        );
      }
    } catch (err: any) {
      if (err.message.includes('Multiple specs')) throw err;
    }
  }

  throw new Error(
    'No spec file found. Provide a path or create SPEC.md:\n' +
    '  mm harness verify <spec-file>\n' +
    '  mm spec new'
  );
}
