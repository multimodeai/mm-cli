# CLAUDE.md

Project instructions for Claude Code when building mm-cli.

## ⛔ Rule 0 — the global "verify before acting" rule, applied to mm's evals

When a source could push you toward *"to do X right we need our own experiment/benchmark"* — STOP and read it first to confirm it is a **real experiment with numbers**, not a qualitative essay. Distinguish what a source **claims** from what it **measured**. Reading cost ~2 min; assuming cost a full day (2026-06-24, the Vercel non-experiment).

## Project Overview

mm-cli — a developer tool that operationalizes the 4 disciplines of AI input (Prompt Craft, Context Engineering, Intent Engineering, Specification Engineering) with measurable eval outcomes. 20 CLI commands mapping to the full prompt kit.

**Read `SPEC.md` first** — it contains the complete build specification, architecture, and implementation sessions.

**Read `INTENT.md`** — it encodes tradeoff hierarchies and decision boundaries.

## Key Files

- `SPEC.md` — Full build spec with command map, architecture, 5 implementation sessions
- `INTENT.md` — Why mm exists, priority hierarchy, failure modes, Rigor Test

## Architecture (3 layers)

```
CLI Layer (Commander.js) → src/commands/*.ts
Interview Engine         → src/engine/*.ts (shared by 7 commands)
Eval Engine              → src/eval/*.ts (A/B skill testing)
Claude Client            → src/engine/claude-client.ts (single @anthropic-ai/sdk wrapper)
```

## Prompt Templates

All interview templates implement the 4 disciplines framework as `InterviewConfig` objects in `src/engine/interview-templates.ts`.

## Key Commands

```bash
npx tsx src/index.ts preflight        # Test preflight command
npx tsx src/index.ts skill list       # Test skill list
npx vitest run                        # Run tests
npm run build && npm link             # Build dist/ and install globally as 'mm'
```

**After any code change, run `npm run build` before testing the global `mm` binary.** The bin entry points to `dist/`, not `src/`. If you skip the build, the old binary runs and you will confidently tell the user a feature works when it doesn't.

## E2E Testing — drive the real `mm` binary

Unit tests (`npx vitest run`) are necessary but NOT sufficient — they don't prove a command works for a user. For any command change, reproduce the real invocation:

- Build first, then run the command the way a user would: `mm <command> [args]` (global) or `npx tsx src/index.ts <command>` (source).
- Inspect the **actual output** — generated artifact, printed result, exit code — not just that the process exited 0.
- Interview commands: run the interview through to an artifact. Eval commands: run a real WITH-skill vs WITHOUT-skill A/B and read the scores.
- Reproduce a reported bug at the CLI level (real args/flags) before fixing.

Can't cover cheaply in CI: fully interactive interview loops (need piped stdin) and real API cost/latency — gate those behind a manual/opt-in run, not the default suite.

## Dependencies (strict budget)

Production: `@anthropic-ai/sdk`, `commander`, `yaml`, `chalk`
Dev: `typescript`, `tsx`, `vitest`, `@types/node`

No other deps. If you need functionality, write it — don't add packages.

## Auth — OAuth-First

Priority: `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_SETUP_TOKEN` > `ANTHROPIC_API_KEY`

- OAuth tokens (`sk-ant-oat*`): use `authToken` param + `anthropic-beta: oauth-2025-04-20` header
- API keys (`sk-ant-api*`): use `apiKey` param, no special headers
- See `src/engine/claude-client.ts` for the reference implementation

## Patterns

- Commands follow 3 patterns: Static Output, Interview-to-Artifact, Eval Execution (see SPEC.md)
- Interview engine sends the prompt template as system message, Claude drives conversation
- Eval engine always compares WITH skill vs WITHOUT skill (A/B pattern)
- Default model: `claude-sonnet-4-20250514` for interviews, overridable via `--model`

## Git Commit Guidelines

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- No AI attribution in commits
- Keep messages clean and descriptive

## Versioning Rules

**`package.json`** — bump on every push that ships user-facing changes:
- `patch` (0.x.Y): bug fixes, copy changes, test additions
- `minor` (0.X.0): new commands, new templates, new flags, new skills
- `major` (X.0.0): breaking CLI changes (removed commands, changed output format)

**`SKILL.md` frontmatter `version:`** — bump whenever the file is edited:
- `patch`: content corrections, guardrail tweaks, wording changes
- `minor`: new sections added, output format changed, new edge cases
- Do not leave `version:` unchanged after editing a skill file

**Spec files (`specs/*.md`)** — bump `version:` in frontmatter when acceptance criteria or constraints change. No bump needed for status/date updates only.

**On every commit that modifies `.claude/skills/*/SKILL.md` or `specs/*.md`:** verify the frontmatter `version:` was incremented. If it wasn't, bump patch before committing.
