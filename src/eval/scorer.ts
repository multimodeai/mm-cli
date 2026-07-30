import type { ClaudeClient } from '../engine/claude-client.js';
import type { EvalScenario, ScenarioResult, ManifoldScore } from './types.js';

/**
 * Score a scenario response using Claude-as-judge.
 * Three scoring passes:
 * 1. Quality checkbox scoring (expected_qualities + failure_modes)
 * 2. Multi-axis 5-dim scoring (if constraint_change present)
 * 3. Canary check (VOID-rule semantics, if canary_qualities present)
 */
export async function scoreScenario(
  scenario: EvalScenario,
  response: string,
  judgeClient: ClaudeClient
): Promise<ScenarioResult> {
  // Quality scoring
  const qualityResult = await scoreQuality(scenario, response, judgeClient);

  // Multi-axis scoring (only for constraint-shift scenarios)
  let manifoldScore: ManifoldScore | undefined;
  let manifoldTotal: number | undefined;

  if (scenario.constraint_change && scenario.manifold_dimensions) {
    manifoldScore = await scoreManifold(scenario, response, judgeClient);
    manifoldTotal = Object.values(manifoldScore).reduce((a, b) => a + b, 0);
  }

  // Canary VOID-rule check
  let canaryChecks: { canary: string; met: boolean; reason: string }[] | undefined;
  let isVoid = false;
  let voidReason: string | undefined;
  if (scenario.canary_qualities && scenario.canary_qualities.length > 0) {
    canaryChecks = await scoreCanaries(scenario, response, judgeClient);
    const missed = canaryChecks.filter(c => !c.met);
    if (missed.length > 0) {
      isVoid = true;
      voidReason = `${missed.length} of ${canaryChecks.length} canary qualities missed: ${missed.map(m => m.canary.slice(0, 60)).join(' | ')}`;
    }
  }

  return {
    scenario: scenario.name,
    response,
    ...qualityResult,
    manifoldScore,
    manifoldTotal,
    canaryChecks,
    isVoid,
    voidReason,
  };
}

/**
 * Score canary qualities against the response. Each canary is a binary check;
 * the VOID rule fires if any canary is missed (handled in the caller).
 */
async function scoreCanaries(
  scenario: EvalScenario,
  response: string,
  judgeClient: ClaudeClient
): Promise<{ canary: string; met: boolean; reason: string }[]> {
  const canaries = scenario.canary_qualities!;
  const canaryList = canaries.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const judgePrompt = `You are an eval judge checking CANARY qualities. A canary is a material fact a careful analyst should find — its absence VOIDS the run, not just reduces the score.

SCENARIO: ${scenario.name}
PROMPT GIVEN: ${scenario.prompt}

RESPONSE TO EVALUATE:
${response}

CANARY QUALITIES (each is a hard requirement — missing ANY voids the run):
${canaryList}

Be strict. Only mark "met: true" if the response demonstrates the canary fact clearly and unambiguously. Vague references or implicit treatment = not met.

IMPORTANT: The response may contain (a) tool-exploration text where the model investigates source files, and (b) the actual deliverable text the model produced. A canary is ONLY met if the evidence appears in (b) — the produced deliverable. Mere mentions during exploration ('I see EVT-001 in the audit_log...') without inclusion in the produced deliverable do NOT count as met.

Respond in this exact JSON format (no markdown, no code fences):
{
  "canaries": [
    {"canary": "...", "met": true/false, "reason": "one sentence with evidence"}
  ]
}`;

  const judgeResponse = await judgeClient.send(
    'You are a precise canary check judge. Respond only with valid JSON. Be strict — canaries are hard requirements.',
    [{ role: 'user', content: judgePrompt }],
    8192
  );

  try {
    const parsed = JSON.parse(extractJson(judgeResponse));
    return parsed.canaries.map((c: any) => ({
      canary: c.canary,
      met: c.met,
      reason: c.reason,
    }));
  } catch {
    // Parse failure → mark all canaries as missed (defensive: better VOID than false-positive pass)
    return canaries.map(c => ({
      canary: c,
      met: false,
      reason: 'Judge response parse error — defaulting to missed (defensive VOID)',
    }));
  }
}

async function scoreQuality(
  scenario: EvalScenario,
  response: string,
  judgeClient: ClaudeClient
): Promise<{
  qualityScore: number;
  qualityDetails: { quality: string; met: boolean; reason: string }[];
  failureModeHits: { mode: string; hit: boolean; reason: string }[];
}> {
  const qualitiesList = scenario.expected_qualities
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  // failure_modes is optional in practice — workflow-generated eval suites may omit it
  const failureModes = scenario.failure_modes ?? [];
  const failuresList = failureModes.length === 0
    ? '(none specified — score on qualities alone)'
    : failureModes.map((f, i) => `${i + 1}. ${f}`).join('\n');

  const judgePrompt = `You are an eval judge. Score the following AI response against quality criteria and failure modes.

SCENARIO: ${scenario.name}
PROMPT GIVEN: ${scenario.prompt}
${scenario.context ? `CONTEXT: ${scenario.context}` : ''}

RESPONSE TO EVALUATE:
${response}

EXPECTED QUALITIES (each scores 1 point if met):
${qualitiesList}

FAILURE MODES (each deducts 1 point if present):
${failuresList}

Respond in this exact JSON format (no markdown, no code fences):
{
  "qualities": [
    {"quality": "...", "met": true/false, "reason": "one sentence"}
  ],
  "failures": [
    {"mode": "...", "hit": true/false, "reason": "one sentence"}
  ]
}`;

  const judgeResponse = await judgeClient.send(
    'You are a precise eval judge. Respond only with valid JSON.',
    [{ role: 'user', content: judgePrompt }],
    8192
  );

  try {
    const parsed = JSON.parse(extractJson(judgeResponse));
    const qualityDetails = parsed.qualities.map((q: any) => ({
      quality: q.quality,
      met: q.met,
      reason: q.reason,
    }));
    const failureModeHits = parsed.failures.map((f: any) => ({
      mode: f.mode,
      hit: f.hit,
      reason: f.reason,
    }));

    const metCount = qualityDetails.filter((q: any) => q.met).length;
    const hitCount = failureModeHits.filter((f: any) => f.hit).length;
    const qualityScore = Math.max(0, metCount - hitCount);

    return { qualityScore, qualityDetails, failureModeHits };
  } catch {
    // Fallback if judge response isn't valid JSON
    return {
      qualityScore: 0,
      qualityDetails: scenario.expected_qualities.map(q => ({
        quality: q, met: false, reason: 'Judge response parse error',
      })),
      failureModeHits: (scenario.failure_modes ?? []).map(f => ({
        mode: f, hit: false, reason: 'Judge response parse error',
      })),
    };
  }
}

async function scoreManifold(
  scenario: EvalScenario,
  response: string,
  judgeClient: ClaudeClient
): Promise<ManifoldScore> {
  const dims = scenario.manifold_dimensions!;

  const judgePrompt = `You are a Multi-axis evaluator. Score this AI response on 5 dimensions (1-3 each).

SCENARIO: ${scenario.name}
ORIGINAL TASK: ${scenario.prompt}
CONSTRAINT CHANGE: ${scenario.constraint_change}

RESPONSE TO EVALUATE:
${response}

Score each dimension 1-3:
- 1 = Poor (doesn't demonstrate this capability)
- 2 = Adequate (partially demonstrates)
- 3 = Strong (clearly demonstrates)

DIMENSIONS:
1. Selective Transfer: ${dims.selective_transfer || 'What from the original still holds vs needs revision?'}
2. Causal Transparency: ${dims.causal_transparency || 'Can it explain WHY changes are needed?'}
3. Creative Rerouting: ${dims.creative_rerouting || 'Does it find alternatives when blocked?'}
4. Degradation Awareness: ${dims.degradation_awareness || 'Does it flag when things get harder/impossible?'}
5. Output Coherence: ${dims.output_coherence || 'Does it satisfy both original and new constraints?'}

Respond in this exact JSON format (no markdown, no code fences):
{
  "selectiveTransfer": 1-3,
  "causalTransparency": 1-3,
  "creativeRerouting": 1-3,
  "degradationAwareness": 1-3,
  "outputCoherence": 1-3
}`;

  const judgeResponse = await judgeClient.send(
    'You are a precise eval judge. Respond only with valid JSON.',
    [{ role: 'user', content: judgePrompt }],
    1024
  );

  try {
    const parsed = JSON.parse(extractJson(judgeResponse));
    return {
      selectiveTransfer: clamp(parsed.selectiveTransfer, 1, 3),
      causalTransparency: clamp(parsed.causalTransparency, 1, 3),
      creativeRerouting: clamp(parsed.creativeRerouting, 1, 3),
      degradationAwareness: clamp(parsed.degradationAwareness, 1, 3),
      outputCoherence: clamp(parsed.outputCoherence, 1, 3),
    };
  } catch {
    return {
      selectiveTransfer: 1,
      causalTransparency: 1,
      creativeRerouting: 1,
      degradationAwareness: 1,
      outputCoherence: 1,
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Extract JSON from a response that might contain markdown code fences or extra text.
 */
function extractJson(text: string): string {
  // Try extracting from code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try finding JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}
