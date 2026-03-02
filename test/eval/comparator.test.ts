import { describe, it, expect } from 'vitest';
import { compareResults } from '../../src/eval/comparator.js';
import type { EvalResult } from '../../src/eval/types.js';

describe('compareResults', () => {
  const withSkill: EvalResult = {
    suite: 'test-eval',
    skill: '.claude/skills/test/SKILL.md',
    model: 'claude-sonnet-4-20250514',
    withSkill: true,
    timestamp: '2024-01-01T00:00:00Z',
    scenarios: [
      {
        scenario: 'basic-task',
        response: 'with skill response',
        qualityScore: 4,
        qualityDetails: [],
        failureModeHits: [],
      },
    ],
    totalScore: 4,
    maxScore: 5,
  };

  const withoutSkill: EvalResult = {
    suite: 'test-eval',
    skill: '.claude/skills/test/SKILL.md',
    model: 'claude-sonnet-4-20250514',
    withSkill: false,
    timestamp: '2024-01-01T00:00:00Z',
    scenarios: [
      {
        scenario: 'basic-task',
        response: 'without skill response',
        qualityScore: 2,
        qualityDetails: [],
        failureModeHits: [],
      },
    ],
    totalScore: 2,
    maxScore: 5,
  };

  it('produces comparison output with deltas', () => {
    const output = compareResults(withSkill, withoutSkill);
    expect(output).toContain('test-eval');
    expect(output).toContain('basic-task');
    expect(output).toContain('TOTAL');
    expect(output).toContain('2.00x');
  });

  it('shows improvement ratio', () => {
    const output = compareResults(withSkill, withoutSkill);
    expect(output).toContain('Improvement ratio');
  });
});
