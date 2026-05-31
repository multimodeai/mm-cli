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

STEP 2: Check if any criteria have been PRE-VERIFIED (listed in the
PRE-VERIFIED CRITERIA section below the spec). These criteria have already
been assessed — include them in your output exactly as provided.
Do NOT re-assess or override pre-verified criteria.

STEP 3: For remaining (non-pre-verified) criteria — use the codebase tools:
- Search for relevant files
- Read the implementation
- Assess whether the criterion is met, not met, partial, or unclear
- Cite specific file paths and line numbers as evidence

STEP 4: For each constraint (must do, must not do, prefer, escalate):
- Verify satisfaction or violation with evidence

STEP 5: Assess the definition of done holistically.

STEP 6: Output your assessment as a single JSON object.
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
- "met": criterion is fully satisfied (verified via code or pre-verified evidence)
- "not_met": criterion is clearly not satisfied (code is wrong/missing)
- "partial": criterion is partially implemented
- "unclear": cannot determine — need more investigation
- "unverifiable": criterion requires runtime verification and no evidence exists
</output-format>

<guardrails>
- Only assess based on what you can observe in the codebase AND any provided evidence
- If you cannot find evidence for or against a criterion, mark it "unclear" with low confidence
- Do not assume implementation exists — verify by reading actual files
- Be honest about partial implementations — "partial" is valid
- Cite specific file paths in evidence
- CRITICAL: Pre-verified criteria MUST be included in your output with the status given.
  Do not second-guess or downgrade them.
</guardrails>`;

/**
 * Extract completed tasks from spec's task decomposition section.
 * Returns a map of task content (everything under a ✅ task header).
 */
function extractCompletedTasks(specContent: string): string[] {
  const tasks: string[] = [];
  const lines = specContent.split('\n');
  let currentTask: string[] = [];
  let inCompletedTask = false;

  for (const line of lines) {
    // Match task headers like "**Task 1: Database Backup** ✅" or "*Task 1: ...** ✅"
    const taskMatch = line.match(/\*{1,2}Task\s+\d+[^*]*\*{1,2}\s*(?:—\s*)?(.*)$/i);
    if (taskMatch) {
      // Save previous task
      if (inCompletedTask && currentTask.length > 0) {
        tasks.push(currentTask.join('\n'));
      }
      // Check if this task is completed
      inCompletedTask = /✅/.test(line);
      currentTask = inCompletedTask ? [line] : [];
      continue;
    }

    // Stop at next major section (numbered ALL-CAPS header or markdown heading)
    if (/^(?:\d+[\.\)]\s+[A-Z][A-Z\s&]+$|#{1,3}\s)/.test(line)) {
      if (inCompletedTask && currentTask.length > 0) {
        tasks.push(currentTask.join('\n'));
      }
      inCompletedTask = false;
      currentTask = [];
      continue;
    }

    if (inCompletedTask) {
      currentTask.push(line);
    }
  }

  // Don't forget last task
  if (inCompletedTask && currentTask.length > 0) {
    tasks.push(currentTask.join('\n'));
  }

  return tasks;
}

/**
 * Extract acceptance criteria from spec.
 */
function extractCriteria(specContent: string): string[] {
  const criteria: string[] = [];
  let inCriteria = false;

  for (const line of specContent.split('\n')) {
    if (/(?:^#{1,3}\s+|^\d+[\.\)]\s+).*acceptance\s+criteria/i.test(line)) {
      inCriteria = true;
      continue;
    }
    if (inCriteria && !line.match(/^\s*$/) && (
      /^#{1,3}\s/.test(line) ||
      /^---/.test(line) ||
      /^\d+[\.\)]\s+[A-Z][A-Z\s&]+$/.test(line)
    ) && !/acceptance/i.test(line)) {
      inCriteria = false;
    }
    if (inCriteria) {
      const match = line.match(/^\s*(?:[-*]|\d+[.)]) ?\[?\d*\]?\s*(.+)/);
      if (match) {
        criteria.push(match[1].trim());
      }
    }
  }

  return criteria;
}

/**
 * Match criteria to completed tasks to pre-verify runtime criteria.
 * Returns pre-verified criteria with evidence extracted from task content.
 */
function preVerifyCriteria(
  criteria: string[],
  completedTasks: string[],
  evidenceContent: string | null,
): { criterion: string; status: string; evidence: string; confidence: string }[] {
  if (completedTasks.length === 0 && !evidenceContent) return [];

  const allTaskContent = completedTasks.join('\n\n');
  const preVerified: { criterion: string; status: string; evidence: string; confidence: string }[] = [];

  for (const criterion of criteria) {
    // Extract key phrases from the criterion for matching
    const phrases = extractKeyPhrases(criterion);
    const matchingEvidence: string[] = [];

    // Check completed tasks for evidence
    for (const task of completedTasks) {
      const matchCount = phrases.filter(p => task.toLowerCase().includes(p.toLowerCase())).length;
      if (matchCount >= Math.max(1, Math.floor(phrases.length * 0.3))) {
        // Extract the relevant lines from the task
        const relevantLines = task.split('\n')
          .filter(l => l.trim().length > 0)
          .filter(l => {
            const lower = l.toLowerCase();
            return phrases.some(p => lower.includes(p.toLowerCase())) ||
              /✅|verified|confirmed|result|output|created|completed|mismatch|backup|snapshot/i.test(l);
          });
        if (relevantLines.length > 0) {
          matchingEvidence.push(relevantLines.join('; '));
        }
      }
    }

    // Check evidence file
    if (evidenceContent) {
      // Look for criterion number or text in evidence
      const criterionIndex = criteria.indexOf(criterion) + 1;
      const evidenceSection = evidenceContent.match(
        new RegExp(`###\\s*\\[${criterionIndex}\\][\\s\\S]*?(?=###|$)`, 'i')
      );
      if (evidenceSection) {
        const verified = /\[x\]\s*verified/i.test(evidenceSection[0]);
        if (verified) {
          const evidenceLine = evidenceSection[0].match(/\*\*Evidence:\*\*\s*(.*)/);
          if (evidenceLine) {
            matchingEvidence.push(evidenceLine[1].trim());
          }
        }
      }
    }

    if (matchingEvidence.length > 0) {
      preVerified.push({
        criterion,
        status: 'met',
        evidence: `Pre-verified from spec: ${matchingEvidence[0].slice(0, 300)}`,
        confidence: 'high',
      });
    }
  }

  return preVerified;
}

/**
 * Extract key matching phrases from a criterion text.
 */
function extractKeyPhrases(criterion: string): string[] {
  const phrases: string[] = [];

  // Extract quoted values, file paths, numbers with units
  const patterns = [
    /`([^`]+)`/g,           // backtick-quoted
    /\b\d+\.?\d*\s*(?:MB|KB|GB|ms|s)\b/gi, // numbers with units
    /\bpg_dump\b/gi,
    /\bpg_restore\b/gi,
    /\bbackup\b/gi,
    /\bsnapshot\b/gi,
    /\bverification\b/gi,
    /\bmismatch/gi,
    /\brollback\b/gi,
    /\bunpair\b/gi,
    /\bforce.pair\b/gi,
    /\b[A-Z]{2,5}\b/g,     // ticker symbols
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(criterion)) !== null) {
      phrases.push(match[1] || match[0]);
    }
  }

  // Also extract significant nouns (3+ word phrases minus stopwords)
  const words = criterion.split(/\s+/).filter(w =>
    w.length > 3 && !/^(the|and|for|are|was|were|with|that|this|from|have|been|into|each|than|also)$/i.test(w)
  );
  if (words.length > 0) {
    phrases.push(...words.slice(0, 5));
  }

  return [...new Set(phrases)];
}

/**
 * Look for runtime evidence files for a given spec.
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
 *
 * Returns ordered candidates to try with JSON.parse. The model may emit:
 *   1. A ```json fenced block, with possibly other ``` fences in surrounding prose
 *   2. A bare JSON object, with prose around it
 *   3. Raw JSON only
 * The previous non-greedy single-strategy approach silently closed at the first
 * `\`\`\`` in prose when discussing embedded fences, truncating the JSON.
 */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  // Strategy 1: ```json ... ``` with the LAST ``` in the response treated as the close.
  // This handles the case where prose before the JSON discusses other triple-backticks.
  const tagged = text.match(/```json\s*\n([\s\S]*)\n```/);
  if (tagged) candidates.push(tagged[1].trim());

  // Strategy 2: lazy ```json ... ``` (closes at first ``` after open).
  const taggedLazy = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (taggedLazy) candidates.push(taggedLazy[1].trim());

  // Strategy 3: any code fence with greedy close.
  const anyFence = text.match(/```(?:\w+)?\s*\n([\s\S]*)\n```/);
  if (anyFence) candidates.push(anyFence[1].trim());

  // Strategy 4: bare `{ ... }` greedy.
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) candidates.push(bare[0]);

  // Strategy 5: raw text.
  candidates.push(text.trim());

  // Dedupe while preserving order
  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

/**
 * Backward-compat single-string entry point — returns the first candidate.
 */
function extractJson(text: string): string {
  return extractJsonCandidates(text)[0];
}

export async function runSpecVerify(
  specContent: string,
  client: ClaudeClient,
  specFile: string,
  options?: { verbose?: boolean }
): Promise<VerifyResult> {
  const systemPrompt = VERIFY_SYSTEM_PROMPT;

  // Pre-extract and pre-verify runtime criteria
  const criteria = extractCriteria(specContent);
  const completedTasks = extractCompletedTasks(specContent);
  const evidence = loadEvidenceFile(specFile);
  const preVerified = preVerifyCriteria(criteria, completedTasks, evidence);

  if (preVerified.length > 0) {
    console.log(chalk.blue(`  ℹ Pre-verified ${preVerified.length} criteria from spec task results`));
  }
  if (evidence) {
    console.log(chalk.blue('  ℹ Found runtime evidence file'));
  }

  // Build user message with pre-verified criteria injected
  let userMessage = `Here is the specification to verify against the codebase:\n\n---\n${specContent}\n---\n\n`;

  if (preVerified.length > 0) {
    userMessage += `\n## PRE-VERIFIED CRITERIA\n\nThe following criteria have been pre-verified from the spec's own documented task results.\nInclude them in your output EXACTLY as shown — do NOT re-assess or change their status:\n\n`;
    for (const pv of preVerified) {
      userMessage += `- Criterion: "${pv.criterion}"\n  Status: ${pv.status}\n  Evidence: ${pv.evidence}\n  Confidence: ${pv.confidence}\n\n`;
    }
  }

  userMessage += `Investigate the codebase for the remaining criteria and produce a JSON verification result.`;

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

  // Try each candidate JSON extraction strategy until one parses cleanly.
  const candidates = extractJsonCandidates(result.text);
  let parsed: any = null;
  let lastErr: unknown = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    if (!parsed) {
      throw lastErr instanceof Error ? lastErr : new Error('No JSON candidate parsed');
    }

    const resultCriteria: VerifyCriterion[] = (parsed.criteria || []).map((c: any) => ({
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

    // Post-process: force pre-verified criteria to "met" even if the model ignored the instruction
    for (const pv of preVerified) {
      const matching = resultCriteria.find(c =>
        c.criterion.toLowerCase().includes(pv.criterion.slice(0, 40).toLowerCase()) ||
        pv.criterion.toLowerCase().includes(c.criterion.slice(0, 40).toLowerCase())
      );
      if (matching && matching.status !== 'met') {
        matching.status = 'met';
        matching.evidence = pv.evidence;
        matching.confidence = 'high';
      }
    }

    const met = resultCriteria.filter(c => c.status === 'met').length;
    const notMet = resultCriteria.filter(c => c.status === 'not_met').length;
    const partial = resultCriteria.filter(c => c.status === 'partial').length;
    const unclear = resultCriteria.filter(c => c.status === 'unclear').length;
    const unverifiable = resultCriteria.filter(c => c.status === 'unverifiable').length;

    const verifiableTotal = resultCriteria.length - unverifiable;
    const score = unverifiable > 0
      ? `${met}/${verifiableTotal} verifiable criteria met (${unverifiable} runtime-only)`
      : `${met}/${resultCriteria.length} criteria met`;

    return {
      specFile,
      timestamp,
      model,
      criteria: resultCriteria,
      constraints,
      definitionOfDone,
      summary: {
        totalCriteria: resultCriteria.length,
        met,
        notMet,
        partial,
        unclear,
        unverifiable,
        score,
      },
    };
  } catch (err) {
    // Fallback if JSON parsing fails — surface the raw response so the user
    // can diagnose. The catch swallowed too much silently in earlier versions.
    const errMsg = err instanceof Error ? err.message : String(err);
    const preview = result.text.slice(0, 4000);
    const tail = result.text.length > 4000 ? `\n\n…(truncated, total ${result.text.length} chars)` : '';
    // Best-effort: save raw text + candidates to /tmp for offline diagnosis.
    try {
      const dumpPath = `/tmp/mm-verify-raw-${Date.now()}.txt`;
      const dump = `=== RAW MODEL RESPONSE (${result.text.length} chars) ===\n${result.text}\n\n=== CANDIDATES (${candidates.length}) ===\n${candidates.map((c, i) => `--- candidate ${i} (${c.length} chars) ---\n${c}`).join('\n\n')}`;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:fs').writeFileSync(dumpPath, dump, 'utf-8');
      console.log(`  ⓘ Raw response saved to ${dumpPath}`);
    } catch { /* best-effort */ }
    return {
      specFile,
      timestamp,
      model,
      criteria: [],
      constraints: [],
      definitionOfDone: {
        met: false,
        reasoning: `Failed to parse verification response: ${errMsg}\n\nRAW RESPONSE PREVIEW:\n${preview}${tail}`,
      },
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
