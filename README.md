# mm

A CLI that turns AI prompting from guesswork into engineering. Define what you want, delegate with precision, measure the results.

## Install

```bash
git clone https://github.com/hududed/mm-cli.git
cd mm-cli
npm install
npm run build
npm link   # installs 'mm' globally
```

Requires Node.js 18+ and a Claude API key or OAuth token:

```bash
export ANTHROPIC_API_KEY=sk-ant-api-...
# or
export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-...
```

## The Flow

`mm` produces the documents that make AI coding sessions work. There are three phases:

### Phase 1 — Define (you + mm)

```
mm spec new <feature>       →  specs/<feature>.md     # WHAT to build
mm intent init              →  INTENT.md              # HOW decisions get made
mm constraint <task>        →  constraints/<task>.md   # WHERE the boundaries are
```

Each command runs an interactive interview. Claude asks you questions, reads your codebase, searches the web for research, and produces a structured document.

If the output file already exists, `mm` enters **edit mode** — loads the existing document and asks what you want to refine. Use `--fresh` to start over.

### Phase 2 — Build (your AI agent)

Take the spec and hand it to Claude Code, Cursor, or any AI coding tool:

```
"Execute specs/content-uniqueness.md. Reference INTENT.md for
decision authority and CLAUDE.md for project context."
```

The spec is precise enough for autonomous execution — acceptance criteria, task decomposition, constraint architecture, definition of done.

### Phase 3 — Measure (mm again)

```
mm eval new <skill>                    # Build eval suite
mm eval run <skill>                    # Run with skill loaded
mm eval run <skill> --without-skill    # Run baseline
mm eval compare <skill>               # See the delta
```

A/B test your AI output with and without context engineering. Multi-axis 5-dimension scoring.

## All Commands

| Command | What it does | Output |
|---------|-------------|--------|
| `mm preflight` | Print the 7 pre-prompting questions | stdout |
| `mm diagnose` | 5-question AI workflow diagnostic | CONTEXT.md |
| `mm diagnose --deep` | 12-question deep diagnostic + roadmap | DIAGNOSTIC.md |
| `mm rewrite` | Rewrite vague requests into clear ones | stdout / REWRITE.md |
| `mm context build` | 7-domain interview for business context | .claude/skills/business-context/SKILL.md |
| `mm spec new [name]` | Specification engineer (3-phase interview) | specs/\<name\>.md or SPEC.md |
| `mm intent init` | Intent & delegation framework | INTENT.md |
| `mm constraint <task>` | Constraint architecture (must/must-not/prefer/escalate) | constraints/\<task\>.md |
| `mm eval new <skill>` | Build eval suite via interview | evals/\<skill\>/eval.yaml |
| `mm eval new <skill> --quick` | Auto-generate eval from SKILL.md | evals/\<skill\>/eval.yaml |
| `mm eval run <skill>` | Execute eval suite | evals/\<skill\>/results/\<ts\>.json |
| `mm eval compare <skill>` | A/B comparison table | stdout |
| `mm skill new <name>` | Scaffold a new skill | .claude/skills/\<name\>/SKILL.md |
| `mm skill list` | List skills in current project | stdout |
| `mm skill validate` | Check skill structure | stdout |
| `mm skill export --format cursor` | Export skills to other IDEs | .cursorrules / .windsurfrules |

## Tools During Interviews

Commands that need codebase access (`spec`, `eval`, `constraint`, `intent`) give Claude tools to explore your project during the interview:

- **read_file** — Read any project file
- **list_files** — Find files by pattern
- **search_files** — Grep file contents
- **web_search** — Search the web (DuckDuckGo, no API key needed)
- **web_fetch** — Fetch and read web pages

Claude reads your code before asking questions, and searches arxiv/docs when research is needed. Specs reference actual files, functions, and line numbers — not generic placeholders.

## Global Flags

```
--model <model>    Override Claude model (default: claude-sonnet-4-20250514)
--dry-run          Print system prompt without calling API
--fresh            Ignore existing output file, start from scratch
```

## How It Works

The interview engine sends prompt templates as Claude's system message. Claude drives the conversation — asks questions, reads your codebase, does research. The engine routes your answers back. When Claude produces the final artifact, it's auto-saved to disk.

```
┌─────────────────────────────┐
│  CLI Layer (Commander.js)   │
│  16 commands                │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Interview Engine           │
│  Multi-phase Claude         │
│  interviews → files         │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│  Claude Client              │
│  @anthropic-ai/sdk          │
│  Tool use + OAuth support   │
└─────────────────────────────┘
```

## Background

Built on the insight that prompting split into 4 disciplines:

1. **Prompt Craft** — writing clear requests
2. **Context Engineering** — giving AI the right background
3. **Intent Engineering** — encoding decision-making rules
4. **Specification Engineering** — precise specs for autonomous execution

Skills + evals = measurable improvement in AI output quality.

## License

AGPL-3.0 — Free to use, modify, and distribute. If you build a hosted service on mm's methodology, you must open-source the service code. See [LICENSE](LICENSE) for details.
