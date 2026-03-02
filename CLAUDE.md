# CLAUDE.md

Project instructions for Claude Code when building mm-cli.

## Project Overview

mm-cli — a developer tool that operationalizes the 4 disciplines of AI input (Prompt Craft, Context Engineering, Intent Engineering, Specification Engineering) with measurable eval outcomes. 16 CLI commands mapping to the full prompt kit.

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
npm link                              # Install globally as 'mm'
```

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
