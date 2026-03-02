import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { findProjectRoot } from '../util/fs.js';
import { table } from '../util/format.js';
import { createSkill, listSkills } from '../skill/manager.js';
import { validateSkill, validateAllSkills } from '../skill/validator.js';
import { exportSkills, getOutputFilename, type ExportFormat } from '../skill/exporter.js';
import { SKILL_SCAFFOLD_MD, TILE_SCAFFOLD_JSON } from '../templates/index.js';

function requireProjectRoot(): string {
  const root = findProjectRoot();
  if (!root) {
    console.error(chalk.red('Not in a project directory (no .git, package.json, or CLAUDE.md found)'));
    process.exit(1);
  }
  return root;
}

export function registerSkill(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage skills (.claude/skills/)');

  skill
    .command('new <name>')
    .description('Create a new skill scaffold')
    .action((name: string) => {
      const root = requireProjectRoot();
      const scaffoldMd = SKILL_SCAFFOLD_MD;
      const scaffoldJson = TILE_SCAFFOLD_JSON;

      try {
        const skillDir = createSkill(root, name, scaffoldMd, scaffoldJson);
        console.log(chalk.green(`✓ Created skill "${name}"`));
        console.log(chalk.dim(`  ${skillDir}/SKILL.md`));
        console.log(chalk.dim(`  ${skillDir}/tile.json`));
        console.log(`\nEdit ${chalk.bold('SKILL.md')} to define the skill, then run ${chalk.cyan('mm skill validate ' + name)} to check it.`);
      } catch (err: any) {
        console.error(chalk.red(`✗ ${err.message}`));
        process.exit(1);
      }
    });

  skill
    .command('list')
    .description('List all skills in the current project')
    .action(() => {
      const root = requireProjectRoot();
      const skills = listSkills(root);

      if (skills.length === 0) {
        console.log(chalk.dim('No skills found. Create one with: mm skill new <name>'));
        return;
      }

      const rows = skills.map(s => [
        s.name,
        s.version || '-',
        s.hasSkillMd ? chalk.green('✓') : chalk.red('✗'),
        s.hasTileJson ? chalk.green('✓') : chalk.red('✗'),
        (s.triggers || []).join(', ') || '-',
      ]);

      console.log(table(
        ['Name', 'Version', 'SKILL.md', 'tile.json', 'Triggers'],
        rows,
      ));
    });

  skill
    .command('validate [name]')
    .description('Validate skill structure and content')
    .action((name?: string) => {
      const root = requireProjectRoot();

      if (name) {
        const issues = validateSkill(root, name);
        printValidationResults(name, issues);
      } else {
        const allResults = validateAllSkills(root);
        if (allResults.size === 0) {
          console.log(chalk.dim('No skills found. Create one with: mm skill new <name>'));
          return;
        }
        for (const [skillName, issues] of allResults) {
          printValidationResults(skillName, issues);
        }
      }
    });

  skill
    .command('export')
    .description('Export skills to other formats (cursor, windsurf)')
    .option('--format <format>', 'Output format: cursor, windsurf, merged', 'cursor')
    .action((opts) => {
      const root = requireProjectRoot();
      const format = opts.format as ExportFormat;

      try {
        const output = exportSkills(root, format);
        const filename = getOutputFilename(format);
        writeFileSync(join(root, filename), output, 'utf-8');
        console.log(chalk.green(`✓ Exported to ${filename}`));
      } catch (err: any) {
        console.error(chalk.red(`✗ ${err.message}`));
        process.exit(1);
      }
    });
}

function printValidationResults(name: string, issues: { severity: string; message: string }[]): void {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  if (issues.length === 0) {
    console.log(chalk.green(`✓ ${name}: all checks passed`));
    return;
  }

  console.log(chalk.bold(`\n${name}:`));
  for (const issue of errors) {
    console.log(chalk.red(`  ✗ ${issue.message}`));
  }
  for (const issue of warnings) {
    console.log(chalk.yellow(`  ⚠ ${issue.message}`));
  }

  if (errors.length === 0) {
    console.log(chalk.green(`  ✓ No errors (${warnings.length} warning${warnings.length !== 1 ? 's' : ''})`));
  } else {
    console.log(chalk.red(`  ${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`));
  }
}
