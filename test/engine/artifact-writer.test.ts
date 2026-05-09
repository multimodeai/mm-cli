import { describe, it, expect } from 'vitest';
import { extractArtifact } from '../../src/engine/artifact-writer.js';

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
