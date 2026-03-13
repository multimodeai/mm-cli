import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import type { ClaudeClient } from '../engine/claude-client.js';
import { CODEBASE_TOOLS } from '../engine/tools.js';
import type { VerifyResult, VerifyCriterion, VerifyConstraint } from './types.js';

const VERIFY_MAX_TOOL_LOOPS = 30;
const VERIFY_MAX_TOKENS = 16384;

const VERIFY_SYSTEM_PROMPT = `<role>
You are a specification verification judge. You read a project specification
and investigate the codebase to determine whether each acceptance criterion
has been met, each constraint is satisfied, and the definition of done is achieved.
</role>

<instructions>
You have access to codebase tools: read_file, list_files, search_files.

STEP 1: Read the spec carefully. Extract every acceptance criterion, every
constraint, and the definition of done.

STEP 2: Classify each criterion:
- CODE criteria: can be verified by reading source code, configs, migrations, SQL files
- RUNTIME criteria: can only be verified by running code, checking database state,
  inspecting files on disk outside the repo, or observing runtime behavior
  (e.g. "backup created", "tables verified at runtime", "calculations match to the penny")

STEP 3: For CODE criteria — use the codebase tools to investigate:
- Search for relevant files
- Read the implementation
- Assess whether the criterion is met, not met, partial, or unclear
- Cite specific file paths and line numbers as evidence

STEP 4: For RUNTIME criteria — check if an evidence file was provided.
If evidence was included in the prompt (under RUNTIME EVIDENCE), use it to assess
whether the criterion was verified. If the evidence confirms the criterion, mark
it as "met" with the evidence text. If the evidence shows failure, mark "not_met".
If NO evidence file was provided for a runtime criterion, mark it as "unverifiable"
with confidence "high" and explain that this criterion requires runtime verification
(not a code deficiency — the code may be correct but cannot be statically verified).

STEP 5: For each constraint (must do, must not do, prefer, escalate):
- Verify satisfaction or violation with evidence

STEP 6: Assess the definition of done holistically.
- When calculating whether DoD is met, exclude "unverifiable" criteria — they are
  not failures, they are out of scope for static verification.

STEP 7: Output your assessment as a single JSON object.
</instructions>

<output-format>
Return ONLY a JSON object matching this schema:
{
  "criteria": [
    { "criterion": "...", "status": "met|not_met|partial|unclear|unverifiable", "evidence": "...", "confidence": "high|medium|low" }
  ],
  "constraints": [
    { "constraint": "...", "type": "must_do|must_not|prefer|escalate", "status": "satisfied|violated|not_assessed", "evidence": "..." }
  ],
  "definitionOfDone": { "met": true|false, "reasoning": "..." }
}

Status guide:
- "met": criterion is fully satisfied (verified via code or evidence)
- "not_met": criterion is clearly not satisfied (code is wrong/missing)
- "partial": criterion is partially implemented
- "unclear": cannot determine — need more investigation
- "unverifiable": criterion requires runtime verification and no evidence was provided
</output-format>

<guardrails>
- Only assess based on what you can observe in the codebase AND any provided evidence
- If you cannot find evidence for or against a criterion, mark it "unclear" with low confidence
- Do not assume implementation exists — verify by reading actual files
- Be honest about partial implementations — "partial" is valid
- Cite specific file paths in evidence
- IMPORTANT: "unverifiable" is NOT the same as "not_met". A runtime criterion with correct
  code but no runtime evidence should be "unverifiable", not "not_met".
</guardrails>`;

/**
 * Look for runtime evidence files for a given spec.
 * Checks: verify/evidence/<spec-name>.md, verify/evidence/<spec-name>.json
 */
function loadEvidenceFile(specFile: string): string | null {
  const specName = basename(specFile, '.md');
  const cwd = process.cwd();

  const candidates = [
    join(cwd, 'verify', 'evidence', `${specName}.md`),
    join(cwd, 'verify', 'evidence', `${specName}.json`),
    join(cwd, 'verify', 'evidence', `${specName}.txt`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return readFileSync(candidate, 'utf-8');
      } catch {
        // ignore read errors
      }
    }
  }

  return null;
}

/**
 * Extract JSON from a response that might contain markdown code fences or extra text.
 */
function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text.trim();
}

export async function runSpecVerify(
  specContent: string,
  client: ClaudeClient,
  specFile: string,
  options?: { verbose?: boolean }
): Promise<VerifyResult> {
  const systemPrompt = VERIFY_SYSTEM_PROMPT;

  // Check for runtime evidence file
  const evidence = loadEvidenceFile(specFile);

  let userMessage = `Here is the specification to verify against the codebase:\n\n---\n${specContent}\n---\n\n`;

  if (evidence) {
    userMessage += `\n\n## RUNTIME EVIDENCE\n\nThe following runtime verification evidence was provided:\n\n---\n${evidence}\n---\n\nUse this evidence to assess runtime criteria that cannot be verified via source code alone.\n\n`;
    console.log(chalk.blue('  ℹ Found runtime evidence file — including in verification context'));
  }

  userMessage += `Investigate the codebase thoroughly and produce a JSON verification result.`;

  const apiMessages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const onToolUse = (name: string, input: Record<string, unknown>) => {
    const detail = input.path || input.pattern || input.file_pattern || input.query || '';
    console.log(chalk.dim(`  ⚙ ${name}(${detail})`));
  };

  const result = await client.sendWithTools(
    systemPrompt,
    apiMessages,
    CODEBASE_TOOLS as Anthropic.Tool[],
    onToolUse,
    VERIFY_MAX_TOKENS,
    VERIFY_MAX_TOOL_LOOPS,
  );

  const timestamp = new Date().toISOString();
  const model = client.getModel();

  try {
    const parsed = JSON.parse(extractJson(result.text));

    const criteria: VerifyCriterion[] = (parsed.criteria || []).map((c: any) => ({
      criterion: c.criterion || '',
      status: validateStatus(c.status),
      evidence: c.evidence || '',
      confidence: validateConfidence(c.confidence),
    }));

    const constraints: VerifyConstraint[] = (parsed.constraints || []).map((c: any) => ({
      constraint: c.constraint || '',
      type: validateConstraintType(c.type),
      status: validateConstraintStatus(c.status),
      evidence: c.evidence || '',
    }));

    const definitionOfDone = {
      met: Boolean(parsed.definitionOfDone?.met),
      reasoning: parsed.definitionOfDone?.reasoning || '',
    };

    const met = criteria.filter(c => c.status === 'met').length;
    const notMet = criteria.filter(c => c.status === 'not_met').length;
    const partial = criteria.filter(c => c.status === 'partial').length;
    const unclear = criteria.filter(c => c.status === 'unclear').length;
    const unverifiable = criteria.filter(c => c.status === 'unverifiable').length;

    const verifiableTotal = criteria.length - unverifiable;
    const score = unverifiable > 0
      ? `${met}/${verifiableTotal} verifiable criteria met (${unverifiable} runtime-only)`
      : `${met}/${criteria.length} criteria met`;

    return {
      specFile,
      timestamp,
      model,
      criteria,
      constraints,
      definitionOfDone,
      summary: {
        totalCriteria: criteria.length,
        met,
        notMet,
        partial,
        unclear,
        unverifiable,
        score,
      },
    };
  } catch {
    // Fallback if JSON parsing fails
    return {
      specFile,
      timestamp,
      model,
      criteria: [],
      constraints: [],
      definitionOfDone: { met: false, reasoning: 'Failed to parse verification response' },
      summary: {
        totalCriteria: 0,
        met: 0,
        notMet: 0,
        partial: 0,
        unclear: 0,
        unverifiable: 0,
        score: 'Parse error — no criteria extracted',
      },
    };
  }
}

function validateStatus(s: string): VerifyCriterion['status'] {
  if (['met', 'not_met', 'partial', 'unclear', 'unverifiable'].includes(s)) return s as VerifyCriterion['status'];
  return 'unclear';
}

function validateConfidence(c: string): VerifyCriterion['confidence'] {
  if (['high', 'medium', 'low'].includes(c)) return c as VerifyCriterion['confidence'];
  return 'low';
}

function validateConstraintType(t: string): VerifyConstraint['type'] {
  if (['must_do', 'must_not', 'prefer', 'escalate'].includes(t)) return t as VerifyConstraint['type'];
  return 'must_do';
}

function validateConstraintStatus(s: string): VerifyConstraint['status'] {
  if (['satisfied', 'violated', 'not_assessed'].includes(s)) return s as VerifyConstraint['status'];
  return 'not_assessed';
}

export { VERIFY_SYSTEM_PROMPT };
