import Anthropic from '@anthropic-ai/sdk';
import type { Message } from './interview-types.js';
import { isOAuthToken } from '../util/config.js';
import { executeTool } from './tools.js';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max' | 'ultracode';

const EFFORT_BUDGETS: Record<EffortLevel, number | null> = {
  low: null,
  medium: null,
  high: 16000,
  max: 32000,
  // ultracode = max thinking budget + workflow orchestration (orchestration handled
  // externally via Claude Code Workflow tool; the result file is reformatted into
  // mm-cli EvalResult shape by scripts/ultracode-to-evalresult.ts). At the single-call
  // tier inside mm-cli, ultracode behaves identically to max.
  ultracode: 32000,
};

export interface ClaudeClientOptions {
  apiKey: string;
  model?: string;
  effort?: EffortLevel;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

export interface SendWithToolsResult {
  /** Final text response after all tool use is resolved */
  text: string;
  /** Full API message history including tool_use/tool_result blocks */
  apiMessages: Anthropic.MessageParam[];
  /** Log of all tool calls made during this turn */
  toolCalls: ToolCall[];
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private usingOAuth: boolean;
  private effort: EffortLevel;

  constructor(options: ClaudeClientOptions) {
    this.usingOAuth = isOAuthToken(options.apiKey);
    if (this.usingOAuth) {
      this.client = new Anthropic({
        apiKey: null as unknown as string,
        authToken: options.apiKey,
        defaultHeaders: {
          'accept': 'application/json',
          'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
          'user-agent': 'claude-cli/2.1.2 (external, cli)',
          'x-app': 'cli',
        },
      });
    } else {
      this.client = new Anthropic({ apiKey: options.apiKey });
    }
    this.model = options.model || 'claude-sonnet-4-6';
    this.effort = options.effort || 'medium';
  }

  /**
   * Build the thinking parameter from the current effort level.
   * low/medium → no thinking; high → 16k budget; max → 32k budget.
   */
  private buildThinking(): { type: 'enabled'; budget_tokens: number } | undefined {
    const budget = EFFORT_BUDGETS[this.effort];
    if (!budget) return undefined;
    return { type: 'enabled', budget_tokens: budget };
  }

  /**
   * Apply effort-derived thinking params + ensure max_tokens accommodates
   * thinking budget + response headroom (~4k tokens). Mutates params in place
   * and returns it for chaining.
   */
  private applyEffort<T extends { max_tokens: number; thinking?: unknown }>(params: T): T {
    const thinking = this.buildThinking();
    if (!thinking) return params;
    (params as { thinking?: unknown }).thinking = thinking;
    const minMaxTokens = thinking.budget_tokens + 4096;
    if (params.max_tokens < minMaxTokens) {
      params.max_tokens = minMaxTokens;
    }
    return params;
  }

  /**
   * Build system param. OAuth requires Claude Code identity prefix.
   */
  private buildSystem(systemPrompt: string): string | Anthropic.TextBlockParam[] {
    if (!this.usingOAuth) return systemPrompt;
    const blocks: Anthropic.TextBlockParam[] = [
      { type: 'text' as const, text: 'You are Claude Code, Anthropic\'s official CLI for Claude.' },
    ];
    // Anthropic rejects empty text blocks; only append the project system prompt if non-empty
    if (systemPrompt && systemPrompt.trim()) {
      blocks.push({ type: 'text' as const, text: systemPrompt });
    }
    return blocks;
  }

  /**
   * Simple send without tools. Used by commands that don't need codebase access.
   */
  async send(
    systemPrompt: string,
    messages: Message[],
    maxTokens: number = 16000
  ): Promise<string> {
    const response = await this.createWithRetry(this.applyEffort({
      model: this.model,
      max_tokens: maxTokens,
      system: this.buildSystem(systemPrompt),
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }));

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }
    return textBlock.text;
  }

  /**
   * Send with tool use. Handles the complete tool loop:
   * Claude requests tool → execute locally → send result → Claude continues.
   * Repeats until Claude produces a final text response (stop_reason: end_turn).
   *
   * @param onToolUse - Optional callback for UI feedback when a tool is called
   */
  async sendWithTools(
    systemPrompt: string,
    apiMessages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    onToolUse?: (name: string, input: Record<string, unknown>) => void,
    maxTokens: number = 16000,
    maxToolLoops: number = 15
  ): Promise<SendWithToolsResult> {
    const toolCalls: ToolCall[] = [];
    const currentMessages = [...apiMessages];
    let loopsRemaining = maxToolLoops;

    while (loopsRemaining-- > 0) {
      const response = await this.createWithRetry(this.applyEffort({
        model: this.model,
        max_tokens: maxTokens,
        system: this.buildSystem(systemPrompt),
        tools,
        messages: currentMessages,
      }));

      // Add assistant response to history
      currentMessages.push({
        role: 'assistant',
        content: response.content,
      });

      // If Claude is done (no tool use), extract text and return
      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n');

        // If Claude finished tool use but produced no text, nudge it to respond
        if (!text.trim() && toolCalls.length > 0) {
          currentMessages.push({
            role: 'user',
            content: '[SYSTEM: You used tools but produced no visible response. Based on what you just read, please continue — ask your next question or provide your analysis.]',
          });
          continue;
        }

        return { text, apiMessages: currentMessages, toolCalls };
      }

      // Claude wants to use tools — execute each one
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const input = block.input as Record<string, unknown>;
        if (onToolUse) onToolUse(block.name, input);

        const result = await executeTool(block.name, input);
        toolCalls.push({ name: block.name, input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      // Nudge Claude to wrap up when approaching the tool limit
      if (loopsRemaining <= 2 && toolResults.length > 0) {
        const last = toolResults[toolResults.length - 1];
        const existing = typeof last.content === 'string' ? last.content : '';
        last.content = existing +
          '\n\n[SYSTEM: You are approaching the tool use limit for this turn. Summarize what you have found so far and output your findings for this phase. Do NOT try to squeeze in more discovery — the next phase will give you a fresh tool budget. If you are verifying a spec, output the JSON assessment immediately.]';
      }

      // Send tool results back to Claude
      currentMessages.push({ role: 'user', content: toolResults });
    }

    // Force a final response with no tools available
    currentMessages.push({
      role: 'user',
      content: '[SYSTEM: Tool use limit reached. You MUST respond now with text only — no more tool calls. Summarize what you found and continue the conversation.]',
    });

    const finalResponse = await this.createWithRetry(this.applyEffort({
      model: this.model,
      max_tokens: maxTokens,
      system: this.buildSystem(systemPrompt),
      tools: [], // no tools — forces text response
      messages: currentMessages,
    }));

    const finalText = finalResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return { text: finalText, apiMessages: currentMessages, toolCalls };
  }

  /**
   * Retry API calls on 500/529 errors with exponential backoff.
   * Auto-streams when max_tokens > 32k OR extended thinking is enabled, since
   * Anthropic's non-streaming endpoint rejects requests projected to take >10 min.
   */
  private async createWithRetry(
    params: Anthropic.MessageCreateParamsNonStreaming,
    maxRetries: number = 3
  ): Promise<Anthropic.Message> {
    const mustStream = (params.max_tokens > 32000) || !!(params as any).thinking;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (mustStream) {
          // Cast: messages.stream accepts the same param shape minus the explicit stream:true
          const stream = this.client.messages.stream(params as unknown as Anthropic.MessageCreateParamsStreaming);
          return await stream.finalMessage();
        }
        return await this.client.messages.create(params);
      } catch (err: unknown) {
        const status = (err as any)?.status;
        if ((status === 500 || status === 529) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // Log full error details for debugging
        const errBody = (err as any)?.error || (err as any)?.body || (err as any)?.message;
        if (errBody) {
          console.error(`\nAPI error (attempt ${attempt + 1}/${maxRetries + 1}):`, JSON.stringify(errBody, null, 2));
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }

  getModel(): string {
    return this.model;
  }

  getEffort(): EffortLevel {
    return this.effort;
  }
}
