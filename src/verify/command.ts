import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient, type EffortLevel } from '../engine/claude-client.js';
import { runSpecVerify, formatVerifyResult, VERIFY_SYSTEM_PROMPT } from './index.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';
import { findProjectRoot, fileExists } from '../util/fs.js';

function parseEffort(value: string | undefined): EffortLevel | undefined {
  if (!value) return undefined;
  const allowed = ['low', 'medium', 'high', 'max', 'ultracode'];
  if (!allowed.includes(value)) {
    throw new Error(`Invalid --effort "${value}". Use one of: ${allowed.join(', ')}`);
  }
  return value as EffortLevel;
}

/**
 * Resolve the spec file: an explicit path, else SPEC.md, else the sole file in specs/.
 */
export function resolveSpecFile(specFile?: string): string {
  if (specFile) {
    const resolved = resolve(specFile);
    if (!fileExists(resolved)) {
      throw new Error(`Spec file not found: ${specFile}`);
    }
    return resolved;
  }

  const projectRoot = findProjectRoot() || process.cwd();
  const specMd = join(projectRoot, 'SPEC.md');
  if (fileExists(specMd)) return specMd;

  const specsDir = join(projectRoot, 'specs');
  if (fileExists(specsDir)) {
    try {
      const files = readdirSync(specsDir).filter(f => f.endsWith('.md'));
      if (files.length === 1) return join(specsDir, files[0]);
      if (files.length > 1) {
        throw new Error(
          `Multiple specs found in specs/. Specify which one:\n` +
          files.map(f => `  mm spec verify specs/${f}`).join('\n'),
        );
      }
    } catch (err: any) {
      if (err.message.includes('Multiple specs')) throw err;
    }
  }

  throw new Error(
    'No spec file found. Provide a path or create SPEC.md:\n' +
    '  mm spec verify <spec-file>\n' +
    '  mm spec new',
  );
}

/**
 * Register the `verify` subcommand under a parent command. Used by `mm spec`
 * (primary) and `mm harness` (deprecated alias that forwards here).
 */
export function registerVerifyCommand(parent: Command, opts?: { deprecated?: boolean }): void {
  const cmd = parent
    .command('verify [spec-file]')
    .description(
      opts?.deprecated
        ? '(deprecated — use `mm spec verify`) Verify a codebase against a specification'
        : 'Verify a codebase against a specification: run executable checks, then judge the rest',
    )
    .option('--model <model>', 'Override Claude model')
    .option('--verbose', 'Show detailed evidence')
    .option('--json', 'Output raw JSON result')
    .option('--dry-run', 'Print system prompt without calling API')
    .option('--checks <path>', 'Path to an executable check manifest (default: verify/checks/<spec>.sh)')
    .option('--judge-only', 'Skip executable checks; static LLM judgement only (clearly labelled unproven)')
    .option('--effort <level>', 'Reasoning effort: low | medium | high | max | ultracode', 'medium');

  cmd.action(async (specFile: string | undefined, options) => {
    if (opts?.deprecated) {
      console.error(chalk.yellow('  ⚠ `mm harness verify` is deprecated — use `mm spec verify` (same flags).'));
    }

    const config = loadConfig();
    const apiKey = options.dryRun ? 'dry-run' : getApiKey(config);

    let effort: EffortLevel | undefined;
    try {
      effort = parseEffort(options.effort);
    } catch (err: any) {
      console.error(chalk.red(`✗ ${err.message}`));
      process.exit(1);
    }

    const client = new ClaudeClient({
      apiKey,
      model: options.model || config.model || DEFAULT_MODEL,
      effort,
    });

    try {
      const resolvedSpec = resolveSpecFile(specFile);
      const specContent = readFileSync(resolvedSpec, 'utf-8');
      const projectRoot = findProjectRoot() || process.cwd();

      if (options.dryRun) {
        console.log(chalk.yellow('\n--- DRY RUN ---'));
        console.log(chalk.dim('System prompt:'));
        console.log(VERIFY_SYSTEM_PROMPT);
        console.log(chalk.dim('\nSpec file: ' + resolvedSpec));
        console.log(chalk.dim('No API calls will be made.'));
        return;
      }

      console.log(chalk.bold.cyan('\nSpec Verification'));
      console.log(chalk.dim(`Verifying: ${resolvedSpec}`));
      console.log(chalk.dim('Executable checks run first (if any), then Claude judges the rest...\n'));

      const result = await runSpecVerify(specContent, client, resolvedSpec, {
        verbose: options.verbose,
        checksPath: options.checks,
        projectRoot,
        noChecks: options.judgeOnly,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatVerifyResult(result));
      }

      const specName = basename(resolvedSpec, '.md');
      const verifyDir = join(projectRoot, 'verify', specName);
      mkdirSync(verifyDir, { recursive: true });
      const ts = result.timestamp.replace(/[:.]/g, '-');
      const outPath = join(verifyDir, `${ts}.json`);
      writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(chalk.green(`\n✓ Saved to ${outPath}`));

      // Exit non-zero when the spec is not done, so CI can gate on it.
      if (!result.definitionOfDone.met || result.summary.failed > 0) {
        process.exitCode = 1;
      }
    } catch (err: any) {
      console.error(chalk.red(`\n✗ ${err.message}`));
      process.exit(1);
    }
  });
}
