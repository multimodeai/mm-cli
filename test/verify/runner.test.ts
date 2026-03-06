import { describe, it, expect, vi } from 'vitest';
import { runSpecVerify, VERIFY_SYSTEM_PROMPT } from '../../src/verify/index.js';
import type { ClaudeClient } from '../../src/engine/claude-client.js';

function createMockClient(responseJson: object): ClaudeClient {
  return {
    sendWithTools: vi.fn(async () => ({
      text: JSON.stringify(responseJson),
      apiMessages: [],
      toolCalls: [],
    })),
    getModel: () => 'mock-model',
  } as unknown as ClaudeClient;
}

const SAMPLE_SPEC = `=== PROJECT SPECIFICATION ===
Project: Test Project

2. ACCEPTANCE CRITERIA
1. Feature A works
2. Feature B works
3. Feature C works

3. CONSTRAINT ARCHITECTURE
Must Do:
- Use existing patterns

7. DEFINITION OF DONE
All features work.`;

describe('runSpecVerify', () => {
  it('calls sendWithTools with correct system prompt', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'Feature A works', status: 'met', evidence: 'Found in src/a.ts', confidence: 'high' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'All good' },
    };
    const client = createMockClient(mockResponse);

    await runSpecVerify(SAMPLE_SPEC, client, 'SPEC.md');

    expect(client.sendWithTools).toHaveBeenCalledOnce();
    const args = (client.sendWithTools as any).mock.calls[0];
    expect(args[0]).toContain('specification verification judge');
    expect(args[4]).toBe(16384); // maxTokens
    expect(args[5]).toBe(30);   // maxToolLoops
  });

  it('returns correct summary counts', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'Feature A', status: 'met', evidence: 'src/a.ts', confidence: 'high' },
        { criterion: 'Feature B', status: 'not_met', evidence: 'Not found', confidence: 'high' },
        { criterion: 'Feature C', status: 'partial', evidence: 'Partial', confidence: 'medium' },
        { criterion: 'Feature D', status: 'unclear', evidence: 'Unknown', confidence: 'low' },
      ],
      constraints: [],
      definitionOfDone: { met: false, reasoning: 'Missing features' },
    };
    const client = createMockClient(mockResponse);

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    expect(result.summary.totalCriteria).toBe(4);
    expect(result.summary.met).toBe(1);
    expect(result.summary.notMet).toBe(1);
    expect(result.summary.partial).toBe(1);
    expect(result.summary.unclear).toBe(1);
    expect(result.summary.score).toBe('1/4 criteria met');
  });

  it('handles JSON parse errors gracefully', async () => {
    const client = {
      sendWithTools: vi.fn(async () => ({
        text: 'This is not JSON at all',
        apiMessages: [],
        toolCalls: [],
      })),
      getModel: () => 'mock-model',
    } as unknown as ClaudeClient;

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    expect(result.criteria).toHaveLength(0);
    expect(result.definitionOfDone.met).toBe(false);
    expect(result.summary.score).toContain('Parse error');
  });

  it('handles code-fenced JSON response', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'Feature A', status: 'met', evidence: 'src/a.ts', confidence: 'high' },
      ],
      constraints: [],
      definitionOfDone: { met: true, reasoning: 'Done' },
    };
    const client = {
      sendWithTools: vi.fn(async () => ({
        text: '```json\n' + JSON.stringify(mockResponse) + '\n```',
        apiMessages: [],
        toolCalls: [],
      })),
      getModel: () => 'mock-model',
    } as unknown as ClaudeClient;

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].status).toBe('met');
  });

  it('validates status values and falls back to defaults', async () => {
    const mockResponse = {
      criteria: [
        { criterion: 'A', status: 'invalid_status', evidence: '', confidence: 'invalid_conf' },
      ],
      constraints: [
        { constraint: 'B', type: 'invalid_type', status: 'invalid_status', evidence: '' },
      ],
      definitionOfDone: { met: true, reasoning: 'Ok' },
    };
    const client = createMockClient(mockResponse);

    const result = await runSpecVerify(SAMPLE_SPEC, client, 'test.md');

    expect(result.criteria[0].status).toBe('unclear');
    expect(result.criteria[0].confidence).toBe('low');
    expect(result.constraints[0].type).toBe('must_do');
    expect(result.constraints[0].status).toBe('not_assessed');
  });
});
