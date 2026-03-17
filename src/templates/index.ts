// Embedded templates — avoids readFileSync + __dirname issues in compiled dist/

export const PREFLIGHT_TEMPLATE = `# Pre-flight Checklist

Before you send your next prompt to an AI, answer these 7 questions:

1. **What is the actual outcome I need?**
   Not "help me with X" — what artifact, decision, or action should exist when this is done?

2. **What does the AI need to know that it doesn't?**
   Domain context, codebase conventions, constraints, prior decisions — what's in your head that isn't in the prompt?

3. **What would a bad response look like?**
   Define the failure modes. If you can't describe what wrong looks like, you can't evaluate what right looks like.

4. **Am I asking one clear thing or bundling multiple requests?**
   Compound prompts get compound (confused) answers. One intent per interaction.

5. **Have I specified the format I want?**
   Code? Bullet points? A table? A diff? If you don't specify, you'll get whatever the model defaults to.

6. **What's my evaluation criteria?**
   How will you know if the response is good? "It looks right" isn't a criteria. What specific qualities matter?

7. **Would a skilled colleague understand this prompt without asking clarifying questions?**
   If a senior engineer would need to ask follow-ups, the AI will silently guess instead.

---

*Run \`mm diagnose\` to score your current AI workflow across all 4 disciplines.*`;

export const SKILL_SCAFFOLD_MD = `---
name: {{NAME}}
version: 1.0.0
triggers:
  - "{{NAME}}"
---

# {{NAME}} Skill

## Role
You are an expert at {{NAME}}.

## Instructions
<!-- Define what this skill does, when it activates, and how it behaves -->

## Context
<!-- Add domain knowledge, conventions, and constraints the AI needs -->

## Output Format
<!-- Specify the exact format for responses -->

## Guardrails
<!-- Define failure modes and what NOT to do -->

## Self-Improvement
<!-- After eval results: what patterns scored well? What needs adjustment? -->`;

export const TILE_SCAFFOLD_JSON = `{
  "name": "{{NAME}}",
  "version": "1.0.0",
  "description": "",
  "triggers": ["{{NAME}}"],
  "skill_file": "SKILL.md",
  "eval_suite": null
}`;

export const EVAL_SCAFFOLD_YAML = `name: {{NAME}}-eval
skill: .claude/skills/{{NAME}}/SKILL.md
model: claude-sonnet-4-6
judge: claude-sonnet-4-6

scenarios:
  - name: basic-usage
    prompt: |
      # TODO: Describe a task this skill should handle well
    context: |
      # TODO: Add relevant context
    expected_qualities:
      - # TODO: What a good response looks like
    failure_modes:
      - # TODO: What a bad response looks like
    scoring:
      excellent: 5
      acceptable: 3
      poor: 1`;
