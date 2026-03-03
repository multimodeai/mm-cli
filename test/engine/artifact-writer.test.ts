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
