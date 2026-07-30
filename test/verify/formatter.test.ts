import { describe, it, expect } from 'vitest';
import { formatVerifyResult } from '../../src/verify/index.js';
import type { VerifyResult } from '../../src/verify/types.js';

function makeResult(overrides: any = {}): VerifyResult {
  const summary = {
    totalCriteria: 0, met: 0, notMet: 0, partial: 0, unclear: 0, unverifiable: 0,
    proven: 0, failed: 0, judged: 0, checksRan: true, score: '0/0 criteria met',
    ...(overrides.summary ?? {}),
  };
  return {
    specFile: 'test-spec.md',
    timestamp: '2026-03-06T00:00:00.000Z',
    model: 'mock-model',
    criteria: [],
    constraints: [],
    definitionOfDone: { met: false, reasoning: 'Test' },
    ...overrides,
    summary,
  } as VerifyResult;
}

describe('formatVerifyResult', () => {
  it('formats met criteria with checkmark', () => {
    const result = makeResult({
      criteria: [
        { criterion: 'Users can register', status: 'met', evidence: 'src/auth.ts', confidence: 'high', source: 'executed' },
      ],
      summary: { totalCriteria: 1, met: 1, proven: 1, score: '1/1 PROVEN by execution' },
    });

    const output = formatVerifyResult(result);
    // An executed+met criterion renders as PROVEN, not a bare "confidence" label.
    expect(output).toContain('[1]');
    expect(output).toContain('Users can register');
    expect(output).toContain('PROVEN');
  });

  it('formats not_met criteria with evidence', () => {
    const result = makeResult({
      criteria: [
        { criterion: 'Password reset sends email', status: 'not_met', evidence: 'No email implementation', confidence: 'high' },
      ],
      summary: { totalCriteria: 1, met: 0, notMet: 1, partial: 0, unclear: 0, score: '0/1 criteria met' },
    });

    const output = formatVerifyResult(result);
    expect(output).toContain('Password reset sends email');
    expect(output).toContain('No email implementation');
  });

  it('formats partial criteria', () => {
    const result = makeResult({
      criteria: [
        { criterion: 'Rate limiting', status: 'partial', evidence: 'Exists but not configurable', confidence: 'medium', source: 'judged' },
      ],
      summary: { totalCriteria: 1, met: 0, notMet: 0, partial: 1, unclear: 0, judged: 1, score: '0/1 PROVEN by execution' },
    });

    const output = formatVerifyResult(result);
    expect(output).toContain('Rate limiting');
    // A judged (static) criterion is tier-labelled so it never reads as proof.
    expect(output).toContain('judged');
  });

  it('shows correct summary line', () => {
    const result = makeResult({
      summary: { totalCriteria: 10, met: 7, notMet: 2, partial: 1, unclear: 0, score: '7/10 criteria met' },
    });

    const output = formatVerifyResult(result);
    expect(output).toContain('7/10 criteria met');
  });

  it('handles empty criteria array', () => {
    const result = makeResult();
    const output = formatVerifyResult(result);
    expect(output).toContain('No criteria extracted');
  });

  it('shows definition of done status', () => {
    const result = makeResult({
      definitionOfDone: { met: true, reasoning: 'All criteria satisfied' },
    });

    const output = formatVerifyResult(result);
    expect(output).toContain('DEFINITION OF DONE');
    expect(output).toContain('All criteria satisfied');
  });

  it('formats constraints section', () => {
    const result = makeResult({
      constraints: [
        { constraint: 'Input validation', type: 'must_do', status: 'satisfied', evidence: 'Found' },
        { constraint: 'Store plaintext passwords', type: 'must_not', status: 'violated', evidence: 'Plaintext found' },
      ],
    });

    const output = formatVerifyResult(result);
    expect(output).toContain('CONSTRAINTS');
    expect(output).toContain('MUST DO');
    expect(output).toContain('MUST NOT');
    expect(output).toContain('Plaintext found');
  });
});
