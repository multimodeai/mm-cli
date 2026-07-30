import chalk from 'chalk';
import type { EvalResult } from './types.js';

type EffortLevel = 'low' | 'medium' | 'high' | 'max' | 'ultracode';
const EFFORT_ORDER: EffortLevel[] = ['low', 'medium', 'high', 'max', 'ultracode'];

const MANIFOLD_DIMS = ['selectiveTransfer', 'causalTransparency', 'creativeRerouting', 'degradationAwareness', 'outputCoherence'] as const;
const MANIFOLD_LABELS = ['Selective Transfer', 'Causal Transparency', 'Creative Rerouting', 'Degradation Aware', 'Output Coherence'];

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
      for (let i = 0; i < MANIFOLD_DIMS.length; i++) {
        const d = MANIFOLD_DIMS[i];
        const wv = withScenario.manifoldScore[d];
        const wov = withoutScenario.manifoldScore[d];
        const dd = wv - wov;
        const ddStr = dd > 0 ? chalk.green(`+${dd}`) : dd < 0 ? chalk.red(`${dd}`) : chalk.dim('0');

        lines.push(
          chalk.dim(
            padRight(`    ${MANIFOLD_LABELS[i]}`, 25) +
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

// ─────────────────────────────────────────────────────────────────────────────
// --by effort comparison: pivots N with-skill result files (one per effort)
// into a scenario × effort matrix and surfaces curve-bend inversions.
// ─────────────────────────────────────────────────────────────────────────────

interface BendFlag {
  scenario: string;
  fromEffort: EffortLevel;
  toEffort: EffortLevel;
  axis: 'total' | 'manifold' | typeof MANIFOLD_DIMS[number];
  delta: number;
}

/**
 * Group EvalResult[] by effort level. Falls back to 'medium' for results
 * missing the effort field (legacy result files from before --effort shipped).
 * If multiple files for same effort, the last one wins (caller should pre-sort).
 */
export function groupByEffort(results: EvalResult[]): Map<EffortLevel, EvalResult> {
  const grouped = new Map<EffortLevel, EvalResult>();
  for (const r of results) {
    const effort = (r.effort || 'medium') as EffortLevel;
    grouped.set(effort, r);
  }
  return grouped;
}

/**
 * Detect curve-bend inversions across efforts in canonical order.
 * Emits a BendFlag wherever score_next < score_prev (more effort → worse outcome).
 */
export function detectCurveBends(
  grouped: Map<EffortLevel, EvalResult>,
  efforts: EffortLevel[]
): BendFlag[] {
  const bends: BendFlag[] = [];
  // Walk scenarios across the effort sequence
  const present = efforts.filter(e => grouped.has(e));
  if (present.length < 2) return bends;
  const firstResult = grouped.get(present[0])!;
  for (const scenario of firstResult.scenarios) {
    for (let i = 1; i < present.length; i++) {
      const prev = grouped.get(present[i - 1])!.scenarios.find(s => s.scenario === scenario.scenario);
      const curr = grouped.get(present[i])!.scenarios.find(s => s.scenario === scenario.scenario);
      if (!prev || !curr) continue;
      // Total-quality bend
      const totalDelta = curr.qualityScore - prev.qualityScore;
      if (totalDelta < 0) {
        bends.push({
          scenario: scenario.scenario,
          fromEffort: present[i - 1],
          toEffort: present[i],
          axis: 'total',
          delta: totalDelta,
        });
      }
      // Manifold-total bend
      if (prev.manifoldTotal != null && curr.manifoldTotal != null) {
        const mDelta = curr.manifoldTotal - prev.manifoldTotal;
        if (mDelta < 0) {
          bends.push({
            scenario: scenario.scenario,
            fromEffort: present[i - 1],
            toEffort: present[i],
            axis: 'manifold',
            delta: mDelta,
          });
        }
      }
      // Per-axis bends (only if both have manifoldScore)
      if (prev.manifoldScore && curr.manifoldScore) {
        for (const dim of MANIFOLD_DIMS) {
          const axisDelta = curr.manifoldScore[dim] - prev.manifoldScore[dim];
          if (axisDelta < 0) {
            bends.push({
              scenario: scenario.scenario,
              fromEffort: present[i - 1],
              toEffort: present[i],
              axis: dim,
              delta: axisDelta,
            });
          }
        }
      }
    }
  }
  return bends;
}

/**
 * Top-level renderer for `mm eval compare <skill> --by effort`.
 * Takes N result files (one per effort), builds the scenario × effort matrix,
 * detects bends, returns a formatted multi-line string.
 */
export function compareByEffort(results: EvalResult[]): string {
  const lines: string[] = [];
  const grouped = groupByEffort(results);
  const presentEfforts = EFFORT_ORDER.filter(e => grouped.has(e));

  if (presentEfforts.length === 0) {
    return chalk.red('No effort-tagged result files found. Run `mm eval run <skill> --effort high` first.');
  }

  const suiteName = grouped.get(presentEfforts[0])!.suite;
  lines.push(chalk.bold.cyan(`\nEval Comparison by Effort: ${suiteName}`));
  lines.push(chalk.dim(`Efforts compared: ${presentEfforts.join(' → ')}`));
  lines.push(chalk.dim('─'.repeat(20 + presentEfforts.length * 13)));

  // Header row
  const scenarioColWidth = 35;
  const effortColWidth = 12;
  let header = padRight('Scenario', scenarioColWidth);
  for (const e of presentEfforts) header += padRight(e, effortColWidth);
  lines.push(chalk.bold(header));
  lines.push(chalk.dim('─'.repeat(20 + presentEfforts.length * 13)));

  // Scenario rows — pivot over the first result's scenarios as canonical list
  const firstResult = grouped.get(presentEfforts[0])!;
  for (const baseScenario of firstResult.scenarios) {
    // Score row (qualityScore, or VOID if canary missed)
    let scoreRow = padRight(truncate(baseScenario.scenario, scenarioColWidth - 1), scenarioColWidth);
    for (const e of presentEfforts) {
      const scenario = grouped.get(e)!.scenarios.find(s => s.scenario === baseScenario.scenario);
      if (!scenario) {
        scoreRow += padRight(chalk.dim('—'), effortColWidth);
      } else if (scenario.isVoid) {
        scoreRow += padRight(chalk.red.bold(`VOID(${scenario.qualityScore})`), effortColWidth);
      } else {
        scoreRow += padRight(`${scenario.qualityScore}`, effortColWidth);
      }
    }
    lines.push(scoreRow);

    // Manifold-total subrow (if any manifold scores present across efforts)
    const anyManifold = presentEfforts.some(e => {
      const s = grouped.get(e)!.scenarios.find(s => s.scenario === baseScenario.scenario);
      return s && s.manifoldTotal != null;
    });
    if (anyManifold) {
      let mRow = chalk.dim(padRight('  Manifold /15', scenarioColWidth));
      for (const e of presentEfforts) {
        const scenario = grouped.get(e)!.scenarios.find(s => s.scenario === baseScenario.scenario);
        if (!scenario || scenario.manifoldTotal == null) {
          mRow += padRight(chalk.dim('—'), effortColWidth);
        } else {
          mRow += padRight(chalk.dim(`${scenario.manifoldTotal}/15`), effortColWidth);
        }
      }
      lines.push(mRow);

      // Per-axis subrows
      for (let i = 0; i < MANIFOLD_DIMS.length; i++) {
        const dim = MANIFOLD_DIMS[i];
        let axisRow = chalk.dim(padRight(`    ${MANIFOLD_LABELS[i]}`, scenarioColWidth));
        for (const e of presentEfforts) {
          const scenario = grouped.get(e)!.scenarios.find(s => s.scenario === baseScenario.scenario);
          if (!scenario || !scenario.manifoldScore) {
            axisRow += padRight(chalk.dim('—'), effortColWidth);
          } else {
            axisRow += padRight(chalk.dim(`${scenario.manifoldScore[dim]}/3`), effortColWidth);
          }
        }
        lines.push(axisRow);
      }
    }
  }

  // Totals row
  lines.push(chalk.dim('─'.repeat(20 + presentEfforts.length * 13)));
  let totalRow = chalk.bold(padRight('TOTAL', scenarioColWidth));
  for (const e of presentEfforts) {
    const r = grouped.get(e)!;
    totalRow += padRight(`${r.totalScore}/${r.maxScore}`, effortColWidth);
  }
  lines.push(totalRow);

  // Bend detection
  const bends = detectCurveBends(grouped, presentEfforts);
  if (bends.length > 0) {
    lines.push('');
    lines.push(chalk.red.bold(`⚠ ${bends.length} curve bend(s) detected — more effort → worse outcome:`));
    for (const b of bends) {
      const axisLabel = b.axis === 'total' ? 'total quality'
        : b.axis === 'manifold' ? 'manifold total'
        : MANIFOLD_LABELS[MANIFOLD_DIMS.indexOf(b.axis as typeof MANIFOLD_DIMS[number])] || b.axis;
      lines.push(
        chalk.red(`  • ${truncate(b.scenario, 40)}`) +
        chalk.dim(` (${b.fromEffort} → ${b.toEffort}, ${axisLabel}: `) +
        chalk.red(`${b.delta > 0 ? '+' : ''}${b.delta}`) +
        chalk.dim(')')
      );
    }
  } else {
    lines.push('');
    lines.push(chalk.green('✓ No curve bends — quality monotonically increases (or stays flat) with effort.'));
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

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
