import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSkillsDir, isDirectory } from '../util/fs.js';

export interface SkillInfo {
  name: string;
  path: string;
  hasSkillMd: boolean;
  hasTileJson: boolean;
  version?: string;
  triggers?: string[];
}

export function createSkill(projectRoot: string, name: string, scaffoldMd: string, scaffoldJson: string): string {
  const skillDir = join(getSkillsDir(projectRoot), name);

  if (existsSync(skillDir)) {
    throw new Error(`Skill "${name}" already exists at ${skillDir}`);
  }

  mkdirSync(skillDir, { recursive: true });

  const skillMd = scaffoldMd.replace(/\{\{NAME\}\}/g, name);
  const tileJson = scaffoldJson.replace(/\{\{NAME\}\}/g, name);

  writeFileSync(join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
  writeFileSync(join(skillDir, 'tile.json'), tileJson, 'utf-8');

  return skillDir;
}

export function listSkills(projectRoot: string): SkillInfo[] {
  const skillsDir = getSkillsDir(projectRoot);

  if (!existsSync(skillsDir)) {
    return [];
  }

  const entries = readdirSync(skillsDir);
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    const skillDir = join(skillsDir, entry);
    if (!isDirectory(skillDir)) continue;

    const hasSkillMd = existsSync(join(skillDir, 'SKILL.md'));
    const hasTileJson = existsSync(join(skillDir, 'tile.json'));

    let version: string | undefined;
    let triggers: string[] | undefined;

    if (hasTileJson) {
      try {
        const tile = JSON.parse(readFileSync(join(skillDir, 'tile.json'), 'utf-8'));
        version = tile.version;
        triggers = tile.triggers;
      } catch {
        // Ignore malformed tile.json
      }
    }

    skills.push({
      name: entry,
      path: skillDir,
      hasSkillMd,
      hasTileJson,
      version,
      triggers,
    });
  }

  return skills;
}

export function getSkill(projectRoot: string, name: string): SkillInfo | null {
  const skills = listSkills(projectRoot);
  return skills.find(s => s.name === name) || null;
}

export function readSkillMd(projectRoot: string, name: string): string | null {
  const skillPath = join(getSkillsDir(projectRoot), name, 'SKILL.md');
  if (!existsSync(skillPath)) return null;
  return readFileSync(skillPath, 'utf-8');
}
