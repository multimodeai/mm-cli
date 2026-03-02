import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ClaudeClient } from '../engine/claude-client.js';
import { StdinIO } from '../engine/stdin-io.js';
import { runInterview } from '../engine/interview.js';
import { CONTEXT_BUILD } from '../engine/interview-templates.js';
import { loadConfig, getApiKey, getTier, DEFAULT_MODEL } from '../util/config.js';
import { findProjectRoot, getSkillsDir } from '../util/fs.js';

/**
 * Smart output logic for mm context build (from SPEC):
 *
 * | Scenario                              | Output                                          |
 * |---------------------------------------|------------------------------------------------|
 * | No CLAUDE.md exists                   | Scaffold CLAUDE.md + business-context skill     |
 * | CLAUDE.md exists, no business-context | .claude/skills/business-context/SKILL.md + row  |
 * | CLAUDE.md exists + business-context   | Update .claude/skills/business-context/SKILL.md |
 */
function resolveOutputPath(root: string): { outputFile: string; mode: 'scaffold' | 'new-skill' | 'update-skill' } {
  const claudeMdPath = join(root, 'CLAUDE.md');
  const skillDir = join(getSkillsDir(root), 'business-context');
  const skillPath = join(skillDir, 'SKILL.md');

  if (!existsSync(claudeMdPath)) {
    return { outputFile: skillPath, mode: 'scaffold' };
  }

  if (!existsSync(skillPath)) {
    return { outputFile: skillPath, mode: 'new-skill' };
  }

  return { outputFile: skillPath, mode: 'update-skill' };
}

/**
 * Detect project type from common marker files.
 */
function detectProjectType(root: string): { type: string; commands: string[] } {
  if (existsSync(join(root, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const scripts = Object.keys(pkg.scripts || {});
    const commands: string[] = [];

    if (scripts.includes('dev')) commands.push('npm run dev');
    if (scripts.includes('build')) commands.push('npm run build');
    if (scripts.includes('test')) commands.push('npm test');
    if (scripts.includes('lint')) commands.push('npm run lint');

    const framework = pkg.dependencies?.next ? 'Next.js'
      : pkg.dependencies?.react ? 'React'
      : pkg.dependencies?.express ? 'Express'
      : 'Node.js';

    return { type: framework, commands };
  }

  if (existsSync(join(root, 'Cargo.toml'))) {
    return { type: 'Rust', commands: ['cargo build', 'cargo test', 'cargo run'] };
  }

  if (existsSync(join(root, 'go.mod'))) {
    return { type: 'Go', commands: ['go build ./...', 'go test ./...', 'go run .'] };
  }

  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'setup.py'))) {
    return { type: 'Python', commands: ['python -m pytest', 'python main.py'] };
  }

  return { type: 'Unknown', commands: [] };
}

/**
 * Scaffold a fresh CLAUDE.md routing table.
 */
function scaffoldClaudeMd(root: string): void {
  const project = detectProjectType(root);
  const projectName = root.split('/').pop() || 'project';

  const commandsBlock = project.commands.length > 0
    ? project.commands.map(c => `${c.padEnd(24)} # TODO: describe`).join('\n')
    : '# TODO: add key commands';

  const content = `# CLAUDE.md

## Project Overview

${projectName} — TODO: describe this project in one sentence.

## Skills

| Skill | Path | Activates when |
|-------|------|---------------|
| Business Context | \`.claude/skills/business-context/SKILL.md\` | strategy, marketing, audience, business, goals, priorities, planning |

## Architecture

\`\`\`
${project.type} project
└── TODO: describe directory structure
\`\`\`

## Key Commands

\`\`\`bash
${commandsBlock}
\`\`\`

## Git Guidelines

- Conventional commits: \`feat:\`, \`fix:\`, \`docs:\`, \`refactor:\`
- No AI attribution
`;

  writeFileSync(join(root, 'CLAUDE.md'), content, 'utf-8');
  console.log(chalk.green(`✓ Scaffolded CLAUDE.md`));
}

/**
 * Add a business-context row to an existing CLAUDE.md routing table.
 */
function addSkillRow(root: string): void {
  const claudeMdPath = join(root, 'CLAUDE.md');
  let content = readFileSync(claudeMdPath, 'utf-8');

  const row = '| Business Context | `.claude/skills/business-context/SKILL.md` | strategy, marketing, audience, business, goals, priorities, planning |';

  // Check if business-context row already exists
  if (content.includes('business-context/SKILL.md')) {
    return;
  }

  // Try to insert after the last table row in the Skills section
  const tableRowRegex = /(\| .+ \| `.claude\/skills\/.+` \| .+ \|)/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = tableRowRegex.exec(content)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    const insertPos = lastMatch.index + lastMatch[0].length;
    content = content.slice(0, insertPos) + '\n' + row + content.slice(insertPos);
  } else {
    // No existing skills table — look for ## Skills header
    const skillsHeader = content.indexOf('## Skills');
    if (skillsHeader !== -1) {
      const headerEnd = content.indexOf('\n', skillsHeader) + 1;
      const tableHeader = '\n| Skill | Path | Activates when |\n|-------|------|---------------|\n' + row + '\n';
      content = content.slice(0, headerEnd) + tableHeader + content.slice(headerEnd);
    } else {
      // No skills section — add one
      content += '\n## Skills\n\n| Skill | Path | Activates when |\n|-------|------|---------------|\n' + row + '\n';
    }
  }

  writeFileSync(claudeMdPath, content, 'utf-8');
  console.log(chalk.green(`✓ Added business-context to CLAUDE.md routing table`));
}

function writeTileJson(skillDir: string): void {
  const tile = {
    name: 'business-context',
    version: '1.0.0',
    description: 'Business context, goals, audience, and strategy',
    triggers: ['strategy', 'marketing', 'audience', 'business', 'goals', 'priorities', 'planning'],
    skill_file: 'SKILL.md',
    eval_suite: null,
  };
  writeFileSync(join(skillDir, 'tile.json'), JSON.stringify(tile, null, 2), 'utf-8');
}

export function registerContext(program: Command): void {
  const context = program
    .command('context')
    .description('Build personal context documents');

  context
    .command('build')
    .description('7-domain interview to build business context')
    .option('--model <model>', 'Override Claude model')
    .option('--dry-run', 'Print messages without calling API')
    .option('--fresh', 'Start from scratch even if output file exists')
    .action(async (opts) => {
      const config = loadConfig();
      const apiKey = opts.dryRun ? 'dry-run' : getApiKey(config);
      const client = new ClaudeClient({
        apiKey,
        model: opts.model || config.model || DEFAULT_MODEL,
      });

      const root = findProjectRoot();
      if (!root) {
        console.error(chalk.red('Not in a project directory (no .git, package.json, or CLAUDE.md found)'));
        process.exit(1);
      }

      // Smart output routing
      const { outputFile, mode } = resolveOutputPath(root);

      // Ensure skill directory exists
      const skillDir = join(getSkillsDir(root), 'business-context');
      mkdirSync(skillDir, { recursive: true });

      if (mode === 'scaffold') {
        console.log(chalk.dim('No CLAUDE.md found — will scaffold routing table + business-context skill.'));
      } else if (mode === 'new-skill') {
        console.log(chalk.dim('CLAUDE.md found — interview output → .claude/skills/business-context/SKILL.md'));
      } else {
        console.log(chalk.dim('Updating existing business-context skill.'));
      }

      const io = new StdinIO();

      try {
        const result = await runInterview(CONTEXT_BUILD, client, io, {
          dryRun: opts.dryRun,
          outputFile,
          fresh: opts.fresh,
          tier: getTier(config),
        });

        if (result.artifact) {
          // Post-save actions based on mode
          if (mode === 'scaffold') {
            scaffoldClaudeMd(root);
            writeTileJson(skillDir);
          } else if (mode === 'new-skill') {
            addSkillRow(root);
            writeTileJson(skillDir);
          }
        }
      } catch (err: any) {
        console.error(chalk.red(`\n✗ ${err.message}`));
        process.exit(1);
      } finally {
        io.close();
      }
    });
}
