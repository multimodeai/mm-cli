import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = 'npx tsx src/index.ts';
const ROOT = join(__dirname, '..', '..');

describe('mm preflight', () => {
  it('prints the 7 pre-flight questions', () => {
    const output = execSync(`${CLI} preflight`, { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('What is the actual outcome I need?');
    expect(output).toContain('What does the AI need to know');
    expect(output).toContain('What would a bad response look like?');
    expect(output).toContain('Am I asking one clear thing');
    expect(output).toContain('Have I specified the format');
    expect(output).toContain('What\'s my evaluation criteria?');
    expect(output).toContain('Would a skilled colleague understand');
  });

  it('template file contains all 7 questions', () => {
    const content = readFileSync(join(ROOT, 'src', 'templates', 'preflight.md'), 'utf-8');
    const questionMatches = content.match(/^\d+\.\s\*\*/gm);
    expect(questionMatches).toHaveLength(7);
  });
});
