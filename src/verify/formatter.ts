import chalk from 'chalk';
import type { VerifyResult } from './types.js';

export function formatVerifyResult(result: VerifyResult): string {
  const lines: string[] = [];
  const specName = result.specFile.replace(/\.md$/i, '').replace(/.*\//, '');

  lines.push(chalk.bold.cyan(`\nSpec Verification: ${specName}`));
  lines.push(chalk.cyan('══════════════════════════════════════════'));

  // Acceptance Criteria
  lines.push(chalk.bold('\nACCEPTANCE CRITERIA'));
  if (result.criteria.length === 0) {
    lines.push(chalk.dim('  No criteria extracted'));
  }
  for (let i = 0; i < result.criteria.length; i++) {
    const c = result.criteria[i];
    const icon = statusIcon(c.status);
    const conf = chalk.dim(`(${c.confidence} confidence)`);
    lines.push(`  ${icon} [${i + 1}] ${c.criterion}  ${conf}`);
    if (c.status !== 'met' && c.evidence) {
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

  // Summary
  lines.push(chalk.bold(`\nSUMMARY: ${result.summary.score}`));
  if (result.summary.partial > 0) {
    lines.push(chalk.dim(`  ${result.summary.partial} partial, ${result.summary.unclear} unclear`));
  }

  return lines.join('\n');
}

function statusIcon(status: string): string {
  switch (status) {
    case 'met': return chalk.green('✓');
    case 'not_met': return chalk.red('✗');
    case 'partial': return chalk.yellow('◐');
    case 'unclear': return chalk.dim('?');
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
