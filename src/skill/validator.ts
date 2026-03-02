import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSkillsDir } from '../util/fs.js';
import { listSkills, type SkillInfo } from './manager.js';

export interface ValidationIssue {
  skill: string;
  severity: 'error' | 'warning';
  message: string;
}

const MAX_SKILL_LINES = 200;

const REQUIRED_SECTIONS = [
  'Instructions',
  'Guardrails',
];

const RECOMMENDED_SECTIONS = [
  'Role',
  'Context',
  'Output Format',
  'Self-Improvement',
];

export function validateSkill(projectRoot: string, name: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const skillDir = join(getSkillsDir(projectRoot), name);

  if (!existsSync(skillDir)) {
    issues.push({ skill: name, severity: 'error', message: 'Skill directory does not exist' });
    return issues;
  }

  const skillMdPath = join(skillDir, 'SKILL.md');
  const tilePath = join(skillDir, 'tile.json');

  // Check SKILL.md exists
  if (!existsSync(skillMdPath)) {
    issues.push({ skill: name, severity: 'error', message: 'Missing SKILL.md' });
  } else {
    const content = readFileSync(skillMdPath, 'utf-8');
    const lines = content.split('\n');

    // Check line count
    if (lines.length > MAX_SKILL_LINES) {
      issues.push({
        skill: name,
        severity: 'warning',
        message: `SKILL.md is ${lines.length} lines (recommended max: ${MAX_SKILL_LINES})`,
      });
    }

    // Check frontmatter
    if (!content.startsWith('---')) {
      issues.push({ skill: name, severity: 'warning', message: 'Missing YAML frontmatter' });
    } else {
      const fmEnd = content.indexOf('---', 3);
      if (fmEnd === -1) {
        issues.push({ skill: name, severity: 'error', message: 'Malformed YAML frontmatter (no closing ---)' });
      } else {
        const frontmatter = content.slice(3, fmEnd).trim();
        if (!frontmatter.includes('name:')) {
          issues.push({ skill: name, severity: 'warning', message: 'Frontmatter missing "name" field' });
        }
        if (!frontmatter.includes('version:')) {
          issues.push({ skill: name, severity: 'warning', message: 'Frontmatter missing "version" field' });
        }
      }
    }

    // Check required sections
    for (const section of REQUIRED_SECTIONS) {
      if (!content.includes(`## ${section}`)) {
        issues.push({ skill: name, severity: 'error', message: `Missing required section: ## ${section}` });
      }
    }

    // Check recommended sections
    for (const section of RECOMMENDED_SECTIONS) {
      if (!content.includes(`## ${section}`)) {
        issues.push({ skill: name, severity: 'warning', message: `Missing recommended section: ## ${section}` });
      }
    }
  }

  // Check tile.json
  if (!existsSync(tilePath)) {
    issues.push({ skill: name, severity: 'warning', message: 'Missing tile.json' });
  } else {
    try {
      const tile = JSON.parse(readFileSync(tilePath, 'utf-8'));
      if (!tile.name) {
        issues.push({ skill: name, severity: 'warning', message: 'tile.json missing "name" field' });
      }
      if (!tile.triggers || !Array.isArray(tile.triggers) || tile.triggers.length === 0) {
        issues.push({ skill: name, severity: 'warning', message: 'tile.json missing or empty "triggers" array' });
      }
    } catch {
      issues.push({ skill: name, severity: 'error', message: 'tile.json is not valid JSON' });
    }
  }

  return issues;
}

export function validateAllSkills(projectRoot: string): Map<string, ValidationIssue[]> {
  const skills = listSkills(projectRoot);
  const results = new Map<string, ValidationIssue[]>();

  for (const skill of skills) {
    results.set(skill.name, validateSkill(projectRoot, skill.name));
  }

  return results;
}
