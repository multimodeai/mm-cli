import type Anthropic from '@anthropic-ai/sdk';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import type { ClaudeClient } from '../engine/claude-client.js';
import { CODEBASE_TOOLS } from '../engine/tools.js';
import type { VerifyResult, VerifyCriterion, VerifyConstraint } from './types.js';

const VERIFY_MAX_TOOL_LOOPS = 30;
const VERIFY_MAX_TOKENS = 16384;
const CHECK_TIMEOUT_MS = 600_000;

const VERIFY_SYSTEM_PROMPT = `<role>
You are a specification verification judge. You read a project specification
and investigate the codebase to determine whether each acceptance criterion
has been met, each constraint is satisfied, and the definition of done is achieved.
</role>

<instructions>
You have access to codebase tools: read_file, list_files, search_files.

STEP 1: Read the spec carefully. Extract every acceptance criterion, every
constraint, and the definition of done.

STEP 2: Some criteria may carry MACHINE-CHECKED results (below the spec) — a
check COMMAND was actually executed and its exit code / output decided the
verdict. These are ground truth. Report them EXACTLY as given; do NOT override,
soften, or re-assess them. They are more authoritative than anything you can
infer from reading code.

STEP 3: For the REMAINING criteria (no machine check) — use the codebase tools:
- Search for relevant files, read the implementation.
- Assess whether the criterion is met, not met, partial, or unclear.
- Cite specific file paths and line numbers as evidence.
- You are reading code, not running it. Your verdict is an opinion, not a proof.
  Never claim "high" confidence for something only a running command could prove
  (a test passing, a command being denied, an exit code). Use "medium" at most,
  and prefer "unverifiable" when the criterion demands runtime evidence you cannot
  observe by reading files.

STEP 4: For each constraint (must do, must not do, prefer, escalate):
- Verify satisfaction or violation with evidence.

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
- "met": criterion is fully satisfied.
- "not_met": criterion is clearly not satisfied (code is wrong/missing).
- "partial": criterion is partially implemented.
- "unclear": cannot determine — need more investigation.
- "unverifiable": criterion requires runtime verification and no evidence exists.
</output-format>

<guardrails>
- Only assess based on what you can observe in the codebase AND the machine-checked results.
- Do NOT assume an implementation exists — verify by reading actual files.
- Do NOT infer a criterion is met because the spec's own notes CLAIM a task was completed.
  An author's claim of completion is not evidence; code or an executed check is.
- Be honest about partial implementations — "partial" is valid.
- Reserve "high" confidence for machine-checked criteria only. Static reading is "medium" at most.
- MACHINE-CHECKED criteria MUST appear in your output with the status given. Never downgrade or upgrade them.
</guardrails>`;

/**
 * A single line of the machine-check contract: `AC<n> PASS|FAIL|SKIP <detail>`.
 */
export interface CheckResult {
  acNum: number;
  verdict: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

/**
 * Extract acceptance criteria from the spec, in document order.
 * criteria[n-1] corresponds to the spec's "AC<n>".
 */
export function extractCriteria(specContent: string): string[] {
  const criteria: string[] = [];
  let inCriteria = false;

  for (const line of specContent.split('\n')) {
    if (/(?:^#{1,3}\s+|^\d+[\.\)]\s+).*acceptance\s+criteria/i.test(line)) {
      inCriteria = true;
      continue;
    }
    // A new section closes the criteria block. A section heading is a markdown
    // heading, a `---` rule, or a NUMBERED ALL-CAPS title. "All-caps" is detected
    // as "contains no lowercase letter", so punctuation in the title (e.g.
    // "OPEN QUESTIONS / NOTES") no longer smuggles the block open into the next
    // section — while a real criterion like "1. `Foo` works" (has lowercase) is
    // never mistaken for a heading.
    if (inCriteria && !line.match(/^\s*$/) && (
      /^#{1,3}\s/.test(line) ||
      /^---/.test(line) ||
      /^\d+[.)]\s+[A-Z0-9][^a-z]*$/.test(line)
    ) && !/acceptance/i.test(line)) {
      inCriteria = false;
    }
    if (inCriteria) {
      // A criterion line starts with a bullet, a number, OR a bare checkbox,
      // then an OPTIONAL checkbox/bracket-number ([ ] [x] [1]), then the text.
      // The leading marker is required so wrapped prose continuation lines are
      // skipped; the bare-checkbox alternative supports `[ ] ...` task lists.
      const match = line.match(
        /^\s*(?:(?:[-*]|\d+[.)])\s*(?:\[[ xX\d]*\]\s*)?|\[[ xX\d]*\]\s*)(.+)/,
      );
      if (match) {
        criteria.push(match[1].trim());
      }
    }
  }

  return criteria;
}

/**
 * Locate the executable check manifest for a spec.
 * Convention: verify/checks/<spec-name>.sh (or the same path without .sh),
 * unless an explicit path is supplied.
 */
export function locateCheckScript(
  specFile: string,
  projectRoot: string,
  explicit?: string,
): string | null {
  if (explicit) return existsSync(explicit) ? explicit : null;
  const name = basename(specFile, '.md');
  const candidates = [
    join(projectRoot, 'verify', 'checks', `${name}.sh`),
    join(projectRoot, 'verify', 'checks', name),
  ];
  return candidates.find(p => existsSync(p)) ?? null;
}

/**
 * Run the check manifest. The script is EXPECTED to print, on stdout, one line
 * per checked criterion in the form `AC<n> PASS|FAIL|SKIP <detail>`. It may exit
 * non-zero when any check FAILs — that is not an error, the per-line verdicts are
 * the source of truth. Returns the parsed results plus the raw log.
 */
export function runChecks(
  scriptPath: string,
  projectRoot: string,
): { results: CheckResult[]; log: string } {
  let out = '';
  try {
    out = execFileSync('bash', [scriptPath], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: CHECK_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e: any) {
    // A non-zero exit (any FAIL) still carries the per-line verdicts on stdout/stderr.
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (!out && e.message) out = e.message;
  }

  const results: CheckResult[] = [];
  const seen = new Set<number>();
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*AC\s*#?\s*(\d+)\s+(PASS|FAIL|SKIP)\b\s*(.*)$/i);
    if (m) {
      const acNum = parseInt(m[1], 10);
      if (seen.has(acNum)) continue; // first verdict per AC wins
      seen.add(acNum);
      results.push({
        acNum,
        verdict: m[2].toUpperCase() as CheckResult['verdict'],
        detail: m[3].trim(),
      });
    }
  }
  return { results, log: out };
}

/**
 * Extract JSON from a response that might contain markdown code fences or extra text.
 */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const tagged = text.match(/```json\s*\n([\s\S]*)\n```/);
  if (tagged) candidates.push(tagged[1].trim());
  const taggedLazy = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (taggedLazy) candidates.push(taggedLazy[1].trim());
  const anyFence = text.match(/```(?:\w+)?\s*\n([\s\S]*)\n```/);
  if (anyFence) candidates.push(anyFence[1].trim());
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) candidates.push(bare[0]);
  candidates.push(text.trim());

  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

export interface RunSpecVerifyOptions {
  verbose?: boolean;
  /** explicit path to a check manifest (overrides the convention lookup). */
  checksPath?: string;
  /** project root used to resolve the check manifest + run it. */
  projectRoot?: string;
  /** skip the executable check layer entirely (judge-only, clearly labelled). */
  noChecks?: boolean;
}

export async function runSpecVerify(
  specContent: string,
  client: ClaudeClient,
  specFile: string,
  options?: RunSpecVerifyOptions,
): Promise<VerifyResult> {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const criteria = extractCriteria(specContent);

  // --- 1. Executable check layer (ground truth) ---------------------------- //
  let checkResults: CheckResult[] = [];
  let checksRan = false;
  if (!options?.noChecks) {
    const scriptPath = locateCheckScript(specFile, projectRoot, options?.checksPath);
    if (scriptPath) {
      console.log(chalk.blue(`  ⚙ Running check manifest: ${scriptPath}`));
      const { results } = runChecks(scriptPath, projectRoot);
      checkResults = results;
      checksRan = true;
      const pass = results.filter(r => r.verdict === 'PASS').length;
      const fail = results.filter(r => r.verdict === 'FAIL').length;
      const skip = results.filter(r => r.verdict === 'SKIP').length;
      console.log(chalk.blue(`  ⚙ Executed ${results.length} checks: ${pass} PASS, ${fail} FAIL, ${skip} SKIP`));
    } else {
      console.log(chalk.yellow('  ⚠ No check manifest found (verify/checks/<spec>.sh) — this run is JUDGE-ONLY (static, unproven).'));
    }
  }

  const checkByAc = new Map<number, CheckResult>();
  for (const r of checkResults) checkByAc.set(r.acNum, r);

  // --- 2. LLM judge for the remaining criteria ----------------------------- //
  let userMessage = `Here is the specification to verify against the codebase:\n\n---\n${specContent}\n---\n\n`;

  if (checkResults.length > 0) {
    userMessage += `\n## MACHINE-CHECKED CRITERIA (ground truth — a command was executed)\n\n`;
    userMessage += `These verdicts came from actually running a check command. Report them EXACTLY; do NOT override:\n\n`;
    for (const r of checkResults) {
      const idx = r.acNum - 1;
      const text = idx >= 0 && idx < criteria.length ? criteria[idx] : `(AC${r.acNum})`;
      const status = r.verdict === 'PASS' ? 'met' : r.verdict === 'FAIL' ? 'not_met' : 'unverifiable';
      userMessage += `- AC${r.acNum}: ${status.toUpperCase()} — "${text.slice(0, 90)}"\n  Executed result: ${r.detail || r.verdict}\n\n`;
    }
    userMessage += `Investigate the codebase ONLY for the criteria NOT listed above, then produce the JSON.\n`;
  } else {
    userMessage += `No machine checks were available. Investigate the codebase for every criterion and produce the JSON.\n`;
  }

  const apiMessages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  const onToolUse = (name: string, input: Record<string, unknown>) => {
    const detail = input.path || input.pattern || input.file_pattern || input.query || '';
    console.log(chalk.dim(`  ⚙ ${name}(${detail})`));
  };

  const result = await client.sendWithTools(
    VERIFY_SYSTEM_PROMPT,
    apiMessages,
    CODEBASE_TOOLS as Anthropic.Tool[],
    onToolUse,
    VERIFY_MAX_TOKENS,
    VERIFY_MAX_TOOL_LOOPS,
  );

  const timestamp = new Date().toISOString();
  const model = client.getModel();

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

    // --- 2b. Index-canonical merge ----------------------------------------- //
    // The EXTRACTED criteria (in spec order) are the canonical list; output slot i
    // is the spec's AC(i+1). Each slot is filled by authority: an executed check
    // for AC(i+1) (ground truth) > the judge's verdict best-matched to that
    // criterion (static) > "unclear" (judge was silent). An executed result can
    // therefore NEVER clobber a different criterion (the old index-fallback bug
    // silently deleted a real not_met), and a judged 'high' is capped to 'medium'.
    const judgePool: (VerifyCriterion & { used?: boolean })[] = (parsed.criteria || []).map((c: any) => {
      const status = validateStatus(c.status);
      let confidence = validateConfidence(c.confidence);
      if (confidence === 'high') confidence = 'medium';
      return {
        criterion: c.criterion || '',
        status,
        evidence: c.evidence || '',
        confidence,
        source: status === 'unverifiable' ? 'unverified' : 'judged',
      } as VerifyCriterion & { used?: boolean };
    });

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const overlap = (a: string, b: string): number => {
      const A = new Set(norm(a).split(' ').filter(Boolean));
      const B = new Set(norm(b).split(' ').filter(Boolean));
      if (!A.size || !B.size) return 0;
      let inter = 0;
      for (const t of A) if (B.has(t)) inter++;
      return inter / Math.min(A.size, B.size);
    };
    const takeJudge = (text: string): VerifyCriterion | null => {
      let best = -1;
      let bestScore = 0.5; // require real token overlap, not a coincidental substring
      for (let j = 0; j < judgePool.length; j++) {
        if (judgePool[j].used) continue;
        const s = overlap(text, judgePool[j].criterion);
        if (s > bestScore) { bestScore = s; best = j; }
      }
      if (best < 0) return null;
      judgePool[best].used = true;
      const { used: _u, ...c } = judgePool[best];
      return { ...c, criterion: text };
    };
    const executedFor = (acNum: number, text: string): VerifyCriterion => {
      const r = checkByAc.get(acNum)!;
      const status: VerifyCriterion['status'] =
        r.verdict === 'PASS' ? 'met' : r.verdict === 'FAIL' ? 'not_met' : 'unverifiable';
      return {
        criterion: text || `AC${acNum}`,
        status,
        evidence: `Executed check (AC${acNum}): ${r.detail || r.verdict}`,
        confidence: status === 'unverifiable' ? 'low' : 'high',
        source: status === 'unverifiable' ? 'unverified' : 'executed',
      };
    };

    const resultCriteria: VerifyCriterion[] = [];
    if (criteria.length > 0) {
      for (let i = 0; i < criteria.length; i++) {
        const acNum = i + 1;
        const text = criteria[i];
        if (checkByAc.has(acNum)) {
          resultCriteria.push(executedFor(acNum, text));
        } else {
          resultCriteria.push(
            takeJudge(text) ?? {
              criterion: text,
              status: 'unclear',
              evidence: 'No judgement returned for this criterion.',
              confidence: 'low',
              source: 'judged',
            },
          );
        }
      }
      // An executed check for an AC number OUTSIDE the extracted range is a manifest
      // bug — surface it, never silently inject a phantom PROVEN criterion.
      for (const r of checkResults) {
        if (r.acNum < 1 || r.acNum > criteria.length) {
          console.log(chalk.yellow(`  ⚠ Check emitted AC${r.acNum} but the spec has ${criteria.length} criteria — ignored (fix the manifest).`));
        }
      }
    } else {
      // Criteria could not be extracted — report the judge's list, applying executed
      // results by position (best effort), and say so loudly.
      console.log(chalk.yellow('  ⚠ Could not extract acceptance criteria from the spec; reporting the judge list as-is.'));
      for (const j of judgePool) { const { used: _u, ...c } = j; resultCriteria.push(c); }
      for (const r of checkResults) {
        const idx = r.acNum - 1;
        if (idx >= 0 && idx < resultCriteria.length) {
          resultCriteria[idx] = executedFor(r.acNum, resultCriteria[idx].criterion);
        }
      }
    }

    const constraints: VerifyConstraint[] = (parsed.constraints || []).map((c: any) => ({
      constraint: c.constraint || '',
      type: validateConstraintType(c.type),
      status: validateConstraintStatus(c.status),
      evidence: c.evidence || '',
    }));

    // --- 4. Counts + honest DoD (computed here, not taken from the LLM) ----- //
    const met = resultCriteria.filter(c => c.status === 'met').length;
    const notMet = resultCriteria.filter(c => c.status === 'not_met').length;
    const partial = resultCriteria.filter(c => c.status === 'partial').length;
    const unclear = resultCriteria.filter(c => c.status === 'unclear').length;
    const unverifiable = resultCriteria.filter(c => c.status === 'unverifiable').length;
    const proven = resultCriteria.filter(c => c.source === 'executed' && c.status === 'met').length;
    const failed = resultCriteria.filter(c => c.source === 'executed' && c.status === 'not_met').length;
    const judged = resultCriteria.filter(c => c.source === 'judged').length;

    const total = resultCriteria.length;
    // "Provably done" = EVERY criterion proven met by an executed check. A judged-met
    // criterion (LLM opinion) does NOT satisfy the DoD, and a judge-only run (nothing
    // executed) can never be done. This is the whole point: no green off opinion.
    const provenAll = total > 0 && resultCriteria.every(c => c.source === 'executed' && c.status === 'met');
    const dodMet = checksRan && provenAll;
    const judgedMet = met - proven; // "met" resting on judgement, not execution

    let dodReasoning: string;
    if (!checksRan) {
      dodReasoning = `JUDGE-ONLY run (no check manifest) — nothing was executed, so nothing is PROVEN and the DoD cannot be met. `
        + `Add verify/checks/${basename(specFile, '.md')}.sh to make this provable and repeatable. `
        + `(${met} judged-met, ${notMet} not-met, ${partial} partial, ${unclear} unclear, ${unverifiable} runtime-only.)`;
    } else if (dodMet) {
      dodReasoning = `Provably done: all ${total} criteria PROVEN by executed checks.`;
    } else {
      const gaps: string[] = [];
      if (failed > 0) gaps.push(`${failed} FAILED a check`);
      if (notMet - failed > 0) gaps.push(`${notMet - failed} judged not-met`);
      if (partial > 0) gaps.push(`${partial} partial`);
      if (unclear > 0) gaps.push(`${unclear} unclear`);
      if (unverifiable > 0) gaps.push(`${unverifiable} unproven/runtime-only`);
      if (judgedMet > 0) gaps.push(`${judgedMet} judged-met but UNPROVEN (add a check)`);
      dodReasoning = `Not provably done: ${gaps.join(', ')}. ${proven}/${total} proven by execution.`;
    }

    const score = checksRan
      ? `${proven}/${total} PROVEN by execution` + (judged > 0 ? `, ${judged} judged` : '') + (failed > 0 ? `, ${failed} FAILED` : '')
      : `${met}/${total} judged met (0 proven — judge-only run)`;

    return {
      specFile,
      timestamp,
      model,
      criteria: resultCriteria,
      constraints,
      definitionOfDone: { met: dodMet, reasoning: dodReasoning },
      summary: {
        totalCriteria: total,
        met,
        notMet,
        partial,
        unclear,
        unverifiable,
        proven,
        failed,
        judged,
        checksRan,
        score,
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const preview = result.text.slice(0, 4000);
    const tail = result.text.length > 4000 ? `\n\n…(truncated, total ${result.text.length} chars)` : '';
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
        totalCriteria: 0, met: 0, notMet: 0, partial: 0, unclear: 0, unverifiable: 0,
        proven: 0, failed: 0, judged: 0, checksRan,
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
