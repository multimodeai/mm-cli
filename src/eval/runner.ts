import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'yaml';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { resolveToolSet, DISTRACTOR_TOOL_NAMES } from '../engine/tools.js';
import { scoreScenario } from './scorer.js';
import type { EvalSuite, EvalResult, ScenarioResult, ToolUsageStats } from './types.js';

export function loadEvalSuite(evalDir: string): EvalSuite {
  const yamlPath = join(evalDir, 'eval.yaml');
  if (!existsSync(yamlPath)) {
    throw new Error(`Eval suite not found: ${yamlPath}`);
  }
  const content = readFileSync(yamlPath, 'utf-8');
  const parsed = yaml.parse(content);

  // Validate required fields
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid eval.yaml: expected YAML object, got ${typeof parsed}.\nRe-run: mm eval new <skill> --fresh`);
  }
  if (!parsed.name) {
    throw new Error('Invalid eval.yaml: missing "name" field.\nRe-run: mm eval new <skill> --fresh');
  }
  if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
    throw new Error('Invalid eval.yaml: missing or empty "scenarios" array.\nRe-run: mm eval new <skill> --fresh');
  }
  for (const [i, s] of parsed.scenarios.entries()) {
    if (!s.prompt) {
      throw new Error(`Invalid eval.yaml: scenario ${i + 1} missing "prompt".\nRe-run: mm eval new <skill> --fresh`);
    }
    if (!Array.isArray(s.expected_qualities) || s.expected_qualities.length === 0) {
      throw new Error(`Invalid eval.yaml: scenario "${s.name || i + 1}" missing "expected_qualities".\nRe-run: mm eval new <skill> --fresh`);
    }
    if (!s.scoring || typeof s.scoring.excellent !== 'number') {
      throw new Error(`Invalid eval.yaml: scenario "${s.name || i + 1}" missing "scoring.excellent".\nRe-run: mm eval new <skill> --fresh`);
    }
  }

  return parsed as EvalSuite;
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
  console.log(chalk.dim(`Judge: ${judgeClient.getModel()}`));
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

    // Get response from Claude — 64k max_tokens covers HTML/code deliverables in
    // benchmark scenarios. Effort modes layer extended-thinking budget on top.
    // For suites with enable_tools: true, use sendWithTools so the candidate can
    // read corpus files via read_file / list_files / search_files / etc.
    let response: string;
    let toolUsage: ToolUsageStats | undefined;
    if (suite.enable_tools) {
      const toolSet = suite.tool_set || 'full';
      const tools = resolveToolSet(toolSet);
      console.log(chalk.dim(`      tool_set: ${toolSet} (${tools.length} tools)`));
      const toolResult = await client.sendWithTools(
        systemPrompt || 'You are a precise analyst. Use the available codebase tools to read source materials before producing your deliverable.',
        [{ role: 'user', content: userMessage }],
        tools,
        (name) => console.log(chalk.dim(`      ↳ tool: ${name}`)),
        64000,
        80  // higher tool-loop cap for corpus-heavy benchmarks
      );
      response = toolResult.text;

      // Tool-pruning ablation instrumentation: compute wrong-tool-selection
      // rate and step count from the captured tool-call log.
      const callSequence = toolResult.toolCalls.map((c) => c.name);
      const callCounts: Record<string, number> = {};
      let distractorCalls = 0;
      for (const name of callSequence) {
        callCounts[name] = (callCounts[name] || 0) + 1;
        if (DISTRACTOR_TOOL_NAMES.has(name)) distractorCalls++;
      }
      const totalCalls = callSequence.length;
      toolUsage = {
        toolSet,
        totalCalls,
        distractorCalls,
        wrongToolRate: totalCalls > 0 ? distractorCalls / totalCalls : 0,
        callSequence,
        callCounts,
      };
      console.log(
        chalk.dim(
          `      tool calls: ${totalCalls} | distractor: ${distractorCalls} | wrong-tool rate: ${(toolUsage.wrongToolRate * 100).toFixed(1)}%`
        )
      );
    } else {
      response = await client.send(
        systemPrompt,
        [{ role: 'user', content: userMessage }],
        64000
      );
    }

    // Score the response using Claude-as-judge
    const scored = await scoreScenario(scenario, response, judgeClient);
    if (toolUsage) scored.toolUsage = toolUsage;
    results.push(scored);

    const scoreLabel = scored.isVoid
      ? chalk.red.bold('VOID')
      : scored.qualityScore >= scenario.scoring.excellent
        ? chalk.green(`${scored.qualityScore}`)
        : scored.qualityScore >= scenario.scoring.acceptable
          ? chalk.yellow(`${scored.qualityScore}`)
          : chalk.red(`${scored.qualityScore}`);
    const manifoldLabel = scored.manifoldTotal != null ? ` | Multi-axis: ${scored.manifoldTotal}/15` : '';
    const voidNote = scored.isVoid ? chalk.dim(` (canary missed; raw: ${scored.qualityScore}/${scenario.scoring.excellent})`) : '';
    console.log(chalk.dim(`    Score: ${scoreLabel}${scored.isVoid ? '' : '/' + scenario.scoring.excellent}${manifoldLabel}${voidNote}`));
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
