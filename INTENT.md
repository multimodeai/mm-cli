# mm CLI — Intent & Delegation Framework

## Core Intent

mm exists because AI tools are getting better at following instructions, but humans aren't getting better at giving them. The bottleneck moved from "talking to AI well" to "knowing what you want before AI starts working." mm operationalizes the four disciplines of AI input — Prompt Craft, Context Engineering, Intent Engineering, Specification Engineering — with measurement.

We optimize for **measurable improvement in AI output quality**, not convenience features.

## Priority Hierarchy

When these values conflict, resolve in this order:

1. **Correctness of methodology** — The prompts are research-backed. Don't simplify them for UX convenience. A 7-domain interview that produces a good CLAUDE.md beats a quick wizard that produces a mediocre one.

2. **Measurability** — Every artifact mm produces should be evaluable. If we can't measure whether a skill, spec, or intent doc actually improves output, it's decoration. A/B test with skill vs without — that's the north star.

3. **Developer experience** — CLI should be fast, clear, and Unix-idiomatic. But never sacrifice #1 or #2 for smoother UX. A correct tool that's slightly harder to use beats a polished tool that produces wrong artifacts.

4. **Simplicity of implementation** — ~2,500 lines total. 4 production deps. If a feature requires more than 100 lines to implement, question whether it belongs in v1.

## Decision Authority Map

### Decide Autonomously
- Output formatting (tables, colors, markdown)
- File naming conventions for generated artifacts
- Error message wording
- Test fixture content

### Decide with Notification
- Adding a new dependency (must document why in commit message)
- Changing the interview engine's conversation flow
- Modifying eval scoring thresholds

### Escalate Before Acting
- Modifying the prompt templates (they are carefully calibrated)
- Adding a new command beyond the 16 specified
- Changing the eval YAML format (downstream compatibility)
- Any feature that requires a hosted service or account

## Quality Thresholds

### Routine Work (single commands, bug fixes)
- Tests pass
- No regressions in existing commands
- Follows existing patterns in the codebase

### High-Stakes Work (interview engine, eval engine, new commands)
- Tests pass with edge cases covered
- Manually verify against the original prompt templates
- Run the command end-to-end (not just unit tests)
- Check that generated artifacts match the expected format from the source prompt

### The Boundary
A task is high-stakes if it touches `src/engine/` or `src/eval/` — these are the core engines that everything else depends on.

## Common Failure Modes

1. **Over-engineering the interview engine** — It's tempting to add NLP, branching logic, or complex state machines. The engine is simple: send system prompt to Claude, route stdin/stdout, collect artifact. Claude does the interviewing.

2. **Diverging from the prompt templates** — The templates should remain as-is. Paraphrasing loses the carefully calibrated question sequences and guardrails.

3. **Making evals too complex** — The eval engine is ~350 lines for a reason. It sends prompts, collects outputs, and uses Claude to judge. No custom ML, no vector databases, no embeddings.

4. **Forgetting the A/B pattern** — Every eval must compare WITH skill vs WITHOUT skill. An eval that only runs "with skill" tells you nothing.

5. **Scope creep toward SaaS** — v1 is a CLI tool. No hosted services, no accounts, no dashboards. Local files, git-controlled. Enterprise features are Phase 3+ of go-to-market.

## The Rigor Test

Before finalizing a decision, verify: are we optimizing for **developer convenience** at the expense of **methodology correctness**?

Specifically:
- Does this change make the tool easier to use but produce worse artifacts?
- Are we simplifying an interview because it "takes too long" even though the full version produces better results?
- Are we adding a shortcut that bypasses the eval measurement step?

If yes to any: stop and reconsider.

## What We Explicitly Don't Do

- We don't generate SKILL.md content from codebase analysis (humans write skills)
- We don't host a skill marketplace (git repos are the distribution mechanism)
- We don't support non-Claude models in v1 (BYOK with Anthropic API key)
- We don't build a VS Code extension (CLI first, extension later via StdinIO abstraction)
- We don't customize interview templates in v1 (Enterprise feature)
