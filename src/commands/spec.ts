import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { runLavishReview } from '../engine/lavish-review.js';
import { SPEC_NEW, SPEC_QA, SPEC_DECOMPOSE } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';
import { registerVerifyCommand } from '../verify/command.js';

const SPEC_TYPES: Record<string, typeof SPEC_NEW> = {
  default: SPEC_NEW,
  qa: SPEC_QA,
  decompose: SPEC_DECOMPOSE,
};

export function registerSpec(program: Command): void {
  const spec = program
    .command('spec')
    .description('Specification engineering: author specs, verify code against them');

  // `mm spec verify` — the real home for spec-conformance verification.
  registerVerifyCommand(spec);

  spec
    .command('new [name]')
    .description('default type: one-shot spec + Lavish review. --type qa/decompose: unchanged multi-phase interview')
    .option('--model <model>', 'Override Claude model')
    .option('--type <type>', 'Spec type: default, qa, decompose', 'default')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .option('--no-review', 'Skip the Lavish review step after generation (default type only)')
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

      // Only the default type (SPEC_NEW) is one-shot + Lavish. qa/decompose keep
      // their own existing multi-phase interactive interviews, unchanged.
      const isOneShot = opts.type === 'default';

      try {
        let initialInput: string | undefined;
        if (isOneShot && !opts.dryRun) {
          console.log(chalk.bold.cyan(`\n${template.name}`));
          console.log(chalk.dim(template.description));
          console.log(chalk.dim('Describe the whole project in one message — the full picture, however long. No back-and-forth: the spec comes straight back, then you review and refine it in Lavish.\n'));
          initialInput = await io.prompt();
        }

        const result = await runInterview(template, client, io, {
          dryRun: opts.dryRun,
          outputFile,
          fresh: opts.fresh,
          initialInput,
        });

        if (isOneShot && !opts.dryRun && opts.review !== false && result.artifact) {
          await runLavishReview(outputFile, client, template.artifactStartMarker);
        }
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });
}
