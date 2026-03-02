import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = 'npx tsx src/index.ts';
const ROOT = join(__dirname, '..', '..');
const TEST_SKILL_DIR = join(ROOT, '.claude', 'skills', 'export-test');
const CURSORRULES = join(ROOT, '.cursorrules');

describe('mm skill export', () => {
  beforeEach(() => {
    if (existsSync(TEST_SKILL_DIR)) rmSync(TEST_SKILL_DIR, { recursive: true });
    if (existsSync(CURSORRULES)) rmSync(CURSORRULES);
    // Create a test skill first
    execSync(`${CLI} skill new export-test`, { cwd: ROOT, encoding: 'utf-8' });
  });

  afterEach(() => {
    if (existsSync(TEST_SKILL_DIR)) rmSync(TEST_SKILL_DIR, { recursive: true });
    if (existsSync(CURSORRULES)) rmSync(CURSORRULES);
  });

  it('exports to .cursorrules format', () => {
    const output = execSync(`${CLI} skill export --format cursor`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('Exported to .cursorrules');
    expect(existsSync(CURSORRULES)).toBe(true);

    const content = readFileSync(CURSORRULES, 'utf-8');
    expect(content).toContain('Cursor Rules');
    expect(content).toContain('export-test');
  });
});
