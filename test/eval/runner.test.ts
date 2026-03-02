import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvalSuite } from '../../src/eval/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('loadEvalSuite', () => {
  it('loads and parses eval YAML from fixtures', () => {
    const fixturesDir = join(__dirname, '..', 'fixtures');
    const suite = loadEvalSuite(fixturesDir);

    expect(suite.name).toBe('sample-skill-eval');
    expect(suite.model).toBe('claude-sonnet-4-20250514');
    expect(suite.scenarios).toHaveLength(2);
    expect(suite.scenarios[0].name).toBe('basic-task');
    expect(suite.scenarios[1].constraint_change).toBeTruthy();
  });

  it('throws for missing eval directory', () => {
    expect(() => loadEvalSuite('/nonexistent/path')).toThrow('Eval suite not found');
  });
});
