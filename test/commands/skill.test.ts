import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = 'npx tsx src/index.ts';
const ROOT = join(__dirname, '..', '..');
const TEST_SKILL_DIR = join(ROOT, '.claude', 'skills', 'test-skill');

describe('mm skill', () => {
  beforeEach(() => {
    // Clean up any existing test skill
    if (existsSync(TEST_SKILL_DIR)) {
      rmSync(TEST_SKILL_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_SKILL_DIR)) {
      rmSync(TEST_SKILL_DIR, { recursive: true });
    }
  });

  it('skill new creates SKILL.md and tile.json', () => {
    const output = execSync(`${CLI} skill new test-skill`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('Created skill "test-skill"');
    expect(existsSync(join(TEST_SKILL_DIR, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(TEST_SKILL_DIR, 'tile.json'))).toBe(true);
  });

  it('skill new fails if skill already exists', () => {
    execSync(`${CLI} skill new test-skill`, { cwd: ROOT, encoding: 'utf-8' });
    try {
      execSync(`${CLI} skill new test-skill`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.stderr.toString() || err.stdout.toString()).toContain('already exists');
    }
  });

  it('skill list shows created skills', () => {
    execSync(`${CLI} skill new test-skill`, { cwd: ROOT, encoding: 'utf-8' });
    const output = execSync(`${CLI} skill list`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('test-skill');
  });

  it('skill validate reports issues on scaffold', () => {
    execSync(`${CLI} skill new test-skill`, { cwd: ROOT, encoding: 'utf-8' });
    const output = execSync(`${CLI} skill validate test-skill`, { cwd: ROOT, encoding: 'utf-8' });
    // Scaffold has placeholder content, so should have some warnings but no errors
    expect(output).toContain('test-skill');
  });
});
