import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot } from './fs.js';

export interface MmConfig {
  model?: string;
  apiKey?: string;
}

export function loadConfig(): MmConfig {
  const config: MmConfig = {};

  // Load from .mmrc if it exists
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    const rcPath = join(projectRoot, '.mmrc');
    if (existsSync(rcPath)) {
      try {
        const content = readFileSync(rcPath, 'utf-8');
        const parsed = JSON.parse(content);
        Object.assign(config, parsed);
      } catch {
        // Ignore malformed .mmrc
      }
    }
  }

  // Env vars override file config
  // Priority: CLAUDE_CODE_OAUTH_TOKEN > ANTHROPIC_API_KEY > .mmrc
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_SETUP_TOKEN;
  if (token) {
    config.apiKey = token;
  } else if (process.env.ANTHROPIC_API_KEY) {
    config.apiKey = process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.MM_MODEL) {
    config.model = process.env.MM_MODEL;
  }

  return config;
}

export function getApiKey(config: MmConfig): string {
  const key = config.apiKey
    || process.env.CLAUDE_CODE_OAUTH_TOKEN
    || process.env.ANTHROPIC_SETUP_TOKEN
    || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'Missing Anthropic credentials. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.'
    );
  }
  return key;
}

/**
 * Check if a token is an OAuth token (starts with sk-ant-oat).
 */
export function isOAuthToken(token: string): boolean {
  return token.startsWith('sk-ant-oat');
}

export const DEFAULT_MODEL = 'claude-sonnet-4-6';
