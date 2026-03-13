import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { HARNESS_AUDIT, HARNESS_ROUTE, HARNESS_BRIEF } from '../engine/interview-templates.js';
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
        await runInterview(HARNESS_AUDIT, client, io, {
          dryRun: opts.dryRun,
          outputFile: 'HARNESS-AUDIT.md',
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

  // Subcommand 4: attest
  harness
    .command('attest [spec-file]')
    .description('Create a runtime evidence file for criteria that cannot be verified via source code')
    .action(async (specFile: string | undefined) => {
      try {
        const resolvedSpec = resolveSpecFile(specFile);
        const specName = basename(resolvedSpec, '.md');
        const projectRoot = findProjectRoot() || process.cwd();
        const evidenceDir = join(projectRoot, 'verify', 'evidence');
        const evidencePath = join(evidenceDir, `${specName}.md`);

        if (fileExists(evidencePath)) {
          console.log(chalk.yellow(`\nEvidence file already exists: ${evidencePath}`));
          console.log(chalk.dim('Edit it to update your runtime verification evidence.'));
          return;
        }

        // Read spec and extract acceptance criteria
        const specContent = readFileSync(resolvedSpec, 'utf-8');
        const criteriaLines: string[] = [];
        const criteriaRegex = /^\s*(?:[-*]|\d+[.)]) ?\[?\d*\]?\s*(.+)/gm;
        let inCriteria = false;
        for (const line of specContent.split('\n')) {
          if (/acceptance\s+criteria/i.test(line)) {
            inCriteria = true;
            continue;
          }
          if (inCriteria && /^#{1,3}\s/.test(line) && !/acceptance/i.test(line)) {
            inCriteria = false;
          }
          if (inCriteria) {
            const match = line.match(/^\s*(?:[-*]|\d+[.)]) ?\[?\d*\]?\s*(.+)/);
            if (match) {
              criteriaLines.push(match[1].trim());
            }
          }
        }

        // Generate template
        const template = [
          `# Runtime Evidence: ${specName}`,
          ``,
          `> This file provides runtime verification evidence for criteria that`,
          `> cannot be verified via source code analysis alone.`,
          `> Run \`mm harness verify ${basename(resolvedSpec)}\` after filling this in.`,
          ``,
          `**Verified by:** [Your name]`,
          `**Date:** ${new Date().toISOString().split('T')[0]}`,
          `**Environment:** [e.g., production, staging, local]`,
          ``,
          `## Criteria Evidence`,
          ``,
        ];

        if (criteriaLines.length > 0) {
          for (let i = 0; i < criteriaLines.length; i++) {
            template.push(`### [${i + 1}] ${criteriaLines[i]}`);
            template.push(``);
            template.push(`- **Status:** [ ] verified  [ ] failed  [ ] skipped`);
            template.push(`- **Evidence:** <!-- Describe what you observed, paste output, attach screenshots -->`);
            template.push(`- **Command/method:** <!-- How you verified this -->`);
            template.push(``);
          }
        } else {
          template.push(`<!-- Could not auto-extract criteria. Add your evidence below: -->`);
          template.push(``);
          template.push(`### Criterion`);
          template.push(`- **Status:** [ ] verified  [ ] failed  [ ] skipped`);
          template.push(`- **Evidence:**`);
          template.push(``);
        }

        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(evidencePath, template.join('\n'), 'utf-8');
        console.log(chalk.green(`\n✓ Created evidence template: ${evidencePath}`));
        console.log(chalk.dim('Fill in the runtime verification evidence, then re-run:'));
        const relSpec = resolvedSpec.startsWith(projectRoot) ? resolvedSpec.slice(projectRoot.length + 1) : basename(resolvedSpec);
        console.log(chalk.dim(`  mm harness verify ${relSpec}`));
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      }
    });

  // Subcommand 5: brief
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
