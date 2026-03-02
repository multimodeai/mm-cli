import { describe, it, expect } from 'vitest';
import { ClaudeClient } from '../../src/engine/claude-client.js';
import { isOAuthToken } from '../../src/util/config.js';

describe('ClaudeClient', () => {
  it('initializes with default model', () => {
    const client = new ClaudeClient({ apiKey: 'test-key' });
    expect(client.getModel()).toBe('claude-sonnet-4-20250514');
  });

  it('accepts custom model', () => {
    const client = new ClaudeClient({ apiKey: 'test-key', model: 'claude-opus-4-20250514' });
    expect(client.getModel()).toBe('claude-opus-4-20250514');
  });

  it('initializes with OAuth token (sk-ant-oat prefix)', () => {
    const client = new ClaudeClient({ apiKey: 'sk-ant-oat-test-token' });
    expect(client.getModel()).toBe('claude-sonnet-4-20250514');
  });

  it('initializes with API key (non-OAuth)', () => {
    const client = new ClaudeClient({ apiKey: 'sk-ant-api03-test-key' });
    expect(client.getModel()).toBe('claude-sonnet-4-20250514');
  });
});

describe('isOAuthToken', () => {
  it('detects OAuth tokens', () => {
    expect(isOAuthToken('sk-ant-oat-abc123')).toBe(true);
    expect(isOAuthToken('sk-ant-oat-')).toBe(true);
  });

  it('rejects non-OAuth tokens', () => {
    expect(isOAuthToken('sk-ant-api03-abc')).toBe(false);
    expect(isOAuthToken('test-key')).toBe(false);
    expect(isOAuthToken('')).toBe(false);
  });
});
