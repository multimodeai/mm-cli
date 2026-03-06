import Anthropic from '@anthropic-ai/sdk';
import type { Message } from './interview-types.js';
import { isOAuthToken } from '../util/config.js';
import { executeTool } from './tools.js';

export interface ClaudeClientOptions {
  apiKey: string;
  model?: string;
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

  constructor(options: ClaudeClientOptions) {
    if (isOAuthToken(options.apiKey)) {
      this.client = new Anthropic({
        authToken: options.apiKey,
        defaultHeaders: {
          'anthropic-beta': 'oauth-2025-04-20',
          'user-agent': 'mm-cli/0.1.0',
          'x-app': 'cli',
        },
      });
    } else {
      this.client = new Anthropic({ apiKey: options.apiKey });
    }
    this.model = options.model || 'claude-sonnet-4-20250514';
  }

  /**
   * Simple send without tools. Used by commands that don't need codebase access.
   */
  async send(
    systemPrompt: string,
    messages: Message[],
    maxTokens: number = 8192
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

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
    maxTokens: number = 8192,
    maxToolLoops: number = 15
  ): Promise<SendWithToolsResult> {
    const toolCalls: ToolCall[] = [];
    const currentMessages = [...apiMessages];
    let loopsRemaining = maxToolLoops;

    while (loopsRemaining-- > 0) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });

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
          '\n\n[SYSTEM: You are approaching the tool use limit. Stop exploring and respond to the user now. Summarize what you have found and ask your interview question.]';
      }

      // Send tool results back to Claude
      currentMessages.push({ role: 'user', content: toolResults });
    }

    throw new Error('Tool use loop exceeded maximum iterations');
  }

  getModel(): string {
    return this.model;
  }
}
