import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'yaml';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { scoreScenario } from './scorer.js';
import type { EvalSuite, EvalResult, ScenarioResult } from './types.js';

export function loadEvalSuite(evalDir: string): EvalSuite {
  const yamlPath = join(evalDir, 'eval.yaml');
  if (!existsSync(yamlPath)) {
    throw new Error(`Eval suite not found: ${yamlPath}`);
  }
  const content = readFileSync(yamlPath, 'utf-8');
  return yaml.parse(content) as EvalSuite;
}

export async function runEvalSuite(
  suite: EvalSuite,
  client: ClaudeClient,
  judgeClient: ClaudeClient,
  options: { withSkill: boolean; projectRoot: string }
): Promise<EvalResult> {
  const results: ScenarioResult[] = [];
  let skillContent = '';

  if (options.withSkill && suite.skill) {
    const skillPath = join(options.projectRoot, suite.skill);
    if (existsSync(skillPath)) {
      skillContent = readFileSync(skillPath, 'utf-8');
    } else {
      console.warn(chalk.yellow(`⚠ Skill file not found: ${skillPath}`));
    }
  }

  console.log(chalk.bold.cyan(`\nRunning eval: ${suite.name}`));
  console.log(chalk.dim(`Model: ${client.getModel()}`));
  console.log(chalk.dim(`Mode: ${options.withSkill ? 'WITH skill' : 'WITHOUT skill'}`));
  console.log(chalk.dim(`Scenarios: ${suite.scenarios.length}\n`));

  for (const scenario of suite.scenarios) {
    console.log(chalk.dim(`  Running: ${scenario.name}...`));

    // Build system prompt with or without skill
    let systemPrompt = '';
    if (options.withSkill && skillContent) {
      systemPrompt = `You have the following skill loaded:\n\n${skillContent}\n\nUse this skill to guide your response.`;
    }

    // Build user message with prompt + context
    let userMessage = scenario.prompt;
    if (scenario.context) {
      userMessage = `Context:\n${scenario.context}\n\nTask:\n${scenario.prompt}`;
    }

    // If this is a constraint-shift scenario, include both base and shift
    if (scenario.constraint_change) {
      userMessage += `\n\nAdditional constraint:\n${scenario.constraint_change}`;
    }

    // Get response from Claude
    const response = await client.send(
      systemPrompt,
      [{ role: 'user', content: userMessage }],
      4096
    );

    // Score the response using Claude-as-judge
    const scored = await scoreScenario(scenario, response, judgeClient);
    results.push(scored);

    const scoreLabel = scored.qualityScore >= scenario.scoring.excellent
      ? chalk.green(`${scored.qualityScore}`)
      : scored.qualityScore >= scenario.scoring.acceptable
        ? chalk.yellow(`${scored.qualityScore}`)
        : chalk.red(`${scored.qualityScore}`);
    const manifoldLabel = scored.manifoldTotal != null ? ` | Multi-axis: ${scored.manifoldTotal}/15` : '';
    console.log(chalk.dim(`    Score: ${scoreLabel}/${scenario.scoring.excellent}${manifoldLabel}`));
  }

  const totalScore = results.reduce((sum, r) => sum + r.qualityScore, 0);
  const maxScore = suite.scenarios.reduce((sum, s) => sum + s.scoring.excellent, 0);

  return {
    suite: suite.name,
    skill: suite.skill,
    model: client.getModel(),
    withSkill: options.withSkill,
    timestamp: new Date().toISOString(),
    scenarios: results,
    totalScore,
    maxScore,
  };
}
