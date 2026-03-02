import { describe, it, expect, vi } from 'vitest';
import { runInterview } from '../../src/engine/interview.js';
import { DIAGNOSE_QUICK } from '../../src/engine/interview-templates.js';
import type { ClaudeClient } from '../../src/engine/claude-client.js';
import type { StdinIO } from '../../src/engine/stdin-io.js';

function createMockClient(responses: string[]): ClaudeClient {
  let callIndex = 0;
  return {
    send: vi.fn(async () => {
      return responses[callIndex++] || 'End of mock responses';
    }),
    getModel: () => 'mock-model',
  } as unknown as ClaudeClient;
}

function createMockIO(inputs: string[]): StdinIO {
  let callIndex = 0;
  return {
    prompt: vi.fn(async () => {
      if (callIndex >= inputs.length) {
        throw new Error('Input stream closed');
      }
      return inputs[callIndex++];
    }),
    printAssistant: vi.fn(),
    close: vi.fn(),
  } as unknown as StdinIO;
}

describe('runInterview', () => {
  it('dry-run mode prints system prompt without API calls', async () => {
    const client = createMockClient([]);
    const io = createMockIO([]);

    const result = await runInterview(DIAGNOSE_QUICK, client, io, { dryRun: true });

    expect(result.artifact).toBe('');
    expect(result.transcript).toHaveLength(0);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('completes interview when completion marker detected', async () => {
    const client = createMockClient([
      'Welcome! Let me ask you some questions. What\'s your role?',
      'Great. Your #1 priority gap is: Context Engineering. Here is your scorecard...',
    ]);
    const io = createMockIO([
      'I am a software engineer working on web apps',
    ]);

    const result = await runInterview(DIAGNOSE_QUICK, client, io);

    expect(result.transcript.length).toBeGreaterThan(0);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('passes system prompt with guardrails to client', async () => {
    const client = createMockClient([
      'Your #1 priority gap is: everything',
    ]);
    const io = createMockIO([]);

    // Will end immediately due to completion marker
    await runInterview(DIAGNOSE_QUICK, client, io);

    const sendCall = (client.send as any).mock.calls[0];
    const systemPrompt = sendCall[0] as string;
    expect(systemPrompt).toContain('<role>');
    expect(systemPrompt).toContain('<guardrails>');
    expect(systemPrompt).toContain('do not inflate scores');
  });
});
