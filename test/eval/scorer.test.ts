import { describe, it, expect, vi } from 'vitest';
import { scoreScenario } from '../../src/eval/scorer.js';
import type { ClaudeClient } from '../../src/engine/claude-client.js';
import type { EvalScenario } from '../../src/eval/types.js';

function createMockJudge(responses: string[]): ClaudeClient {
  let idx = 0;
  return {
    send: vi.fn(async () => responses[idx++] || '{}'),
    getModel: () => 'mock-judge',
  } as unknown as ClaudeClient;
}

describe('scoreScenario', () => {
  const basicScenario: EvalScenario = {
    name: 'test-scenario',
    prompt: 'Write a hello world function',
    expected_qualities: ['Uses function syntax', 'Returns string', 'No side effects'],
    failure_modes: ['Uses console.log', 'Missing return'],
    scoring: { excellent: 5, acceptable: 3, poor: 1 },
  };

  it('scores quality based on judge response', async () => {
    const judge = createMockJudge([
      JSON.stringify({
        qualities: [
          { quality: 'Uses function syntax', met: true, reason: 'Uses function declaration' },
          { quality: 'Returns string', met: true, reason: 'Returns "Hello World"' },
          { quality: 'No side effects', met: true, reason: 'Pure function' },
        ],
        failures: [
          { mode: 'Uses console.log', hit: false, reason: 'No console usage' },
          { mode: 'Missing return', hit: false, reason: 'Has return statement' },
        ],
      }),
    ]);

    const result = await scoreScenario(basicScenario, 'function hello() { return "Hello World"; }', judge);

    expect(result.qualityScore).toBe(3);
    expect(result.qualityDetails).toHaveLength(3);
    expect(result.failureModeHits).toHaveLength(2);
    expect(result.manifoldScore).toBeUndefined();
  });

  it('deducts for failure mode hits', async () => {
    const judge = createMockJudge([
      JSON.stringify({
        qualities: [
          { quality: 'Uses function syntax', met: true, reason: 'ok' },
          { quality: 'Returns string', met: false, reason: 'missing' },
          { quality: 'No side effects', met: false, reason: 'uses console' },
        ],
        failures: [
          { mode: 'Uses console.log', hit: true, reason: 'console.log found' },
          { mode: 'Missing return', hit: true, reason: 'no return' },
        ],
      }),
    ]);

    const result = await scoreScenario(basicScenario, 'bad response', judge);
    // 1 met - 2 hits = max(0, -1) = 0
    expect(result.qualityScore).toBe(0);
  });

  it('scores manifold dimensions for constraint-shift scenarios', async () => {
    const constraintScenario: EvalScenario = {
      ...basicScenario,
      constraint_change: 'Also handle Unicode',
      manifold_dimensions: {
        selective_transfer: 'Base logic should remain',
        causal_transparency: 'Should explain Unicode handling',
        creative_rerouting: 'Find workarounds',
        degradation_awareness: 'Flag complexity increase',
        output_coherence: 'Must still be valid function',
      },
    };

    const judge = createMockJudge([
      // Quality judge response
      JSON.stringify({
        qualities: [{ quality: 'ok', met: true, reason: 'ok' }],
        failures: [],
      }),
      // Manifold judge response
      JSON.stringify({
        selectiveTransfer: 3,
        causalTransparency: 2,
        creativeRerouting: 3,
        degradationAwareness: 2,
        outputCoherence: 3,
      }),
    ]);

    const result = await scoreScenario(constraintScenario, 'response', judge);

    expect(result.manifoldScore).toBeDefined();
    expect(result.manifoldScore!.selectiveTransfer).toBe(3);
    expect(result.manifoldScore!.causalTransparency).toBe(2);
    expect(result.manifoldTotal).toBe(13);
  });
});
