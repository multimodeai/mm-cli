import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot } from './fs.js';

export type MmTier = 'free' | 'pro' | 'enterprise';

export interface MmConfig {
  model?: string;
  apiKey?: string;
  tier?: MmTier;
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

  // Tier: MM_TIER env var > .mmrc tier > default 'free'
  const tierEnv = process.env.MM_TIER as MmTier | undefined;
  if (tierEnv && ['free', 'pro', 'enterprise'].includes(tierEnv)) {
    config.tier = tierEnv;
  }

  return config;
}

/**
 * Resolve the active tier. Defaults to 'free'.
 */
export function getTier(config: MmConfig): MmTier {
  return config.tier || 'free';
}

export function getApiKey(config: MmConfig): string {
  const tier = getTier(config);

  // Free tier: API keys only. OAuth requires Pro or Enterprise.
  if (tier === 'free') {
    const key = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'Missing API key. Set ANTHROPIC_API_KEY.\n' +
        'OAuth tokens require mm Pro — upgrade at https://mm.dev/pro'
      );
    }
    if (isOAuthToken(key)) {
      throw new Error(
        'OAuth tokens require mm Pro or Enterprise.\n' +
        'Use an API key (ANTHROPIC_API_KEY) or upgrade at https://mm.dev/pro'
      );
    }
    return key;
  }

  // Pro/Enterprise: OAuth + API keys both work
  const key = config.apiKey
    || process.env.CLAUDE_CODE_OAUTH_TOKEN
    || process.env.ANTHROPIC_SETUP_TOKEN
    || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      'Missing Anthropic credentials. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.'
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

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
