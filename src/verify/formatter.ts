import chalk from 'chalk';
import type { VerifyResult, VerifyCriterion } from './types.js';

export function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];
  const specName = result.specFile.replace(/\.md$/i, '').replace(/.*\//, '');

  lines.push(chalk.bold.cyan(`\nSpec Verification: ${specName}`));
  lines.push(chalk.cyan('══════════════════════════════════════════'));

  if (!result.summary.checksRan) {
    lines.push(chalk.yellow('  ⚠ JUDGE-ONLY run — no check manifest, nothing executed. Verdicts are static opinion, not proof.'));
    lines.push(chalk.dim(`     Add verify/checks/${specName}.sh to make this provable and repeatable.`));
  }

  // Acceptance Criteria
  lines.push(chalk.bold('\nACCEPTANCE CRITERIA'));
  if (result.criteria.length === 0) {
    lines.push(chalk.dim('  No criteria extracted'));
  }
  for (let i = 0; i < result.criteria.length; i++) {
    const c = result.criteria[i];
    const icon = statusIcon(c.status);
    const tier = tierLabel(c);
    lines.push(`  ${icon} [${i + 1}] ${c.criterion}  ${tier}`);
    // Always show evidence for non-proven-met so the basis is visible.
    if (!(c.status === 'met' && c.source === 'executed') && c.evidence) {
      lines.push(chalk.dim(`      → ${c.evidence}`));
    }
  }

  // Constraints
  if (result.constraints.length > 0) {
    lines.push(chalk.bold('\nCONSTRAINTS'));
    for (const c of result.constraints) {
      const icon = constraintIcon(c.status);
      const typeLabel = c.type.replace('_', ' ').toUpperCase();
      lines.push(`  ${icon} ${typeLabel}: ${c.constraint}`);
      if (c.status === 'violated' && c.evidence) {
        lines.push(chalk.dim(`      → ${c.evidence}`));
      }
    }
  }

  // Definition of Done
  lines.push(chalk.bold('\nDEFINITION OF DONE'));
  if (result.definitionOfDone.met) {
    lines.push(chalk.green(`  ✓ Met — ${result.definitionOfDone.reasoning}`));
  } else {
    lines.push(chalk.red(`  ✗ Not met — ${result.definitionOfDone.reasoning}`));
  }

  // Summary — lead with PROVEN vs judged so the honesty tier is unmissable.
  lines.push(chalk.bold(`\nSUMMARY: ${result.summary.score}`));
  const s = result.summary;
  const details: string[] = [];
  if (s.proven > 0) details.push(chalk.green(`${s.proven} proven`));
  if (s.failed > 0) details.push(chalk.red(`${s.failed} FAILED`));
  if (s.judged > 0) details.push(chalk.yellow(`${s.judged} judged (static)`));
  if (s.partial > 0) details.push(`${s.partial} partial`);
  if (s.unclear > 0) details.push(`${s.unclear} unclear`);
  if (s.unverifiable > 0) details.push(chalk.blue(`${s.unverifiable} unproven (runtime-only)`));
  if (details.length > 0) {
    lines.push(`  ${details.join(chalk.dim(' · '))}`);
  }

  if (s.checksRan && s.judged > 0) {
    lines.push('');
    lines.push(chalk.yellow(`  ℹ ${s.judged} criteria are only JUDGED (an LLM read the code). Add executed checks to prove them.`));
  }

  return lines.join('\n');
}

/** A short tier badge so PROVEN vs judged reads at a glance. */
function tierLabel(c: VerifyCriterion): string {
  if (c.source === 'executed' && c.status === 'met') return chalk.green('[PROVEN]');
  if (c.source === 'executed' && c.status === 'not_met') return chalk.red('[FAILED check]');
  if (c.source === 'unverified' || c.status === 'unverifiable') return chalk.blue('[unproven — needs runtime]');
  return chalk.yellow(`[judged · ${c.confidence}]`);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'met': return chalk.green('✓');
    case 'not_met': return chalk.red('✗');
    case 'partial': return chalk.yellow('◐');
    case 'unclear': return chalk.dim('?');
    case 'unverifiable': return chalk.blue('⊘');
    default: return chalk.dim('?');
  }
}

function constraintIcon(status: string): string {
  switch (status) {
    case 'satisfied': return chalk.green('✓');
    case 'violated': return chalk.red('✗');
    case 'not_assessed': return chalk.yellow('⚠');
    default: return chalk.dim('?');
  }
}
