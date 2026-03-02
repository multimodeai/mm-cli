import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import type { EvalSuite } from '../../src/eval/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Eval YAML format', () => {
  it('parses sample eval YAML correctly', () => {
    const content = readFileSync(join(__dirname, '..', 'fixtures', 'eval.yaml'), 'utf-8');
    const suite = yaml.parse(content) as EvalSuite;

    expect(suite.name).toBe('sample-skill-eval');
    expect(suite.skill).toContain('SKILL.md');
    expect(suite.scenarios).toHaveLength(2);
  });

  it('basic scenario has required fields', () => {
    const content = readFileSync(join(__dirname, '..', 'fixtures', 'eval.yaml'), 'utf-8');
    const suite = yaml.parse(content) as EvalSuite;
    const basic = suite.scenarios[0];

    expect(basic.name).toBe('basic-task');
    expect(basic.prompt).toBeTruthy();
    expect(basic.expected_qualities.length).toBeGreaterThan(0);
    expect(basic.failure_modes.length).toBeGreaterThan(0);
    expect(basic.scoring.excellent).toBe(5);
    expect(basic.scoring.acceptable).toBe(3);
    expect(basic.scoring.poor).toBe(1);
  });

  it('constraint-shift scenario has manifold dimensions', () => {
    const content = readFileSync(join(__dirname, '..', 'fixtures', 'eval.yaml'), 'utf-8');
    const suite = yaml.parse(content) as EvalSuite;
    const shifted = suite.scenarios[1];

    expect(shifted.constraint_change).toBeTruthy();
    expect(shifted.manifold_dimensions).toBeDefined();
    expect(shifted.manifold_dimensions!.selective_transfer).toBeTruthy();
    expect(shifted.manifold_dimensions!.causal_transparency).toBeTruthy();
    expect(shifted.manifold_dimensions!.creative_rerouting).toBeTruthy();
    expect(shifted.manifold_dimensions!.degradation_awareness).toBeTruthy();
    expect(shifted.manifold_dimensions!.output_coherence).toBeTruthy();
  });
});
