import { describe, it, expect } from 'vitest';
import { extractArtifact } from '../../src/engine/artifact-writer.js';

/**
 * Regression test for the recurring `mm spec new` truncation bug.
 *
 * Reproduces the EXACT 3-bug interaction documented in
 * docs/BUG_artifact-truncation.md, modelled on the real failure
 * (/Users/hfox/Developments/amanah/specs/amanah-gateway.md):
 *
 *   1. findUnfencedLine's single-boolean fence toggle: the ```text wrapper
 *      around the title block flips `inFence` over the marker line, so the
 *      signature-anchored path returns -1 and is abandoned.
 *   2. extractMultiBlockArtifact: the no-marker fallback that then runs
 *      anchors the artifact end to the LAST code fence, dropping every
 *      fence-free prose section that follows (a spec's §5–§8 + footer).
 *   3. interview.ts:303 FORMATTING RULE instructs the model to ALWAYS wrap
 *      blocks in language-tagged fences (```text/```python/...), which is the
 *      precise input that triggers bug #1.
 *
 * The amanah-gateway spec is private IP and this is a public repo, so the
 * fixture is a structurally-faithful synthetic spec — same shape, generic
 * content — rather than the verbatim document.
 */

const MARKER = '=== PROJECT SPECIFICATION ===';

/** Build a fixture that reproduces the 3-bug interaction. */
function buildFixture(): string {
  // (c) ≥10 embedded language-tagged code fences across the body.
  const codeBlock = (lang: string, n: number) =>
    '```' + lang + '\n' +
    Array.from({ length: n }, (_, i) => `line ${i} of a ${lang} block`).join('\n') +
    '\n```';

  return [
    // (a) one-line chat preamble
    `Here's the complete specification for the gateway service:`,
    ``,
    // (b) title block wrapped in a ```text fence (the wrapper that triggers bug #1)
    '```text',
    MARKER,
    `Project: gateway-service — L0 Redaction Gateway`,
    `Date: 2026-06-02`,
    `Status: Ready for execution`,
    '```',
    ``,
    `> **Review note:** patched after the first save truncated mid-Task-7.`,
    ``,
    `---`,
    ``,
    `## 1. OVERVIEW`,
    ``,
    `A FastAPI sidecar that scrubs PII before payloads leave Malaysian soil.`,
    ``,
    `## 2. ACCEPTANCE CRITERIA`,
    ``,
    `Each criterion is independently verifiable by running the stated command.`,
    ``,
    `## 3. CONSTRAINT ARCHITECTURE`,
    ``,
    `### Must Do`,
    `- Fail closed on any redaction error.`,
    ``,
    `## 4. TASK DECOMPOSITION`,
    ``,
    `### Task 1 — Repo scaffold`,
    ``,
    `**Output:**`,
    codeBlock('text', 18),
    ``,
    // A ```markdown example block appearing EARLY (Task 1) — extremely common in
    // real specs (showing an example output file). When the signature path is
    // defeated by the ```text wrapper (bug #1), extractTaggedBlock latches onto
    // this block and slices first-```markdown .. last-``` — dropping both the
    // head (title + everything above here) AND the fence-free tail (§5–§8).
    `**Example README excerpt the executor should produce:**`,
    '```markdown',
    `# Gateway Service`,
    ``,
    `| Status | Endpoint |`,
    `|--------|----------|`,
    `| ok     | /health  |`,
    '```',
    ``,
    `**config.py Settings fields:**`,
    codeBlock('python', 20),
    ``,
    `### Task 2 — Store protocol`,
    codeBlock('python', 22),
    ``,
    `### Task 3 — Recognizers`,
    codeBlock('python', 30),
    ``,
    `Another recognizer module:`,
    codeBlock('python', 25),
    ``,
    `### Task 4 — Redaction engine`,
    codeBlock('python', 40),
    ``,
    `### Task 5 — Proxy endpoint`,
    codeBlock('python', 24),
    ``,
    `Run the service:`,
    codeBlock('bash', 6),
    ``,
    `### Task 6 — Test corpus`,
    codeBlock('python', 16),
    ``,
    `curl demo:`,
    codeBlock('bash', 9),
    ``,
    `### Task 7 — Docker`,
    ``,
    `**Dockerfile stages:**`,
    codeBlock('dockerfile', 17),
    ``,
    `**docker-compose.yml:**`,
    // This is the LAST code fence in the document. Everything below is prose.
    codeBlock('yaml', 8),
    ``,
    `---`,
    ``,
    // (d) several FENCE-FREE sections after the last fence
    `## 5. EVALUATION CRITERIA`,
    ``,
    `| Criterion | Measurement |`,
    `|-----------|-------------|`,
    `| Recall | 100% on deterministic entities |`,
    ``,
    `## 6. FAILURE PATTERN ANALYSIS`,
    ``,
    `**Silent Failure — Applies, and is the highest-risk pattern.**`,
    `A PII entity slips through because confidence fell below threshold.`,
    ``,
    `## 7. CONTEXT & REFERENCE`,
    ``,
    `The gateway is L0 in the four-layer stack. No dependency on L1–L3.`,
    ``,
    `## 8. DEFINITION OF DONE`,
    ``,
    `The Week 1 POC is done when all of the following are simultaneously true:`,
    `1. The full test suite passes.`,
    `2. The linter exits 0.`,
    ``,
    `## TO USE THIS SPEC`,
    ``,
    `1. Start a fresh session in the monorepo root.`,
    `2. Paste this entire specification as the opening message.`,
    `3. Execute task by task, in order.`,
    ``,
    // (e) trailing chat line
    `Let me know if you want me to adjust anything.`,
  ].join('\n');
}

describe('extractArtifact — long-spec truncation regression (3-bug interaction)', () => {
  const fixture = buildFixture();

  it('preserves fence-free trailing sections (§8 + footer) after the last code fence', () => {
    const result = extractArtifact(fixture, MARKER);
    expect(result).toContain('8. DEFINITION OF DONE');
    expect(result).toContain('TO USE THIS SPEC');
  });

  it('does not end at the last ```yaml / ```dockerfile block — trailing prose survives', () => {
    const result = extractArtifact(fixture, MARKER);
    const lastNonBlank = result.trimEnd().split('\n').pop()!.trim();
    // The output must not terminate inside or at the close of the last code
    // fence (the docker-compose yaml block). The footer is the real tail.
    expect(lastNonBlank).not.toBe('```');
    expect(lastNonBlank).toContain('Execute task by task');
  });

  it('strips the chat preamble and ```text wrapper — output starts at the marker', () => {
    const result = extractArtifact(fixture, MARKER);
    expect(result.startsWith(MARKER)).toBe(true);
    expect(result).not.toContain(`Here's the complete specification`);
    // The ```text wrapper open immediately preceded the marker; its bare ```
    // closer (right after the title block) must be gone too.
    const titleRegion = result.split('## 1. OVERVIEW')[0];
    expect(titleRegion).not.toContain('```');
  });

  it('strips the trailing chat line', () => {
    const result = extractArtifact(fixture, MARKER);
    expect(result).not.toContain('Let me know if you want me to adjust');
  });

  it('round-trips to within ~2% of (input minus preamble/wrapper/trailing chat)', () => {
    const result = extractArtifact(fixture, MARKER);
    const lines = fixture.split('\n');
    // Expected content = everything except the preamble (line 0 + blank),
    // the two ```text wrapper lines, and the trailing chat line.
    const stripped = lines
      .filter((l, i) => i > 1) // drop preamble + its blank line
      .filter((l) => l.trim() !== '```text')
      .filter((l) => !l.startsWith('Let me know if you want me to adjust'))
      .join('\n');
    // Remove the single orphaned wrapper-close ``` that closed the title block.
    const expectedApproxLen = stripped.replace(/^```$/m, '').trim().length;
    const ratio = result.trim().length / expectedApproxLen;
    expect(ratio).toBeGreaterThan(0.98);
    expect(ratio).toBeLessThan(1.02);
  });
});
