import { existsSync, readFileSync } from 'node:fs';
import chalk from 'chalk';
import type Anthropic from '@anthropic-ai/sdk';
import type { InterviewConfig, InterviewResult, Message } from './interview-types.js';
import type { ClaudeClient } from './claude-client.js';
import type { StdinIO } from './stdin-io.js';
import { writeArtifact } from './artifact-writer.js';
import { getToolsForTier } from './tools.js';
import type { MmTier } from '../util/config.js';

const MAX_TURNS = 30;

export interface InterviewOptions {
  dryRun?: boolean;
  initialInput?: string;
  /** Auto-save artifact to this path when interview completes. */
  outputFile?: string;
  /** When true, ignore existing output file and start from scratch. */
  fresh?: boolean;
  /** Product tier — controls which tools are available. Default: 'free'. */
  tier?: MmTier;
}

/**
 * Run an interview using the given config.
 *
 * The engine is simple by design: send the prompt template as system message,
 * let Claude drive the conversation, route stdin responses back.
 * Claude is the interviewer — the engine just orchestrates I/O.
 *
 * When config.enableTools is true, Claude can explore the local codebase
 * during the interview via read_file, list_files, search_files tools.
 *
 * UX rules (from SPEC):
 * 1. Auto-save immediately — write artifact to disk as soon as Claude finishes, BEFORE follow-up prompt
 * 2. Clear completion signal — print "Saved to <filename>" immediately
 * 3. Explicit follow-up prompt — say exactly what continuing does
 * 4. Default to exit — N is default, artifact already saved
 * 5. No dangling state — Ctrl-C after artifact = file already on disk
 */
export async function runInterview(
  config: InterviewConfig,
  client: ClaudeClient,
  io: StdinIO,
  options: InterviewOptions = {}
): Promise<InterviewResult> {
  const messages: Message[] = [];
  const tier: MmTier = options.tier || 'free';
  const tools = config.enableTools ? getToolsForTier(tier) : [];
  const hasWebTools = tools.some(t => t.name === 'web_search');
  const systemPrompt = buildSystemPrompt(config, hasWebTools);

  if (options.dryRun) {
    console.log(chalk.yellow('\n--- DRY RUN ---'));
    console.log(chalk.dim('System prompt:'));
    console.log(systemPrompt);
    if (config.enableTools) {
      console.log(chalk.dim(`\nTools enabled (${tier} tier):`));
      for (const tool of tools) {
        console.log(chalk.dim(`  - ${tool.name}: ${tool.description}`));
      }
    }
    console.log(chalk.dim('\nNo API calls will be made.'));
    return {
      artifact: '',
      transcript: [],
      config,
    };
  }

  console.log(chalk.bold.cyan(`\n${config.name}`));
  console.log(chalk.dim(config.description));
  if (config.enableTools) {
    if (hasWebTools) {
      console.log(chalk.dim('Tools enabled — Claude can read your project files and search the web.'));
    } else {
      console.log(chalk.dim('Tools enabled — Claude can read your project files.'));
      console.log(chalk.dim('Web search available with mm Pro — https://mm.dev/pro'));
    }
  }
  console.log(chalk.dim('Press Ctrl-C to exit at any time.\n'));

  // API messages track the full conversation including tool_use/tool_result blocks.
  // Only used when tools are enabled. Simple messages track the human-readable transcript.
  let apiMessages: Anthropic.MessageParam[] | undefined;
  if (config.enableTools) {
    apiMessages = [];
  }

  // If there's initial input (e.g., skill name for skill new, piped stdin for rewrite),
  // send it to Claude immediately so it can explore the codebase and respond before
  // prompting the user. This lets Claude's first questions be grounded in actual code.
  if (options.initialInput) {
    messages.push({ role: 'user', content: options.initialInput });

    let greeting: string;

    if (config.enableTools && apiMessages) {
      apiMessages.push({ role: 'user', content: options.initialInput });
      const result = await client.sendWithTools(
        systemPrompt, apiMessages, tools,
        (name, input) => printToolUse(name, input)
      );
      greeting = result.text;
      apiMessages = result.apiMessages;
    } else {
      greeting = await client.send(systemPrompt, [
        { role: 'user', content: options.initialInput },
      ]);
    }

    io.printAssistant(greeting);
    messages.push({ role: 'assistant', content: greeting });
  } else {
    // Check if output file already exists — enter edit mode if so
    let startMsg = 'Begin the interview.';
    const existingContent = loadExistingArtifact(options);

    if (existingContent) {
      console.log(chalk.cyan(`Found existing ${options.outputFile} — entering edit mode.`));
      console.log(chalk.dim('Use --fresh to start from scratch.\n'));
      startMsg = `The user has an existing document that they want to refine. Here it is:\n\n---\n${existingContent}\n---\n\nDo NOT re-interview from scratch. Instead:\n1. Briefly summarize what the existing document covers\n2. Ask what the user wants to add, change, or refine\n3. If the user asks for research or new sections, do that and produce an updated version of the FULL document`;
    }

    let greeting: string;

    if (config.enableTools && apiMessages) {
      apiMessages.push({ role: 'user', content: startMsg });
      const result = await client.sendWithTools(
        systemPrompt, apiMessages, tools,
        (name, input) => printToolUse(name, input)
      );
      greeting = result.text;
      apiMessages = result.apiMessages;
    } else {
      greeting = await client.send(systemPrompt, [
        { role: 'user', content: startMsg },
      ]);
    }

    io.printAssistant(greeting);
    messages.push({ role: 'user', content: startMsg });
    messages.push({ role: 'assistant', content: greeting });
  }

  let turn = 0;
  let saved = false;

  while (turn < MAX_TURNS) {
    turn++;
    let userInput: string;

    try {
      userInput = await io.prompt();
    } catch {
      // stdin closed or Ctrl-C
      console.log(chalk.dim('\nInterview interrupted.'));
      break;
    }

    if (!userInput.trim()) continue;

    messages.push({ role: 'user', content: userInput });

    let response: string;

    if (config.enableTools && apiMessages) {
      apiMessages.push({ role: 'user', content: userInput });
      const result = await client.sendWithTools(
        systemPrompt, apiMessages, tools,
        (name, input) => printToolUse(name, input)
      );
      response = result.text;
      apiMessages = result.apiMessages;
    } else {
      response = await client.send(systemPrompt, messages);
    }

    messages.push({ role: 'assistant', content: response });
    io.printAssistant(response);

    // Check if the interview appears to be complete
    // Claude will naturally produce the final artifact in its last message
    if (isLikelyComplete(response, config)) {
      // 1. Auto-save immediately — artifact is on disk before any follow-up
      if (options.outputFile) {
        writeArtifact(options.outputFile, response);
        saved = true;
      }

      // 2. Explicit follow-up — say exactly what continuing does, default N
      const continueChoice = await askFollowUp(io);
      if (!continueChoice) break;
    }
  }

  // The artifact is the last assistant message
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
  const artifact = lastAssistant?.content || '';

  // If user refined during follow-up, re-save with latest content
  if (options.outputFile && saved && artifact) {
    const firstSavedContent = messages.filter(m => m.role === 'assistant').reverse()
      .find((_, i) => i > 0)?.content;
    if (artifact !== firstSavedContent) {
      writeArtifact(options.outputFile, artifact);
    }
  }

  // If interview was interrupted before completion detection, still save if we have content
  if (options.outputFile && !saved && artifact) {
    writeArtifact(options.outputFile, artifact);
  }

  return {
    artifact,
    transcript: messages,
    config,
  };
}

function buildSystemPrompt(config: InterviewConfig, hasWebTools: boolean): string {
  let prompt = config.systemPrompt;

  // Inject current date so the model doesn't hallucinate one
  const today = new Date().toISOString().split('T')[0];
  prompt += `\n\nCurrent date: ${today}`;

  if (config.guardrails.length > 0) {
    prompt += '\n\n<guardrails>\n' + config.guardrails.join('\n') + '\n</guardrails>';
  }

  if (config.enableTools) {
    prompt += `\n\n<tools-context>
You have access to tools that let you explore the project codebase${hasWebTools ? ' AND search the web' : ''}:

CODEBASE TOOLS:
- read_file: Read any file in the project
- list_files: Find files by name pattern (e.g. "*.ts", "route.ts", "schema*")
- search_files: Search file contents with regex patterns`;

    if (hasWebTools) {
      prompt += `

WEB TOOLS:
- web_search: Search the web (DuckDuckGo). Use for academic papers, documentation, algorithms, best practices, current techniques.
- web_fetch: Fetch a URL and read its content. Use after web_search to read full articles, papers, docs.`;
    }

    prompt += `

CRITICAL RULE — READ BEFORE ASKING:
Before asking ANY question about the codebase, existing implementation, files, architecture, or tech stack, use your tools to read the relevant files FIRST. Only ask the user about their preferences, intentions, priorities, and constraints — never about code you can read yourself.`;

    if (hasWebTools) {
      prompt += `

CRITICAL RULE — RESEARCH WHEN RELEVANT:
When the user asks for research, mentions academic topics, asks about algorithms, detection systems, best practices, or anything requiring external knowledge — use web_search and web_fetch to find real sources. Do NOT say "I can't search the web" — you CAN. Search arxiv, Google Scholar, documentation sites, blog posts. Include specific findings, paper titles, and URLs in your output.`;
    }

    prompt += `

When the interview begins:
1. IMMEDIATELY read CLAUDE.md (if it exists) to understand the project
2. List and read any files in .claude/skills/ for domain context
3. Explore the codebase structure (list_files "*.ts", "*.tsx", "*.py", etc.)
4. Read relevant source files before formulating your first question

During the interview:
- When the user mentions a file, feature, or module — read it before responding
- When the user describes a problem — search for the relevant code before asking clarifying questions
- When you need to understand what's already implemented — read the code, don't ask${hasWebTools ? '\n- When the user asks about techniques, algorithms, or research — web_search for it' : ''}
- Reference specific files, functions, line numbers, and patterns in your questions and output
- Never use generic placeholders like "[your function]" or "[existing module]" — name the actual code

A specification that doesn't reference real files from the codebase is a bad specification.${hasWebTools ? "\nA specification that claims \"research needed\" when you have web_search available is a lazy specification." : ''}
</tools-context>`;
  }

  return prompt;
}

/**
 * Heuristic: an interview is likely complete when Claude produces
 * the output artifact markers. These vary by template, but we look
 * for common patterns like section headers, triple-dash separators,
 * or explicit completion signals.
 */
function isLikelyComplete(response: string, config: InterviewConfig): boolean {
  const completionMarkers = [
    '===',
    'HOW TO USE',
    'HOW TO DEPLOY',
    'TO USE THIS',
    'SPECIFICATION QUALITY CHECK',
    'COMPLETENESS CHECK',
    'BASELINE RUN',
    'FAILURE MODES THIS PREVENTS',
    'INTENT GAPS',
    'Your #1 priority gap',
    'The pattern across your requests',
    'highest-leverage thing you can do this week',
  ];

  return completionMarkers.some(marker => response.includes(marker));
}

async function askFollowUp(io: StdinIO): Promise<boolean> {
  try {
    const answer = await io.prompt(
      chalk.yellow('Follow up on your results? (Ask questions, refine the document, etc.) (y/N)')
    );
    return answer.trim().toLowerCase() === 'y';
  } catch {
    return false;
  }
}

/**
 * If the output file already exists and --fresh wasn't passed, load its content
 * so the interview can enter edit/refine mode instead of starting from scratch.
 */
function loadExistingArtifact(options: InterviewOptions): string | null {
  if (options.fresh) return null;
  if (!options.outputFile) return null;

  try {
    if (existsSync(options.outputFile)) {
      const content = readFileSync(options.outputFile, 'utf-8').trim();
      if (content.length > 0) {
        return content;
      }
    }
  } catch {
    // Can't read file — proceed with fresh interview
  }
  return null;
}

function printToolUse(name: string, input: Record<string, unknown>): void {
  const detail = input.path || input.pattern || input.file_pattern || input.query || input.url || '';
  console.log(chalk.dim(`  ⚙ ${name}(${detail})`));
}
