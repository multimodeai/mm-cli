import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = 'npx tsx src/index.ts';
const ROOT = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

describe('mm --help', () => {
  it('shows all registered commands', () => {
    const output = execSync(`${CLI} --help`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('preflight');
    expect(output).toContain('diagnose');
    expect(output).toContain('rewrite');
    expect(output).toContain('context');
    expect(output).toContain('spec');
    expect(output).toContain('intent');
    expect(output).toContain('eval');
    expect(output).toContain('constraint');
    expect(output).toContain('skill');
  });

  it('shows version matching package.json (never hardcode this — it drifted silently before)', () => {
    const output = execSync(`${CLI} --version`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output.trim()).toBe(pkg.version);
  });
});
