import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient, type EffortLevel } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { writeArtifact } from '../engine/artifact-writer.js';  // still needed for --quick mode
import { EVAL_HARNESS } from '../engine/interview-templates.js';
import { loadEvalSuite, runEvalSuite } from '../eval/runner.js';
import { compareResults, compareByEffort } from '../eval/comparator.js';
import { loadConfig, getApiKey, DEFAULT_MODEL } from '../util/config.js';
import { findProjectRoot, getSkillsDir } from '../util/fs.js';
import { readSkillMd } from '../skill/manager.js';

const VALID_EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'max', 'ultracode'];

function parseEffort(value: string | undefined): EffortLevel | undefined {
  if (!value) return undefined;
  if (!VALID_EFFORTS.includes(value as EffortLevel)) {
    throw new Error(`Invalid --effort "${value}". Use one of: ${VALID_EFFORTS.join(', ')}`);
  }
  return value as EffortLevel;
}

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
          extraContext: `Skill being evaluated: ${skill}\nSkill path: .claude/skills/${skill}/SKILL.md\nEval output: evals/${skill}/eval.yaml\n\nIMPORTANT: Use this exact skill path in the generated YAML "skill" field.`,
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
    .option('--judge <model>', 'Override judge model (default: eval.yaml judge or test model)')
    .option('--effort <level>', 'Reasoning effort for the model under test: low | medium | high | max | ultracode', 'medium')
    .option('--tool-set <set>', 'Tool-pruning ablation: pruned | full | bloated (overrides eval.yaml tool_set; only applies when enable_tools)')
    .action(async (skill: string, opts) => {
      const config = loadConfig();
      const apiKey = getApiKey(config);
      const root = findProjectRoot();
      if (!root) {
        console.error(chalk.red('Not in a project directory'));
        process.exit(1);
      }

      let effort: EffortLevel | undefined;
      try {
        effort = parseEffort(opts.effort);
      } catch (err: any) {
        console.error(chalk.red(`✗ ${err.message}`));
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

      // Tool-pruning ablation: --tool-set overrides the suite's tool_set per run.
      if (opts.toolSet) {
        const valid = ['pruned', 'full', 'bloated'];
        if (!valid.includes(opts.toolSet)) {
          console.error(chalk.red(`✗ Invalid --tool-set "${opts.toolSet}". Use: ${valid.join(', ')}`));
          process.exit(1);
        }
        suite.tool_set = opts.toolSet as 'pruned' | 'full' | 'bloated';
      }

      const model = opts.model || config.model || suite.model || DEFAULT_MODEL;
      const judgeModel = opts.judge || suite.judge || model;
      const client = new ClaudeClient({ apiKey, model, effort });
      // Judge stays at default (medium) effort — apples-to-apples scoring across runs
      const judgeClient = new ClaudeClient({
        apiKey,
        model: judgeModel,
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
        const effortTag = effort && effort !== 'medium' ? `-${effort}` : '';
        const toolSetTag = suite.tool_set ? `-${suite.tool_set}` : '';
        const suffix = opts.withoutSkill ? `without-skill${effortTag}${toolSetTag}` : `with-skill${effortTag}${toolSetTag}`;
        const resultPath = join(resultsDir, `${ts}-${suffix}.json`);
        writeFileSync(resultPath, JSON.stringify({ ...result, effort: effort || 'medium' }, null, 2), 'utf-8');

        console.log(chalk.green(`\n✓ Results saved to ${resultPath}`));
        console.log(chalk.bold(`Total: ${result.totalScore}/${result.maxScore}  (effort: ${effort || 'medium'})`));
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      }
    });

  evalCmd
    .command('compare <skill>')
    .description('Compare eval results — with vs without skill (default) or across effort levels')
    .option('--by <axis>', 'Comparison axis: skill (default) | effort', 'skill')
    .action((skill: string, opts) => {
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

      if (opts.by !== 'skill' && opts.by !== 'effort') {
        console.error(chalk.red(`Invalid --by "${opts.by}". Use: skill | effort`));
        process.exit(1);
      }

      const files = readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();

      // --by effort: read all with-skill result files, group by effort, render matrix
      if (opts.by === 'effort') {
        const withSkillFiles = files.filter(f => f.includes('with-skill') && !f.includes('without'));
        if (withSkillFiles.length === 0) {
          console.error(chalk.red(`No with-skill results found. Run: mm eval run ${skill} --effort medium`));
          process.exit(1);
        }
        // Dedupe latest-per-effort: parse each, group by effort (prefer body.effort, fall back to filename)
        const byEffort = new Map<string, { ts: string; result: any }>();
        for (const f of withSkillFiles) {
          const result = JSON.parse(readFileSync(join(resultsDir, f), 'utf-8'));
          const effort = result.effort
            || (f.match(/-with-skill-([a-z]+)\.json$/)?.[1])
            || 'medium';
          const ts = f.split('-with-skill')[0];
          const prev = byEffort.get(effort);
          if (!prev || ts > prev.ts) byEffort.set(effort, { ts, result });
        }
        const results = Array.from(byEffort.values()).map(v => v.result);
        if (results.length < 1) {
          console.error(chalk.red(`No effort-tagged result files. Run: mm eval run ${skill} --effort high`));
          process.exit(1);
        }
        console.log(compareByEffort(results));
        return;
      }

      // --by skill (default): existing with-skill vs without-skill compare
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
