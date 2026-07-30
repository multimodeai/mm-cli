import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSpecVerify, VERIFY_SYSTEM_PROMPT } from '../../src/verify/index.js';
import type { ClaudeClient } from '../../src/engine/claude-client.js';

function createMockClient(responseJson: object): ClaudeClient {
  return {
    sendWithTools: vi.fn(async () => ({
      text: JSON.stringify(responseJson),
      apiMessages: [],
      toolCalls: [],
    })),
    getModel: () => 'mock-model',
  } as unknown as ClaudeClient;
}

const SAMPLE_SPEC = `=== PROJECT SPECIFICATION ===
Project: Test Project

2. ACCEPTANCE CRITERIA
1. Feature A works
2. Feature B works
3. Feature C works

3. CONSTRAINT ARCHITECTURE
Must Do:
- Use existing patterns

7. DEFINITION OF DONE
All features work.`;

describe('runSpecVerify', () => {
  it('calls sendWithTools with correct system prompt', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'Feature A works', status: 'met', evidence: 'Found in src/a.ts', confidence: 'high' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'All good' },
    };
    const client = createMockClient(mockResponse);

    await runSpecVerify(SAMPLE_SPEC, client, 'SPEC.md');

    expect(client.sendWithTools).toHaveBeenCalledOnce();
    const args = (client.sendWithTools as any).mock.calls[0];
    expect(args[0]).toContain('specification verification judge');
    expect(args[4]).toBe(16384); // maxTokens
    expect(args[5]).toBe(30);   // maxToolLoops
  });

  it('returns correct summary counts', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'Feature A works', status: 'met', evidence: 'src/a.ts', confidence: 'high' },
        { criterion: 'Feature B works', status: 'not_met', evidence: 'Not found', confidence: 'high' },
        { criterion: 'Feature C works', status: 'partial', evidence: 'Partial', confidence: 'medium' },
        // The judge invents a 4th criterion the spec does not have — it must NOT
        // inflate the count; the spec's 3 ACs are canonical.
        { criterion: 'Feature D invented', status: 'unclear', evidence: 'Unknown', confidence: 'low' },
      ],
      constraints: [],
      definitionOfDone: { met: false, reasoning: 'Missing features' },
    };
    const client = createMockClient(mockResponse);

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    // The spec has exactly 3 ACs; the judge's invented 4th is dropped.
    expect(result.summary.totalCriteria).toBe(3);
    expect(result.summary.met).toBe(1);
    expect(result.summary.notMet).toBe(1);
    expect(result.summary.partial).toBe(1);
    expect(result.summary.unclear).toBe(0);
    // No check manifest -> judge-only run, so nothing is PROVEN.
    expect(result.summary.checksRan).toBe(false);
    expect(result.summary.proven).toBe(0);
    expect(result.summary.score).toBe('1/3 judged met (0 proven — judge-only run)');
  });

  it('handles JSON parse errors gracefully', async () => {
    const client = {
      sendWithTools: vi.fn(async () => ({
        text: 'This is not JSON at all',
        apiMessages: [],
        toolCalls: [],
      })),
      getModel: () => 'mock-model',
    } as unknown as ClaudeClient;

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    expect(result.criteria).toHaveLength(0);
    expect(result.definitionOfDone.met).toBe(false);
    expect(result.summary.score).toContain('Parse error');
  });

  it('handles code-fenced JSON response', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'Feature A works', status: 'met', evidence: 'src/a.ts', confidence: 'high' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'Done' },
    };
    const client = {
      sendWithTools: vi.fn(async () => ({
        text: '```json\n' + JSON.stringify(mockResponse) + '\n```',
        apiMessages: [],
        toolCalls: [],
      })),
      getModel: () => 'mock-model',
    } as unknown as ClaudeClient;

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    // Canonical: the spec has 3 ACs, so 3 slots. The fenced JSON parsed if Feature A
    // came back 'met'; the 2 the judge stayed silent on are honestly 'unclear'.
    expect(result.criteria).toHaveLength(3);
    const a = result.criteria.find(c => c.criterion.includes('Feature A'))!;
    expect(a.status).toBe('met');
    expect(result.criteria.filter(c => c.status === 'unclear')).toHaveLength(2);
  });

  it('validates status values and falls back to defaults', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'A', status: 'invalid_status', evidence: '', confidence: 'invalid_conf' },
      ],
      constraints: [
        { constraint: 'B', type: 'invalid_type', status: 'invalid_status', evidence: '' },
      ],
      definitionOfDone: { met: true, reasoning: 'Ok' },
    };
    const client = createMockClient(mockResponse);

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    expect(result.criteria[0].status).toBe('unclear');
    expect(result.criteria[0].confidence).toBe('low');
    expect(result.constraints[0].type).toBe('must_do');
    expect(result.constraints[0].status).toBe('not_assessed');
  });
});

// The regression this whole redesign exists to prevent: the tool must never grade
// the spec on the spec's own claims, and executed proof must outrank LLM opinion.
const SPEC_WITH_TASK_CLAIM = `=== PROJECT SPECIFICATION ===
2. ACCEPTANCE CRITERIA
1. Feature A works
2. Feature B works
3. Feature C works

4. TASK DECOMPOSITION
**Task 1: Build Feature A** ✅ — done, verified, Feature A works perfectly, all green.

7. DEFINITION OF DONE
All features work.`;

function tmpManifest(lines: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mm-verify-'));
  const p = join(dir, 'checks.sh');
  writeFileSync(p, `#!/usr/bin/env bash\n${lines}\n`);
  return p;
}

describe('executable check layer (PROVEN vs judged)', () => {
  it('executed results OUTRANK the judge and are tiered PROVEN / FAILED', async () => {
    // The judge is WRONG on purpose: says A not_met, B met(high). Execution overrides.
    const client = createMockClient({
      criteria: [
        { criterion: 'Feature A works', status: 'not_met', evidence: 'judge thinks missing', confidence: 'high' },
        { criterion: 'Feature B works', status: 'met', evidence: 'looks fine to me', confidence: 'high' },
        { criterion: 'Feature C works', status: 'met', evidence: 'looks fine to me', confidence: 'high' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'judge says done' },
    });
    const manifest = tmpManifest('echo "AC1 PASS default-deny confirmed"\necho "AC2 FAIL broker-down test missing"');
    const res = await runSpecVerify(SPEC_WITH_TASK_CLAIM, client, 'thing.md', {
      checksPath: manifest,
      projectRoot: '/tmp',
    });

    const a = res.criteria.find(c => c.criterion.includes('Feature A'))!;
    const b = res.criteria.find(c => c.criterion.includes('Feature B'))!;
    const c = res.criteria.find(c => c.criterion.includes('Feature C'))!;

    // AC1 executed PASS beats the judge's not_met -> PROVEN met.
    expect(a.source).toBe('executed');
    expect(a.status).toBe('met');
    expect(a.confidence).toBe('high');
    // AC2 executed FAIL beats the judge's met -> FAILED.
    expect(b.source).toBe('executed');
    expect(b.status).toBe('not_met');
    // AC3 has no check -> stays judged, and a judged 'high' is capped to 'medium'.
    expect(c.source).toBe('judged');
    expect(c.status).toBe('met');
    expect(c.confidence).toBe('medium');

    expect(res.summary.proven).toBe(1);
    expect(res.summary.failed).toBe(1);
    expect(res.summary.judged).toBe(1);
    expect(res.summary.checksRan).toBe(true);
    // A FAILED check means not done, no matter what the judge claimed.
    expect(res.definitionOfDone.met).toBe(false);
  });

  it('a reordered judge cannot let an executed verdict clobber a real not_met (index-canonical merge)', async () => {
    const spec = `=== PROJECT SPECIFICATION ===
2. ACCEPTANCE CRITERIA
1. The Alpha subsystem is implemented
2. The Bravo subsystem is implemented
3. The Charlie subsystem is implemented

7. DEFINITION OF DONE
done`;
    // Judge returns them REORDERED (Charlie first) so a naive index/fuzzy merge could
    // drop Charlie's not_met when applying the AC1 executed result.
    const client = createMockClient({
      criteria: [
        { criterion: 'The Charlie subsystem is implemented', status: 'not_met', evidence: 'charlie missing', confidence: 'high' },
        { criterion: 'The Alpha subsystem is implemented', status: 'met', evidence: 'alpha ok', confidence: 'high' },
        { criterion: 'The Bravo subsystem is implemented', status: 'unclear', evidence: 'unsure', confidence: 'low' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'judge says done' },
    });
    // Only AC1 (Alpha) is executed + passes. Bravo/Charlie have no check.
    const manifest = tmpManifest('echo "AC1 PASS alpha proven"');
    const res = await runSpecVerify(spec, client, 't.md', { checksPath: manifest, projectRoot: '/tmp' });

    const alpha = res.criteria.find(c => c.criterion.includes('Alpha'))!;
    const charlie = res.criteria.find(c => c.criterion.includes('Charlie'))!;
    expect(alpha.source).toBe('executed');   // AC1 landed on Alpha's slot...
    expect(alpha.status).toBe('met');
    expect(charlie.status).toBe('not_met');   // ...and did NOT clobber Charlie's real not_met
    expect(res.definitionOfDone.met).toBe(false);
  });

  it('does NOT launder the spec\'s own ✅ task claims into "met"', async () => {
    // Judge genuinely cannot tell; there is NO manifest (judge-only run).
    const client = createMockClient({
      criteria: [
        { criterion: 'Feature A works', status: 'unclear', evidence: 'cannot tell from code', confidence: 'low' },
        { criterion: 'Feature B works', status: 'unclear', evidence: 'cannot tell from code', confidence: 'low' },
        { criterion: 'Feature C works', status: 'unclear', evidence: 'cannot tell from code', confidence: 'low' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'author claims done' },
    });
    const res = await runSpecVerify(SPEC_WITH_TASK_CLAIM, client, 'thing.md', {
      projectRoot: '/tmp',
      noChecks: true,
    });

    // The "✅ Task 1 ... Feature A works" claim must NOT flip Feature A to met.
    const a = res.criteria.find(c => c.criterion.includes('Feature A'))!;
    expect(a.status).toBe('unclear');
    expect(res.summary.proven).toBe(0);
    expect(res.summary.checksRan).toBe(false);
    // Judge-only + nothing proven + unclear => the DoD is NOT met (no false green).
    expect(res.definitionOfDone.met).toBe(false);
  });
});
