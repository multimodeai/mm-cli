# mm CLI — Build Specification

## Context

`mm-cli` — the tool that manages skills, runs evals, and scaffolds ALL four disciplines of AI input. The core insight: **skills without evals are just vibes, and evals without intent/spec engineering are just benchmarks**.

The prompt kit contains **10 interview templates** covering all 4 disciplines. This spec integrates ALL of them.

---

## Command Map

| Command | Template | Input | Output File | Interview? |
|---------|----------|-------|-------------|-----------|
| `mm preflight` | Pre-flight Checklist | None (prints checklist) | stdout (optionally `PREFLIGHT.md`) | No |
| `mm diagnose` | Rapid Diagnostic | 5-question interview | `CONTEXT.md` (starter) | Yes (5 Qs) |
| `mm diagnose --deep` | Deep Diagnostic | 12-question interview, 6 groups | `DIAGNOSTIC.md` + `ROADMAP.md` | Yes (12 Qs) |
| `mm rewrite` | Problem Statement Rewriter | stdin/file with vague requests | stdout or `REWRITE.md` | Partial (clarifying Qs) |
| `mm context build` | Context Doc Builder | 7-domain deep interview | Smart: see below | Yes (7 domains) |
| `mm spec new [name]` | Specification Engineer | 3-phase interview | `SPEC.md` or `specs/<name>.md` | Yes (3 phases) |
| `mm intent init` | Intent & Delegation Framework | 3-phase interview | `INTENT.md` | Yes (3 phases) |
| `mm eval new <skill>` | Eval Harness Builder | 2-phase interview | `evals/<skill>/eval.yaml` | Yes (2 phases) |
| `mm eval new <skill> --quick` | Eval (auto mode) | Reads SKILL.md | `evals/<skill>/eval.yaml` | No |
| `mm eval run <skill>` | Eval engine | eval.yaml + Claude API | `evals/<skill>/results/<ts>.json` | No |
| `mm eval compare <skill>` | Multi-Axis A/B | Two result sets | Comparison table stdout | No |
| `mm constraint <task>` | Constraint Architecture | 3-phase interview | `constraints/<task>.md` | Yes (3 phases) |
| `mm skill new <name>` | Skill management | Interactive prompts | `.claude/skills/<name>/SKILL.md` + `tile.json` | Minimal |
| `mm skill list` | Skill management | Reads filesystem | stdout table | No |
| `mm skill validate [name]` | Skill management | Reads SKILL.md files | stdout report | No |
| `mm skill export --format cursor` | Multi-format export | Reads `.claude/skills/` | `.cursorrules` or equivalent | No |

**16 commands. Zero gaps. Every prompt mapped.**

### `mm context build` — Smart Output Logic

CLAUDE.md is a **routing table** (30-60 lines max, ~100 ceiling). It points to skills. Skills hold the actual knowledge. `mm context build` respects this:

| Scenario | Output | Why |
|---|---|---|
| No CLAUDE.md exists | Scaffold `CLAUDE.md` (~60 lines: overview, skills table, key commands, git rules) | Bootstrap a new project |
| CLAUDE.md exists, no business-context skill | `.claude/skills/business-context/SKILL.md` + add row to CLAUDE.md routing table | Don't bloat the router — add a skill |
| CLAUDE.md exists + business-context skill | Update `.claude/skills/business-context/SKILL.md` | Refresh existing skill |

The interview output (7-domain personal context) always becomes a **skill** in existing projects. The skill activates on: `strategy, marketing, audience, business, goals, priorities, planning`.

When scaffolding a fresh CLAUDE.md, the command also:
1. Detects project type (package.json → Node, Cargo.toml → Rust, etc.)
2. Suggests key commands based on detected tooling
3. Creates the `.claude/skills/` directory
4. Adds the business-context skill as the first entry in the routing table

---

## Key Decisions

- **Custom eval engine** (NOT promptfoo) — `@anthropic-ai/sdk` only, ~350 lines
- **4 production deps** — `@anthropic-ai/sdk`, `commander`, `yaml`, `chalk`
- **Claude-as-interviewer** — send the prompt template as system prompt, let Claude drive the conversation adaptively. The engine just routes between Claude and stdin.
- **Default model: Sonnet** — fast + cheap for interviews. `--model` flag overrides.
- **OAuth-first auth** — Priority: `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_API_KEY`. OAuth tokens (`sk-ant-oat*`) use `authToken` param + beta headers. API keys use `apiKey` param.

---

## Project Structure

```
mm-cli/
├── package.json                     # bin: { mm: "./dist/cli.js" }
├── tsconfig.json
├── vitest.config.ts
├── CLAUDE.md                        # Dogfooding
├── INTENT.md                        # Dogfooding
├── SPEC.md                          # This file
│
├── src/
│   ├── index.ts                     # Commander.js entry point
│   │
│   ├── commands/
│   │   ├── preflight.ts             # mm preflight
│   │   ├── diagnose.ts              # mm diagnose [--deep]
│   │   ├── rewrite.ts               # mm rewrite
│   │   ├── context.ts               # mm context build
│   │   ├── spec.ts                  # mm spec new [name]
│   │   ├── intent.ts                # mm intent init
│   │   ├── eval.ts                  # mm eval new|run|compare
│   │   ├── constraint.ts            # mm constraint <task>
│   │   └── skill.ts                 # mm skill new|list|validate|export
│   │
│   ├── engine/                      # SHARED INTERVIEW ENGINE (core)
│   │   ├── interview.ts             # runInterview() orchestrator (~200 lines)
│   │   ├── interview-types.ts       # InterviewConfig, Phase, QuestionGroup
│   │   ├── interview-templates.ts   # ALL 8 prompt templates as InterviewConfig data (~500 lines)
│   │   ├── claude-client.ts         # @anthropic-ai/sdk wrapper (~80 lines)
│   │   ├── artifact-writer.ts       # Write SPEC.md, INTENT.md, etc. (~60 lines)
│   │   └── stdin-io.ts              # readline I/O for interviews (~50 lines)
│   │
│   ├── eval/                        # EVAL ENGINE
│   │   ├── types.ts                 # EvalSuite, EvalCase, ManifoldScore (~40 lines)
│   │   ├── runner.ts                # Execute evals with/without skill (~150 lines)
│   │   ├── scorer.ts                # Quality checks + Multi-Axis 5-dim (~100 lines)
│   │   └── comparator.ts            # A/B comparison table (~50 lines)
│   │
│   ├── skill/                       # SKILL MANAGEMENT
│   │   ├── manager.ts               # CRUD for .claude/skills/
│   │   ├── validator.ts             # Check SKILL.md structure + tile.json
│   │   └── exporter.ts              # Convert to cursor/windsurf formats
│   │
│   ├── templates/                   # Static scaffolds
│   │   ├── preflight.md             # The 7 questions
│   │   ├── skill-scaffold.md
│   │   ├── tile-scaffold.json
│   │   └── eval-scaffold.yaml
│   │
│   └── util/
│       ├── fs.ts                    # Project root detection, paths
│       ├── format.ts                # Tables, markdown rendering
│       └── config.ts                # .mmrc handling
│
├── evals/                           # Default eval output dir
├── test/
│   ├── engine/                      # Interview engine tests
│   ├── eval/                        # Eval engine tests
│   ├── commands/                    # Command tests
│   └── fixtures/                    # Sample SKILL.md, eval YAML
```

**~2,500 total lines** across source + tests.

---

## Architecture — Three Layers

```
┌──────────────────────────────────────────────────┐
│              CLI Layer (Commander.js)              │
│  src/commands/*.ts — 16 commands                  │
│  Parses args → picks InterviewConfig → orchestrates│
└──────────┬────────────────────┬───────────────────┘
           │                    │
┌──────────▼──────────┐  ┌─────▼──────────────────┐
│  Interview Engine    │  │    Eval Engine          │
│  src/engine/*.ts     │  │  src/eval/*.ts          │
│  Multi-phase Claude  │  │  A/B skill testing      │
│  interviews → files  │  │  Multi-Axis 5-dim   │
└──────────┬──────────┘  └─────┬──────────────────┘
           │                    │
┌──────────▼────────────────────▼──────────────────┐
│        Claude Client (@anthropic-ai/sdk)          │
│  src/engine/claude-client.ts — single wrapper     │
└──────────────────────────────────────────────────┘
```

**Key insight:** 7 of 9 prompt-based commands use the SAME interview engine. Each prompt becomes a declarative `InterviewConfig` — the engine sends the system prompt to Claude, Claude drives the conversation, the engine routes stdin responses back. Zero custom NLP logic.

### Claude Client — OAuth-First Auth

```typescript
// src/engine/claude-client.ts
function createClient(model?: string): Anthropic {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_SETUP_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (oauthToken) {
    return new Anthropic({
      authToken: oauthToken,
      defaultHeaders: {
        'anthropic-beta': 'oauth-2025-04-20',
        'user-agent': 'mm-cli/0.1.0',
      },
    });
  }

  if (apiKey) {
    return new Anthropic({ apiKey });
  }

  throw new Error('No auth configured. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
}
```

Priority: `CLAUDE_CODE_OAUTH_TOKEN` > `ANTHROPIC_SETUP_TOKEN` > `ANTHROPIC_API_KEY`
OAuth tokens start with `sk-ant-oat` — use `authToken` param + beta headers.
API keys start with `sk-ant-api` — use `apiKey` param, no special headers.

### Interview Engine Core Pattern

```typescript
interface InterviewConfig {
  id: string;                     // e.g., "spec-new", "intent-init"
  systemPrompt: string;           // <role> + <instructions> text
  phases: InterviewPhase[];       // Ordered phases with question groups
  artifactTemplate: string;       // Output format from <output> block
  guardrails: string[];           // From <guardrails> block
  enableTools?: boolean;          // When true, Claude can explore the codebase
}

async function runInterview(
  config: InterviewConfig,
  client: ClaudeClient,
  io: StdinIO
): Promise<{ artifact: string; transcript: Message[] }>
```

### Codebase Tool Use (Critical for Spec/Eval/Constraint)

Commands that produce specifications, eval harnesses, or constraint docs **must** be able to explore the local codebase. Without this, the output is generic boilerplate — not grounded in actual code.

**Implementation:** `src/engine/tools.ts` — three tools exposed to Claude via the Anthropic API's native tool use:

| Tool | What it does | Example |
|------|-------------|---------|
| `read_file` | Read any file in the project | `read_file({ path: "lib/db/schema.ts" })` |
| `list_files` | Find files by name pattern | `list_files({ pattern: "*.ts", path: "src/" })` |
| `search_files` | Grep file contents with regex | `search_files({ pattern: "ffmpeg", file_pattern: "*.ts" })` |

**Which commands get tools:**

| Command | Tools? | Why |
|---------|--------|-----|
| `mm spec new` | Yes | Must read codebase to write grounded specs |
| `mm eval new` | Yes | Must read SKILL.md + codebase to generate test cases |
| `mm constraint` | Yes | Must understand codebase to define constraint architecture |
| `mm diagnose` | No | Assesses user practices, not code |
| `mm context build` | No | Captures personal/business context |
| `mm intent init` | No | Captures human priorities |
| `mm rewrite` | No | Rewrites a text prompt |

**How it works:** When `InterviewConfig.enableTools` is true, the interview engine:
1. Appends a `<tools-context>` block to the system prompt telling Claude to use tools proactively
2. Uses `ClaudeClient.sendWithTools()` instead of `send()` for API calls
3. Maintains a separate `apiMessages` array (with tool_use/tool_result content blocks) alongside the simple transcript
4. Prints `⚙ tool_name(detail)` to stderr when Claude uses a tool, so the user sees what's happening
5. Handles the tool loop (Claude requests → execute locally → send result → Claude continues) with a 25-iteration safety limit

**Security:** Tools are sandboxed to the current working directory. Path traversal outside `process.cwd()` is rejected. File output is truncated at 10KB. Shell commands have timeouts (5s for find, 10s for grep).

### Interview UX Rules

1. **Auto-save immediately** — Write the artifact to disk as soon as Claude finishes generating it, BEFORE any follow-up prompt. Never gate the save behind a y/N question.
2. **Clear completion signal** — Print `Saved to <filename>` immediately after artifact generation.
3. **Explicit follow-up prompt** — If offering to continue, say exactly what continuing does: `"Follow up on your results? (Ask questions, refine the document, etc.) (y/N)"` — not a vague "Continue the conversation?"
4. **Default to exit** — `N` is the default. The artifact is already saved. Pressing Enter exits cleanly.
5. **No dangling state** — If the user presses Ctrl-C at any point after the artifact is generated, the file should already be on disk.

### Eval Engine — Multi-Axis Integration

```typescript
// Multi-Axis 5 scoring dimensions (1-3 each, max 15)
interface ManifoldScore {
  selectiveTransfer: number;      // What still holds vs needs revision?
  causalTransparency: number;     // Can it explain WHY?
  creativeRerouting: number;      // Finds alternatives when blocked?
  degradationAwareness: number;   // Flags harder/impossible?
  outputCoherence: number;        // Satisfies original + new constraint?
}

// A/B testing: with skill vs without skill
// mm eval run <skill>                → with SKILL.md loaded
// mm eval run <skill> --without-skill → baseline
// mm eval compare <skill>            → delta table
```

---

## Implementation Sessions

### Session 1: Foundation (~2-3 hours)

**Goal:** Repo scaffold + CLI entry + preflight + skill management.

Build:
1. Scaffold repo: `npm init`, install deps (`@anthropic-ai/sdk`, `commander`, `yaml`, `chalk`, dev: `typescript`, `tsx`, `vitest`)
2. `src/index.ts` — Commander.js root with all subcommand registrations
3. `src/commands/preflight.ts` — Print the 7 pre-flight questions
4. `src/commands/skill.ts` — `skill new`, `skill list`, `skill validate`
5. `src/skill/manager.ts` — CRUD for `.claude/skills/<name>/`
6. `src/skill/validator.ts` — Check SKILL.md frontmatter, line count (<200), self-improvement section
7. `src/util/fs.ts` — Project root detection
8. `src/templates/` — Static templates (preflight.md, skill-scaffold.md, tile-scaffold.json)
9. `CLAUDE.md` for mm-cli itself (dogfooding)

**Verify:**
- [ ] `mm preflight` prints the 7 pre-flight questions
- [ ] `mm skill new test-skill` creates `.claude/skills/test-skill/SKILL.md` + `tile.json`
- [ ] `mm skill list` shows table of skills in current project
- [ ] `mm skill validate` reports structural issues (missing frontmatter, oversized)
- [ ] `mm --help` shows all commands
- [ ] `vitest run` passes (>=3 tests)

### Session 2: Interview Engine + First Commands (~2-3 hours)

**Goal:** The shared interview engine + `mm diagnose` + `mm rewrite` proving it works.

Build:
1. `src/engine/claude-client.ts` — Anthropic SDK wrapper
2. `src/engine/stdin-io.ts` — readline-based user I/O
3. `src/engine/interview-types.ts` — All types
4. `src/engine/interview.ts` — Core `runInterview()` function
5. `src/engine/interview-templates.ts` — Templates for `DIAGNOSE_QUICK` (Q1) and `REWRITE` (Q2)
6. `src/engine/artifact-writer.ts` — Write output files
7. `src/commands/diagnose.ts` — `mm diagnose` using DIAGNOSE_QUICK template
8. `src/commands/rewrite.ts` — `mm rewrite` (reads from stdin or file arg)
9. `src/util/config.ts` — `.mmrc` loading, env var resolution

**Verify:**
- [ ] `echo "update the dashboard" | mm rewrite` runs Q2 interview, outputs rewritten problem statement with gap map
- [ ] `mm diagnose` conducts 5-question interview, produces scored 4-discipline table + starter CONTEXT.md
- [ ] `--dry-run` flag prints the messages array without calling API
- [ ] Ctrl-C gracefully interrupts interview
- [ ] `vitest run` passes with mock Claude response tests

### Session 3: All Remaining Interview Commands (~2-3 hours)

**Goal:** All 6 remaining interview commands. Fast because engine already exists — just new templates + thin wrappers.

Build:
1. Add templates to `interview-templates.ts`:
   - `DIAGNOSE_DEEP` — 12-question deep diagnostic + 4-month roadmap
   - `CONTEXT_BUILD` — 7-domain personal context document
   - `SPEC_NEW` — Specification engineer, 3 phases
   - `INTENT_INIT` — Intent & delegation framework, 3 phases
   - `EVAL_HARNESS` — Eval harness builder, 2 phases
   - `CONSTRAINT_DESIGNER` — Constraint architecture, 3 phases
2. `src/commands/context.ts` — `mm context build`
3. `src/commands/spec.ts` — `mm spec new [name]`
4. `src/commands/intent.ts` — `mm intent init`
5. `src/commands/constraint.ts` — `mm constraint <task>`
6. Update `src/commands/diagnose.ts` for `--deep` flag
7. Stub `src/commands/eval.ts` with `eval new --interview` (interview mode only)

**Verify:**
- [ ] `mm diagnose --deep` produces DIAGNOSTIC.md + ROADMAP.md with 1-10 scoring
- [ ] `mm context build` produces CLAUDE.md through 7-domain interview
- [ ] `mm spec new auth-system` produces `specs/auth-system.md` with all 7 sections
- [ ] `mm intent init` produces INTENT.md with Priority Hierarchy, Decision Authority Map, Quality Thresholds, Rigor Test
- [ ] `mm constraint deploy-pipeline` produces `constraints/deploy-pipeline.md` with 4-quadrant structure
- [ ] `mm eval new my-skill --interview` produces `evals/my-skill/eval.yaml`

### Session 4: Eval Engine + Multi-Axis (~2-3 hours)

**Goal:** Custom eval engine with A/B skill testing and Multi-Axis 5-dimension scoring.

Build:
1. `src/eval/types.ts` — EvalSuite, EvalCase, ManifoldScore, EvalResult
2. `src/eval/runner.ts` — Execute eval suite against Claude API (with/without skill)
3. `src/eval/scorer.ts` — Quality checkbox scoring + Multi-Axis 5-dim scoring via Claude-as-judge
4. `src/eval/comparator.ts` — A/B comparison table
5. Complete `src/commands/eval.ts`:
   - `mm eval new <skill> --quick` — auto-generate eval from SKILL.md
   - `mm eval run <skill>` — execute with skill loaded
   - `mm eval run <skill> --without-skill` — execute baseline
   - `mm eval compare <skill>` — display delta table
6. `src/templates/eval-scaffold.yaml`
7. Tests with fixture data

**Verify:**
- [ ] `mm eval new my-skill --quick` reads SKILL.md, generates eval YAML with 3-5 test cases
- [ ] `mm eval run my-skill` executes all cases, writes results JSON
- [ ] `mm eval run my-skill --without-skill` runs same cases without SKILL.md
- [ ] `mm eval compare my-skill` shows side-by-side score deltas
- [ ] Multi-Axis dimensions scored when constraint variations present
- [ ] Eval engine total: <=400 lines

### Session 5: Export, Polish, Dogfooding (~2-3 hours)

**Goal:** Multi-format export, global install, full dogfooding pass.

Build:
1. `src/skill/exporter.ts` — Convert `.claude/skills/` to `.cursorrules` / `.windsurfrules`
2. Update `src/commands/skill.ts` with `skill export --format cursor|windsurf|merged`
3. Dogfooding pass — run `mm` against its own repo
4. Global flags: `--verbose`, `--dry-run`, `--json`
5. Error handling: missing API key, missing files, invalid YAML
6. `npm link` for global install
7. Finalize mm-cli's own CLAUDE.md, INTENT.md, SPEC.md

**Verify:**
- [ ] `mm skill export --format cursor` produces valid `.cursorrules`
- [ ] `npm link && mm --help` works globally
- [ ] All 16 commands functional
- [ ] `vitest run` passes (>=15 tests)

---

## Eval YAML Format

```yaml
name: database-skill-eval
skill: .claude/skills/database/SKILL.md
model: claude-sonnet-4-20250514
judge: claude-sonnet-4-20250514

scenarios:
  - name: prisma-query
    prompt: |
      Write a Prisma query that fetches all users with role 'admin'
      along with their most recent login sessions.
    context: |
      Node.js API using Prisma ORM with PostgreSQL.
    expected_qualities:
      - Uses Prisma client API, not raw SQL
      - References correct model/field names
      - Includes relation loading for sessions
    failure_modes:
      - Uses raw SQL instead of Prisma client
      - Wrong field names from hallucination
    scoring:
      excellent: 5
      acceptable: 3
      poor: 1

  - name: constraint-shift-pagination
    base_scenario: prisma-query
    constraint_change: |
      Also add cursor-based pagination with a limit of 20.
      Results must be sorted by lastLoginAt descending.
    manifold_dimensions:
      selective_transfer: "Original role filter + session include unchanged, only add pagination"
      causal_transparency: "Should explain cursor vs offset pagination tradeoffs"
      creative_rerouting: "If cursor field has duplicates, needs secondary sort key"
      degradation_awareness: "Flag that cursor pagination doesn't support arbitrary page jumps"
      output_coherence: "Must still filter admins + load sessions AND paginate correctly"
```

---

## Cost Estimate

- Interview commands: ~2-5 API calls per interview (~$0.02-0.10)
- Eval run: 4 calls per scenario (baseline + skilled + judge x2). 3 scenarios = ~$0.10-0.50
- Total dev cost for building + testing: ~$5-10

---

## What We're NOT Building (v1 Open Source)

| Out of Scope | Why |
|---|---|
| Web UI / dashboard | CLI-first. Web is Phase D / Enterprise. |
| promptfoo integration | Custom engine only, decision made |
| OpenAI / Gemini model support | Claude only for v1 |
| Resume interrupted interviews | Too complex for v1. Ctrl-C = restart |
| VS Code extension | Future. StdinIO abstraction enables it later |
| Auto-generate SKILL.md from codebase | Unbounded. `mm skill new` scaffolds; human fills |
| Cloud sync / team features | Local-first. Git is the sync mechanism. Enterprise feature. |
| Custom interview questions | Templates are fixed for v1. Enterprise customizable. |
| CI integration | Manual `mm eval run`. Enterprise gets pipeline gates. |
| Internationalization | English only |

---

## Commercialization — Open Source + Enterprise Tiers

### Positioning

`mm` is a **developer productivity tool that turns prompting from a guessing game into an engineering discipline**. It operationalizes the 4 disciplines framework (Prompt Craft -> Context -> Intent -> Specification) with measurable eval outcomes.

The pitch: skills + evals = **measurably better AI output**, tracked over time. Not "better prompts" — quantifiable improvement.

### Open Source (mm CLI) — Free Forever

Everything in Sessions 1-5. The full 16-command CLI:

| Feature | Status |
|---|---|
| All 16 commands (preflight through skill export) | Included |
| Local skill management (.claude/skills/) | Included |
| All 10 prompt interviews | Included |
| Custom eval engine with A/B testing | Included |
| Multi-Axis 5-dim scoring | Included |
| Multi-IDE export (Cursor, Windsurf) | Included |
| CLAUDE.md / SPEC.md / INTENT.md generation | Included |
| Single user, local files, git-controlled | Included |
| Claude API only (BYOK — bring your own key) | Included |

**License:** MIT or Apache 2.0. The CLI is the funnel. The methodology is the moat.

### mm Pro — Individual Power Users ($19-29/mo)

| Feature | What it does |
|---|---|
| **Multi-model eval** | Run evals across Claude, GPT-4, Gemini, open-source models. Compare which model + skill combo works best for YOUR tasks |
| **Eval history + trends** | Local SQLite DB tracking eval scores over time. `mm eval history <skill>` shows regression/improvement graphs in terminal |
| **Skill templates library** | Curated starter SKILL.md templates for common domains (React, Supabase, Terraform, etc.) — `mm skill install react` |
| **Interview resume** | Save and resume interrupted interviews. Pick up `mm spec new` where you left off |
| **Custom interview templates** | Modify prompt templates or create your own for domain-specific interviews |
| **Priority support** | Discord channel + email support |

**Revenue model:** Subscription via Stripe. License key unlocks Pro features in the CLI.

### mm Enterprise — Teams & Organizations ($49-99/seat/mo)

| Feature | What it does |
|---|---|
| **Team skill registry** | Central registry of approved skills. `mm skill push` / `mm skill pull`. Version-controlled with review workflows |
| **Shared eval suites** | Team-wide eval baselines. When one person improves a skill, everyone benefits. Regression alerts across the team |
| **Eval dashboard (web)** | Web UI showing skill performance across the org. Heatmaps of which skills improve which tasks |
| **CI/CD eval gates** | GitHub Action / GitLab CI integration. PRs that modify SKILL.md must pass eval thresholds before merge |
| **Multi-model support** | Run evals against any OpenAI-compatible API (Azure, Bedrock, self-hosted). Critical for sovereign/air-gapped deployments |
| **SSO + RBAC** | SAML/OIDC authentication. Role-based access to skills and eval results. Audit trail for compliance |
| **Custom interview frameworks** | Organization-specific interview templates. Encode your company's definition of "good code" into the eval system |
| **Compliance reporting** | Export eval results as PDF/CSV for audit. Track which AI models + skills are approved for which use cases |
| **Self-hosted option** | On-prem registry server for air-gapped environments. Docker compose deployment |
| **Onboarding automation** | New developer joins → `mm init --team` pulls team skills, context docs, eval baselines automatically |

### Go-to-Market Strategy

**Phase 1 — Open Source Traction (Months 1-3)**
- Ship v1.0 CLI on npm + GitHub
- Write launch post connecting the 4 disciplines framework + benchmarks + the tool
- Target: dev tool communities (Hacker News, r/programming, Twitter/X dev circles)
- Metric: 1,000 GitHub stars, 500 npm weekly downloads

**Phase 2 — Pro Launch (Months 3-6)**
- Add Pro features (multi-model, history, templates)
- Publish case studies: "How I improved my AI output by X% using mm evals"
- Partner with AI educators / course creators who teach prompting
- Metric: 100 Pro subscribers, $2-3K MRR

**Phase 3 — Enterprise Pilot (Months 6-12)**
- Target: engineering teams at companies deploying AI coding assistants
- Pitch: "You're paying for Copilot/Cursor seats. Are you measuring whether your team is actually getting better at using them?"
- Land 3-5 pilot customers (10-50 seat deployments)
- Build the dashboard, CI integration, SSO based on pilot feedback
- Metric: 3 enterprise customers, $15-30K MRR

**Phase 4 — Scale (Year 2)**
- Marketplace for community-contributed skill templates
- Integration partnerships (GitHub, VS Code, JetBrains)
- Enterprise self-hosted for regulated industries (finance, healthcare, government)
- SOC 2 compliance for hosted version
- Target: $100K+ MRR

### Competitive Landscape

| Competitor | What they do | Why mm is different |
|---|---|---|
| promptfoo | Generic LLM eval framework | mm is skill-aware: A/B tests WITH vs WITHOUT context engineering |
| Cursor / Windsurf rules | IDE-specific context files | mm is IDE-agnostic. Write once, export everywhere. Plus evals |
| Anthropic's CLAUDE.md | One big context file | mm adds structure (skills), measurement (evals), and the 4 disciplines |
| Langsmith / Braintrust | LLM observability / eval platforms | Enterprise-heavy, hosted, expensive. mm starts local + CLI |
| Custom internal tools | Companies building their own | mm provides the methodology + the tooling |

### Sovereign / Government Angle

- **Air-gapped mm Enterprise**: Self-hosted skill registry + eval engine for government deployments
- **Sovereign model eval**: Run `mm eval` against self-hosted models (vLLM, SGLang) to validate domestic models meet quality thresholds
- **Compliance artifact generation**: `mm spec new` + `mm constraint` produce audit-ready documentation for AI governance frameworks
- **Skills as policy**: Government agencies distribute approved AI interaction patterns via team skill registry
- **The sovereign pitch**: "We're not just deploying sovereign AI — we're measuring whether it works, with a rigorous eval methodology that produces measurable improvement"

### Revenue Projection (Conservative)

| Month | OSS Downloads | Pro Subs | Enterprise Seats | MRR |
|---|---|---|---|---|
| 3 | 500/wk | 20 | 0 | $500 |
| 6 | 2,000/wk | 100 | 30 | $4,500 |
| 12 | 5,000/wk | 300 | 150 | $22,000 |
| 18 | 10,000/wk | 500 | 500 | $62,000 |
| 24 | 20,000/wk | 800 | 1,000 | $120,000 |

Assumptions: Pro at $25/mo avg, Enterprise at $75/seat/mo avg. Churn: 5% monthly Pro, 2% monthly Enterprise.
