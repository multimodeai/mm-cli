import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { writeArtifact } from '../engine/artifact-writer.js';  // still needed for --quick mode
import { EVAL_HARNESS } from '../engine/interview-templates.js';
import { loadEvalSuite, runEvalSuite } from '../eval/runner.js';
import { compareResults } from '../eval/comparator.js';
import { loadConfig, getApiKey, getTier, DEFAULT_MODEL } from '../util/config.js';
import { findProjectRoot, getSkillsDir } from '../util/fs.js';
import { readSkillMd } from '../skill/manager.js';

export function registerEval(program: Command): void {
  const evalCmd = program
    .command('eval')
    .description('Eval engine: create, run, and compare skill evaluations');

  evalCmd
    .command('new <skill>')
    .description('Create eval suite for a skill')
    .option('--quick', 'Auto-generate eval from SKILL.md without interview')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .action(async (skill: string, opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);

      if (opts.quick) {
        // Auto-generate eval from SKILL.md
        const root = findProjectRoot();
        if (!root) {
          console.error(chalk.red('Not in a project directory'));
          process.exit(1);
        }

        const skillContent = readSkillMd(root, skill);
        if (!skillContent) {
          console.error(chalk.red(`Skill "${skill}" not found. Create it with: mm skill new ${skill}`));
          process.exit(1);
        }

        const client = new ClaudeClient({
          apiKey,
          model: opts.model || config.model || DEFAULT_MODEL,
        });

        console.log(chalk.dim(`Generating eval suite from ${skill}/SKILL.md...`));

        const evalYaml = await client.send(
          `You generate eval YAML files. Given a SKILL.md file, produce a YAML eval suite with 3-5 test scenarios. Each scenario should have a prompt, context, expected_qualities (3-5), failure_modes (2-3), and scoring (excellent: 5, acceptable: 3, poor: 1). Include at least one constraint-shift scenario with manifold_dimensions. Output ONLY valid YAML, no explanation.`,
          [{
            role: 'user',
            content: `Generate an eval suite for this skill:\n\n${skillContent}\n\nSkill name: ${skill}\nSkill path: .claude/skills/${skill}/SKILL.md`,
          }],
          4096
        );

        writeArtifact(join('evals', skill, 'eval.yaml'), evalYaml);
        return;
      }

      // Interview mode
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const io = new StdinIO();

      try {
        await runInterview(EVAL_HARNESS, client, io, {
          dryRun: opts.dryRun,
          outputFile: join('evals', skill, 'eval.yaml'),
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

  evalCmd
    .command('run <skill>')
    .description('Run eval suite against Claude API')
    .option('--without-skill', 'Run baseline without SKILL.md loaded')
    .option('--model <model>', 'Override Claude model')
    .action(async (skill: string, opts) => {
      const config = loadConfig();
      const apiKey = getApiKey(config);
      const root = findProjectRoot();
      if (!root) {
        console.error(chalk.red('Not in a project directory'));
        process.exit(1);
      }

      const evalDir = join(root, 'evals', skill);
      let suite: ReturnType<typeof loadEvalSuite>;
      try {
        suite = loadEvalSuite(evalDir);
      } catch (err: any) {
        console.error(chalk.red(`✗ ${err.message}`));
        process.exit(1);
      }

      const model = opts.model || config.model || suite.model || DEFAULT_MODEL;
      const client = new ClaudeClient({ apiKey, model });
      const judgeClient = new ClaudeClient({
        apiKey,
        model: suite.judge || model,
      });

      try {
        const result = await runEvalSuite(suite, client, judgeClient, {
          withSkill: !opts.withoutSkill,
          projectRoot: root,
        });

        // Save results
        const resultsDir = join(evalDir, 'results');
        mkdirSync(resultsDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const suffix = opts.withoutSkill ? 'without-skill' : 'with-skill';
        const resultPath = join(resultsDir, `${ts}-${suffix}.json`);
        writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');

        console.log(chalk.green(`\n✓ Results saved to ${resultPath}`));
        console.log(chalk.bold(`Total: ${result.totalScore}/${result.maxScore}`));
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      }
    });

  evalCmd
    .command('compare <skill>')
    .description('Compare with-skill vs without-skill eval results')
    .action((skill: string) => {
      const root = findProjectRoot();
      if (!root) {
        console.error(chalk.red('Not in a project directory'));
        process.exit(1);
      }

      const resultsDir = join(root, 'evals', skill, 'results');
      if (!existsSync(resultsDir)) {
        console.error(chalk.red(`No results found. Run: mm eval run ${skill} && mm eval run ${skill} --without-skill`));
        process.exit(1);
      }

      const files = readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();
      const withSkillFile = files.filter(f => f.includes('with-skill') && !f.includes('without')).pop();
      const withoutSkillFile = files.filter(f => f.includes('without-skill')).pop();

      if (!withSkillFile || !withoutSkillFile) {
        console.error(chalk.red('Need both with-skill and without-skill results.'));
        console.error(chalk.dim(`Run: mm eval run ${skill} && mm eval run ${skill} --without-skill`));
        process.exit(1);
      }

      const withResult = JSON.parse(readFileSync(join(resultsDir, withSkillFile), 'utf-8'));
      const withoutResult = JSON.parse(readFileSync(join(resultsDir, withoutSkillFile), 'utf-8'));

      console.log(compareResults(withResult, withoutResult));
    });
}
