import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractArtifact, writeArtifact } from '../../src/engine/artifact-writer.js';
import { SPEC_NEW, SKILL_BUILD } from '../../src/engine/interview-templates.js';

describe('extractArtifact', () => {
  it('extracts SKILL.md from a fenced code block with commentary', () => {
    const response = `Based on my exploration, here's the enhanced skill:

\`\`\`markdown
---
name: udl-analysis
version: 1.0.0
triggers:
  - UDL
---

# UDL Analysis Skill

## Role
You are an RF data analyst.

## Instructions
Analyze UDL data.

## Context
ORION project context.

## Output Format
Markdown tables.

## Guardrails
- Never expose credentials

## Self-Improvement
Track analysis patterns.
\`\`\`

This enhanced skill addresses your key points about transferability.`;

    const result = extractArtifact(response);
    expect(result).toContain('---\nname: udl-analysis');
    expect(result).toContain('## Self-Improvement');
    expect(result).not.toContain('Based on my exploration');
    expect(result).not.toContain('This enhanced skill addresses');
  });

  it('returns raw response when no code fences present', () => {
    const response = `---
name: test-skill
version: 1.0.0
---

# Test Skill

## Role
You are a test expert.`;

    const result = extractArtifact(response);
    expect(result).toBe(response);
  });

  it('picks the block with frontmatter over other blocks', () => {
    const response = `Here's an example snippet:

\`\`\`python
print("hello")
\`\`\`

And the full skill:

\`\`\`markdown
---
name: my-skill
version: 1.0.0
triggers:
  - test
---

# My Skill

## Role
Expert at testing.

## Instructions
Handle test tasks carefully.

## Context
Test project context here.

## Output Format
JSON output.

## Guardrails
- Do not hallucinate

## Self-Improvement
Track results.
\`\`\``;

    const result = extractArtifact(response);
    expect(result).toContain('---\nname: my-skill');
    expect(result).not.toContain('print("hello")');
  });

  it('handles nested code fences inside the artifact', () => {
    const response = `Here's your updated skill:

\`\`\`markdown
---
name: dedupe
version: 1.0.0
triggers:
  - duplicate
---

# Deduplication Skill

## Role
You are a dedup specialist.

## Instructions
Enhance dedup algorithms.

## Context
Current infrastructure details.

## Output Format

### Algorithm Improvements
\`\`\`python
def normalize_name(name: str) -> str:
    return name.lower().strip()
\`\`\`

### SQL Operations
\`\`\`sql
UPDATE masajid SET website = COALESCE(website, 'https://example.com');
\`\`\`

## Guardrails
- Never merge without human verification
- Always preserve the more complete record

## Self-Improvement
Track false positive rates.
\`\`\`

Let me know if you want to refine anything.`;

    const result = extractArtifact(response);
    expect(result).toContain('---\nname: dedupe');
    expect(result).toContain('def normalize_name');
    expect(result).toContain('UPDATE masajid');
    expect(result).toContain('## Guardrails');
    expect(result).toContain('## Self-Improvement');
    expect(result).not.toContain('Here\'s your updated skill');
    expect(result).not.toContain('Let me know');
  });

  it('handles bare code fences (no language tag) inside the artifact', () => {
    const response = `Here's your deploy skill:

\`\`\`markdown
---
name: deploy-protocol
version: 1.0.0
triggers:
  - "deploy"
---

# Deploy Protocol Skill

## Role
You are a deployment protocol enforcer.

## Instructions

### Post-Deploy Checklist
\`\`\`bash
curl -s https://example.com/api/status
\`\`\`

### Pre-Deploy Template
\`\`\`
Environment: [Bawarchi|ICFC]
ACTIVE_SKILL: [verified]
Config: [wrangler.jsonc]
\`\`\`

## Guardrails
- Never deploy without verification
- Always confirm target environment

## Self-Improvement
Track deployment success rates.
\`\`\`

Let me know if you want changes.`;

    const result = extractArtifact(response);
    expect(result).toContain('---\nname: deploy-protocol');
    expect(result).toContain('curl -s https://example.com/api/status');
    expect(result).toContain('Environment: [Bawarchi|ICFC]');
    expect(result).toContain('## Guardrails');
    expect(result).toContain('## Self-Improvement');
    expect(result).not.toContain('Here\'s your deploy skill');
    expect(result).not.toContain('Let me know');
  });

  it('preserves all sections when artifact is split across multiple ```text blocks', () => {
    // Regression: spec was being truncated to just the longest section because
    // each section was emitted as its own ```text fenced block.
    const section = (n: number, name: string, lineCount: number) =>
      `\`\`\`text\n${n}. ${name}\n${Array.from({ length: lineCount }, (_, i) => `Detail line ${i} for section ${n}.`).join('\n')}\n\`\`\``;

    const response = `Here is the spec.

${section(1, 'OVERVIEW', 30)}

---

${section(2, 'ACCEPTANCE CRITERIA', 80)}

---

${section(3, 'CONSTRAINTS', 60)}

---

${section(4, 'TASK DECOMPOSITION', 200)}

---

${section(8, 'DEFINITION OF DONE', 20)}

**SPECIFICATION QUALITY CHECK:**
Trailing notes that should be kept.`;

    const result = extractArtifact(response);
    expect(result).toContain('1. OVERVIEW');
    expect(result).toContain('2. ACCEPTANCE CRITERIA');
    expect(result).toContain('3. CONSTRAINTS');
    expect(result).toContain('4. TASK DECOMPOSITION');
    expect(result).toContain('8. DEFINITION OF DONE');
    expect(result).toContain('SPECIFICATION QUALITY CHECK');
    expect(result.trimStart()).not.toMatch(/^4\. TASK DECOMPOSITION/);
  });

  it('ignores small code blocks that are just examples', () => {
    const response = `Use this command:

\`\`\`
uv run python -c "print('test')"
\`\`\`

That's how you run it.`;

    const result = extractArtifact(response);
    // Small block (<20 lines), no frontmatter — return raw response
    expect(result).toBe(response);
  });
});

describe('extractArtifact — signature-anchored path', () => {
  const MARKER = '=== PROJECT SPECIFICATION ===';

  it('extracts the full spec when marker is at line 1 and an embedded ```markdown block appears mid-document', () => {
    // Regression for 2026-05-15 failure: extractTaggedBlock was matching the
    // embedded ```markdown block at Task 1.2, returning only "# MM-CLI Content
    // Pipeline" onward instead of the full spec.
    const response = `=== PROJECT SPECIFICATION ===
Project: MM-CLI Content Pipeline
Date: 2026-05-15
Status: Draft

1. OVERVIEW
A pipeline that tracks content drafts and their publication status.

2. ACCEPTANCE CRITERIA
The pipeline ingests markdown files and produces a QUEUE.md index.

3. CONSTRAINT ARCHITECTURE
Must Do: Use deterministic file ordering.
Must Not Do: Do not modify source markdown files.

4. TASK DECOMPOSITION

Task 1.2 — Format example
Output: a QUEUE.md file shaped like this:

\`\`\`markdown
# MM-CLI Content Pipeline

| Status | Title | Path |
|--------|-------|------|
| draft  | foo   | foo.md |
\`\`\`

Task 1.3 — Implement ingestion
Walk drafts/ recursively and emit one row per .md file.

5. EVALUATION CRITERIA
Run the pipeline against the fixtures/ folder and diff output.

6. FAILURE PATTERN ANALYSIS
Specification Drift applies — mitigated by per-task acceptance checks.

7. CONTEXT & REFERENCE
Existing content lives in drafts/.

8. DEFINITION OF DONE
QUEUE.md is generated, idempotent, and matches the fixture.

TO USE THIS SPEC:
Paste this spec into a fresh AI session and execute against it.

Let me know if you want me to adjust anything.`;

    const result = extractArtifact(response, MARKER);
    expect(result.startsWith('=== PROJECT SPECIFICATION ===')).toBe(true);
    expect(result).toContain('8. DEFINITION OF DONE');
    expect(result).not.toMatch(/^# MM-CLI Content Pipeline/);
    // Trailing chat should be stripped
    expect(result).not.toContain('Let me know if you want me to adjust');
  });

  it('matches the marker fence-AGNOSTICALLY when wrapped in a ```text/```markdown fence', () => {
    // Contract change (2026-06-01): the marker path is now fence-agnostic. The
    // real spec failure had `=== PROJECT SPECIFICATION ===` wrapped in a ```text
    // title block (interview.ts:303 instructs the model to language-tag every
    // fence). The OLD findUnfencedLine treated that wrapper as "marker inside a
    // fence" and abandoned the marker path, falling into the heuristic parsers
    // that truncate long specs. The marker is unique and never appears inside
    // legitimate code, so the first exact match IS the artifact start, wrapper
    // and all. See docs/BUG_artifact-truncation.md.
    const response = `Here's the spec:

\`\`\`text
=== PROJECT SPECIFICATION ===
Project: example
\`\`\`

1. OVERVIEW
A real document body that follows the wrapped title block.`;

    const result = extractArtifact(response, MARKER);
    // Output starts at the marker; the ```text wrapper (open + bare ``` close)
    // and the leading chat preamble are stripped.
    expect(result.startsWith(MARKER)).toBe(true);
    expect(result).not.toContain('```');
    expect(result).not.toContain("Here's the spec");
    // Body after the wrapper is preserved (never sliced at the fence).
    expect(result).toContain('1. OVERVIEW');
    expect(result).toContain('A real document body');
  });

  it('preserves legacy behavior when marker is absent (no third arg)', () => {
    const response = `Based on my exploration, here's the enhanced skill:

\`\`\`markdown
---
name: legacy-test
version: 1.0.0
---

# Legacy Test Skill

## Role
Test role.

## Instructions
Test instructions.

## Context
Test context.

## Output Format
Test output.

## Guardrails
Test guardrails.

## Self-Improvement
Test self-improvement.
\`\`\`

That's the skill.`;

    const withMarker = extractArtifact(response);
    const withoutMarker = extractArtifact(response, undefined);
    expect(withMarker).toBe(withoutMarker);
    expect(withMarker).toContain('---\nname: legacy-test');
    expect(withMarker).toContain('## Self-Improvement');
  });

  it('treats empty-string marker as undefined and falls back to heuristics', () => {
    const response = `Here's an artifact:

\`\`\`markdown
---
name: empty-marker-test
version: 1.0.0
---

# Empty Marker Test

## Role
Some role.

## Instructions
Some instructions.

## Context
Some context.

## Output Format
Some output.

## Guardrails
Some guardrails.

## Self-Improvement
Some improvement.
\`\`\``;

    const result = extractArtifact(response, '');
    // Empty string is falsy — signature path skipped, heuristic fallback runs.
    expect(result).toContain('---\nname: empty-marker-test');
    expect(result).toContain('## Self-Improvement');
  });

  it('writeArtifact saves a file whose first line is the marker (end-to-end)', () => {
    // AC#16: deterministic equivalent of `mm spec new artifact-test-fixture`.
    // Failure-shape fixture goes through writeArtifact → file on disk.
    const failureShape = `Sure, here's the spec:

=== PROJECT SPECIFICATION ===
Project: artifact-test-fixture
Date: 2026-05-15
Status: Draft

1. OVERVIEW
A pipeline tracker.

4. TASK DECOMPOSITION
Task 1.2 — Format example
\`\`\`markdown
# MM-CLI Content Pipeline

| Status | Title |
|--------|-------|
| draft  | foo   |
\`\`\`

8. DEFINITION OF DONE
QUEUE.md is generated and matches the fixture.

TO USE THIS SPEC:
Paste this into a fresh AI session.

Let me know if you want changes.`;

    const out = join(tmpdir(), `mm-spec-fixture-${Date.now()}.md`);
    try {
      writeArtifact(out, failureShape, SPEC_NEW.artifactStartMarker);
      const saved = readFileSync(out, 'utf-8');
      const firstLine = saved.split('\n')[0];
      const lastNonBlank = saved.trimEnd().split('\n').pop();

      expect(SPEC_NEW.artifactStartMarker).toBe('=== PROJECT SPECIFICATION ===');
      expect(firstLine).toBe('=== PROJECT SPECIFICATION ===');
      expect(saved).toContain('8. DEFINITION OF DONE');
      expect(saved).not.toContain('Let me know if you want changes');
      expect(saved.trimStart().startsWith('# MM-CLI Content Pipeline')).toBe(false);
      // Last line comes from the artifact body / TO USE THIS SPEC appendix, not chat
      expect(lastNonBlank).not.toMatch(/^Let me know/);
    } finally {
      try { rmSync(out); } catch { /* tmp file cleanup is best-effort */ }
    }
  });

  it('writeArtifact preserves legacy behavior for templates with no marker', () => {
    // Backward-compat sanity: SKILL_BUILD has no artifactStartMarker.
    // Output through writeArtifact must equal output from the heuristic chain alone.
    const skillResponse = `Based on my exploration, here's the skill:

\`\`\`markdown
---
name: legacy-write
version: 1.0.0
---

# Legacy Write Skill

## Role
Test role.

## Instructions
Test instructions.

## Context
Test context.

## Output Format
Test output.

## Guardrails
Test guardrails.

## Self-Improvement
Test improvement.
\`\`\`

Let me know if you want changes.`;

    expect(SKILL_BUILD.artifactStartMarker).toBeUndefined();

    const out = join(tmpdir(), `mm-skill-fixture-${Date.now()}.md`);
    try {
      writeArtifact(out, skillResponse, SKILL_BUILD.artifactStartMarker);
      const saved = readFileSync(out, 'utf-8');
      const expected = extractArtifact(skillResponse);
      expect(saved).toBe(expected);
    } finally {
      try { rmSync(out); } catch { /* tmp file cleanup is best-effort */ }
    }
  });

  it('falls back when marker is provided but missing entirely from the response', () => {
    const response = `Based on my exploration, here's the enhanced skill:

\`\`\`markdown
---
name: no-marker
version: 1.0.0
---

# No Marker Skill

## Role
Role.

## Instructions
Instructions.

## Context
Context.

## Output Format
Format.

## Guardrails
Guardrails.

## Self-Improvement
Improvement.
\`\`\``;

    const result = extractArtifact(response, '=== NEVER APPEARS ===');
    // Marker not found → fallback heuristic chain runs → tagged block extracted.
    expect(result).toContain('---\nname: no-marker');
    expect(result).toContain('## Self-Improvement');
  });
});
