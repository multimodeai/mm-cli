import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = 'npx tsx src/index.ts';
const ROOT = join(__dirname, '..', '..');

describe('mm harness', () => {
  it('harness --help shows all 4 subcommands', () => {
    const output = execSync(`${CLI} harness --help`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('verify');
    expect(output).toContain('audit');
    expect(output).toContain('route');
    expect(output).toContain('brief');
  });

  it('harness verify --dry-run prints system prompt', () => {
    const output = execSync(`${CLI} harness verify --dry-run`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('DRY RUN');
    expect(output).toContain('specification verification judge');
  });

  it('harness audit --dry-run prints system prompt', () => {
    const output = execSync(`${CLI} harness audit --dry-run`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('DRY RUN');
    expect(output).toContain('senior engineering advisor');
  });

  it('harness route --dry-run prints system prompt', () => {
    const output = execSync(`${CLI} harness route --dry-run`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('DRY RUN');
    expect(output).toContain('task routing advisor');
  });

  it('harness brief --dry-run prints system prompt', () => {
    const output = execSync(`${CLI} harness brief --dry-run`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('DRY RUN');
    expect(output).toContain('technology strategy advisor');
  });

  it('harness is shown in mm --help', () => {
    const output = execSync(`${CLI} --help`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('harness');
  });
});
