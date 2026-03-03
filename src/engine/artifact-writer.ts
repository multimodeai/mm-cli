import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import chalk from 'chalk';

/**
 * Extract the artifact content from a response that may contain commentary
 * and code fences. When Claude wraps a SKILL.md or other artifact in a
 * code fence (```markdown ... ```), we want just the inner content.
 *
 * Strategy:
 * 1. If the response contains a fenced block with YAML frontmatter (---),
 *    extract the largest such block (the artifact, not a small snippet).
 * 2. Otherwise, return the raw response.
 */
export function extractArtifact(response: string): string {
  // Match fenced code blocks: ```<optional lang>\n...\n```
  // Allow any language tag (or none) — we filter by content, not by tag
  const fenceRegex = /```\w*\s*\n([\s\S]*?)```/g;
  const blocks: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(response)) !== null) {
    blocks.push(match[1]);
  }

  if (blocks.length === 0) return response;

  // Find the block that looks most like a complete artifact:
  // prefer blocks with YAML frontmatter (---), then longest block
  const withFrontmatter = blocks.filter(b => b.trimStart().startsWith('---'));
  if (withFrontmatter.length > 0) {
    // Return the longest frontmatter block (the full artifact, not a snippet)
    return withFrontmatter.reduce((a, b) => a.length > b.length ? a : b).trim() + '\n';
  }

  // No frontmatter blocks — return the longest fenced block
  const longest = blocks.reduce((a, b) => a.length > b.length ? a : b);
  // Only use it if it's substantial (>20 lines suggests it's the artifact, not a snippet)
  if (longest.split('\n').length > 20) {
    return longest.trim() + '\n';
  }

  // Small code blocks are likely examples, not the artifact — return raw response
  return response;
}

export function writeArtifact(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const extracted = extractArtifact(content);
  writeFileSync(filePath, extracted, 'utf-8');
  console.log(chalk.green(`\n✓ Saved to ${filePath}`));
}
