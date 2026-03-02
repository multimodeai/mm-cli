import chalk from 'chalk';
import type { EvalResult } from './types.js';

export function compareResults(withSkill: EvalResult, withoutSkill: EvalResult): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan(`\nEval Comparison: ${withSkill.suite}`));
  lines.push(chalk.dim('─'.repeat(70)));

  // Header
  lines.push(
    padRight('Scenario', 25) +
    padRight('Without Skill', 15) +
    padRight('With Skill', 15) +
    padRight('Delta', 10)
  );
  lines.push(chalk.dim('─'.repeat(70)));

  // Per-scenario comparison
  for (const withScenario of withSkill.scenarios) {
    const withoutScenario = withoutSkill.scenarios.find(
      s => s.scenario === withScenario.scenario
    );

    if (!withoutScenario) continue;

    const delta = withScenario.qualityScore - withoutScenario.qualityScore;
    const deltaStr = delta > 0 ? chalk.green(`+${delta}`) : delta < 0 ? chalk.red(`${delta}`) : chalk.dim('0');

    lines.push(
      padRight(withScenario.scenario, 25) +
      padRight(`${withoutScenario.qualityScore}`, 15) +
      padRight(`${withScenario.qualityScore}`, 15) +
      padRight(deltaStr, 10)
    );

    // Manifold comparison if present
    if (withScenario.manifoldScore && withoutScenario.manifoldScore) {
      const mDelta = (withScenario.manifoldTotal || 0) - (withoutScenario.manifoldTotal || 0);
      const mDeltaStr = mDelta > 0 ? chalk.green(`+${mDelta}`) : mDelta < 0 ? chalk.red(`${mDelta}`) : chalk.dim('0');

      lines.push(
        chalk.dim(
          padRight('  Manifold', 25) +
          padRight(`${withoutScenario.manifoldTotal}/15`, 15) +
          padRight(`${withScenario.manifoldTotal}/15`, 15) +
          padRight(mDeltaStr, 10)
        )
      );

      // Per-dimension breakdown
      const dims = ['selectiveTransfer', 'causalTransparency', 'creativeRerouting', 'degradationAwareness', 'outputCoherence'] as const;
      const dimLabels = ['Selective Transfer', 'Causal Transparency', 'Creative Rerouting', 'Degradation Aware', 'Output Coherence'];

      for (let i = 0; i < dims.length; i++) {
        const d = dims[i];
        const wv = withScenario.manifoldScore[d];
        const wov = withoutScenario.manifoldScore[d];
        const dd = wv - wov;
        const ddStr = dd > 0 ? chalk.green(`+${dd}`) : dd < 0 ? chalk.red(`${dd}`) : chalk.dim('0');

        lines.push(
          chalk.dim(
            padRight(`    ${dimLabels[i]}`, 25) +
            padRight(`${wov}/3`, 15) +
            padRight(`${wv}/3`, 15) +
            padRight(ddStr, 10)
          )
        );
      }
    }
  }

  // Totals
  lines.push(chalk.dim('─'.repeat(70)));
  const totalDelta = withSkill.totalScore - withoutSkill.totalScore;
  const totalDeltaStr = totalDelta > 0
    ? chalk.green.bold(`+${totalDelta}`)
    : totalDelta < 0
      ? chalk.red.bold(`${totalDelta}`)
      : chalk.dim('0');

  lines.push(
    chalk.bold(padRight('TOTAL', 25)) +
    padRight(`${withoutSkill.totalScore}/${withoutSkill.maxScore}`, 15) +
    padRight(`${withSkill.totalScore}/${withSkill.maxScore}`, 15) +
    padRight(totalDeltaStr, 10)
  );

  // Improvement ratio
  if (withoutSkill.totalScore > 0) {
    const ratio = withSkill.totalScore / withoutSkill.totalScore;
    lines.push('');
    lines.push(
      chalk.bold(`Improvement ratio: ${ratio.toFixed(2)}x`) +
      (ratio >= 1.5 ? chalk.green(' (significant)') :
       ratio >= 1.1 ? chalk.yellow(' (moderate)') :
       ratio <= 0.9 ? chalk.red(' (regression!)') :
       chalk.dim(' (neutral)'))
    );
  }

  lines.push('');
  return lines.join('\n');
}

function padRight(str: string, width: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return str + ' '.repeat(padding);
}
