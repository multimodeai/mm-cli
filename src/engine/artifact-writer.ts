import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import chalk from 'chalk';

/**
 * Extract the artifact content from a response that may contain commentary
 * and code fences. When Claude wraps a SKILL.md or other artifact in a
 * code fence (```markdown ... ```), we want just the inner content.
 *
 * Handles nested code fences (e.g. SKILL.md containing ```python blocks)
 * by parsing line-by-line and tracking fence depth.
 *
 * When `startMarker` is provided, the signature-anchored path runs FIRST: if a
 * line whose trimmed text equals the marker exists outside any code fence,
 * the artifact is sliced from that line to the end (minus trailing chat).
 * Heuristic fallback only runs when the marker is absent or unmatched.
 */
export function extractArtifact(response: string, startMarker?: string): string {
  // Signature-anchored path — runs BEFORE heuristics. The template declares
  // the literal first line of its artifact; we find it outside any fence and
  // slice forward. This eliminates the failure mode where extractTaggedBlock
  // matches an embedded ```markdown example mid-document.
  if (startMarker) {
    const markerIdx = findUnfencedLine(response, startMarker);
    if (markerIdx >= 0) {
      const sliced = response.split('\n').slice(markerIdx).join('\n');
      return stripCommentary(sliced);
    }
  }

  // Fast path: if the response contains a tagged markdown fence (```markdown or ```md),
  // extract from the opening tag to the LAST bare ``` in the response.
  // This avoids the complex nested-fence parsing which fails when the artifact
  // itself contains bare ``` code blocks (e.g. output format examples in SKILL.md).
  const taggedExtract = extractTaggedBlock(response);
  if (taggedExtract) {
    return taggedExtract.trim() + '\n';
  }

  // Fallback: use the general fence parser for non-tagged responses
  const blocks = parseFencedBlocks(response);

  if (blocks.length === 0) return response;

  // Multi-block artifacts: when the response contains multiple substantial fenced
  // blocks (e.g. a spec where each section is its own ```text block separated by
  // horizontal rules), the artifact spans ALL of them. Picking one would silently
  // discard the rest.
  const substantialBlocks = blocks.filter(
    b => b.length > response.length * 0.05 || b.split('\n').length > 15
  );
  if (substantialBlocks.length >= 2) {
    return extractMultiBlockArtifact(response);
  }

  // Find the block that looks most like a complete artifact:
  // prefer blocks with YAML frontmatter (---), then longest block.
  // But only extract a block if it's a substantial portion of the response —
  // a small fenced block inside a large response is an embedded example, not the artifact.
  const withFrontmatter = blocks.filter(b => b.trimStart().startsWith('---'));
  if (withFrontmatter.length > 0) {
    const best = withFrontmatter.reduce((a, b) => a.length > b.length ? a : b);
    if (best.length > response.length * 0.3) {
      return best.trim() + '\n';
    }
  }

  // No frontmatter blocks — return the longest fenced block if it's substantial
  const longest = blocks.reduce((a, b) => a.length > b.length ? a : b);
  if (longest.split('\n').length > 20 && longest.length > response.length * 0.3) {
    return longest.trim() + '\n';
  }

  // No code fence wrapping — strip leading/trailing conversational text
  return stripCommentary(response);
}

/**
 * Find the index of the first line whose trimmed text exactly equals `marker`
 * AND is not inside any ``` fence block. Returns -1 if no such line exists.
 *
 * Fence tracking is a single boolean toggle on any line starting with ``` —
 * intentionally simpler than parseFencedBlocks' depth tracking, because the
 * only question here is "is this line inside ANY fence".
 */
function findUnfencedLine(text: string, marker: string): number {
  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && trimmed === marker) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract content from a tagged markdown fence (```markdown or ```md)
 * by finding the opening tag and the LAST bare ``` in the response.
 *
 * This is simpler and more reliable than depth-tracking when the artifact
 * contains nested bare ``` blocks (common in SKILL.md output format sections).
 */
function extractTaggedBlock(response: string): string | null {
  const lines = response.split('\n');

  // Find the first ```markdown or ```md line
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^```(?:markdown|md)\s*$/.test(trimmed)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  // Find the LAST bare ``` in the response — that's the outer close
  let endIdx = -1;
  for (let i = lines.length - 1; i > startIdx; i--) {
    if (lines[i].trim() === '```') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) return null;

  // Extract content between the fences
  const content = lines.slice(startIdx + 1, endIdx).join('\n');

  // Sanity check: the extracted block should be substantial
  if (content.length < response.length * 0.2) return null;

  return content;
}

/**
 * Parse top-level fenced code blocks, correctly handling nested fences.
 *
 * Strategy: track fence depth properly. Every ``` (with or without lang tag)
 * toggles depth. The outer fence opens at depth 0→1. Inner fences toggle
 * between 1→2 and 2→1. Only when depth goes from 1→0 do we close the
 * outer block.
 *
 * This handles:
 * - ```markdown wrapping with ```python/```sql nested inside (tagged fences)
 * - ```markdown wrapping with bare ``` blocks nested inside (untagged fences)
 * - Mixed tagged and untagged nested fences
 */
function parseFencedBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let depth = 0;
  let currentBlock: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    const isFence = /^```\w*\s*$/.test(trimmed); // matches ```lang or bare ```

    if (!isFence) {
      if (depth >= 1) {
        currentBlock.push(line);
      }
      continue;
    }

    // It's a fence line
    if (depth === 0) {
      // Opening a new top-level block
      depth = 1;
      currentBlock = [];
    } else if (depth === 1) {
      // Could be opening a nested fence or closing the outer one.
      const isTaggedOpen = trimmed !== '```';
      if (isTaggedOpen) {
        // ```python, ```bash, etc. — always a nested open
        depth = 2;
        currentBlock.push(line);
      } else {
        // Bare ``` — could close outer or open a nested bare block.
        // Look ahead for another bare ``` that would close this one.
        const remaining = lines.slice(idx + 1);
        let foundMatchingClose = false;
        let lookAheadDepth = 0;
        for (const ahead of remaining) {
          const aheadTrimmed = ahead.trim();
          if (/^```\w+\s*$/.test(aheadTrimmed)) {
            lookAheadDepth++;
          } else if (aheadTrimmed === '```') {
            if (lookAheadDepth > 0) {
              lookAheadDepth--;
            } else {
              foundMatchingClose = true;
              break;
            }
          }
        }
        if (foundMatchingClose) {
          // This bare ``` opens a nested block, the matching one closes it
          depth = 2;
          currentBlock.push(line);
        } else {
          // No matching close ahead — this closes the outer fence
          blocks.push(currentBlock.join('\n'));
          depth = 0;
          currentBlock = [];
        }
      }
    } else {
      // depth >= 2 — inside nested fence
      currentBlock.push(line);
      if (trimmed === '```') {
        depth--;
      } else {
        // ```lang inside nested — deeper nesting
        depth++;
      }
    }
  }

  // If we ended mid-block (unclosed fence), still capture it
  if (depth > 0 && currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  return blocks;
}

/**
 * For responses where the artifact is split across multiple fenced blocks
 * (e.g. a spec rendered as ```text Section 1``` --- ```text Section 2``` ...),
 * preserve everything from the first fence line to the last non-conversational
 * line. Conversational pre/post is anything before the first ``` and after the
 * last ``` that looks like chat ("Let me know", "Would you like", etc.).
 */
function extractMultiBlockArtifact(response: string): string {
  const lines = response.split('\n');

  let firstFence = -1;
  let lastFence = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^```\w*\s*$/.test(lines[i].trim())) {
      if (firstFence === -1) firstFence = i;
      lastFence = i;
    }
  }

  if (firstFence === -1) return response.trim() + '\n';

  // Keep trailing post-fence content (e.g. "**SPECIFICATION QUALITY CHECK:**"
  // sections that follow the last block) — that content is part of the artifact
  // when the model formats output as multi-block + commentary blocks.
  // Only strip the very last lines if they are clearly conversational chat.
  let endIdx = lines.length - 1;
  for (let i = lines.length - 1; i > lastFence; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith('Let me know') ||
      trimmed.startsWith('Would you like') ||
      trimmed.startsWith('Feel free') ||
      trimmed.startsWith('Shall I') ||
      trimmed.startsWith('Happy to')
    ) {
      endIdx = i - 1;
    } else {
      break;
    }
  }

  while (endIdx > firstFence && !lines[endIdx].trim()) {
    endIdx--;
  }

  return lines.slice(firstFence, endIdx + 1).join('\n').trim() + '\n';
}

/**
 * Strip leading conversational preamble and trailing commentary from a response
 * that contains an unwrapped artifact (no code fence wrapper).
 *
 * Leading: lines before the first structural marker (heading, separator, frontmatter)
 * Trailing: conversational lines after the last structural content
 */
function stripCommentary(response: string): string {
  const lines = response.split('\n');

  // Find the first line that looks like document structure
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith('# ') ||        // markdown heading
      trimmed.startsWith('## ') ||       // markdown subheading
      trimmed.startsWith('===') ||       // separator (=== PROJECT SPEC ===)
      trimmed.startsWith('---') ||       // YAML frontmatter or horizontal rule
      trimmed.startsWith('| ')           // table row
    ) {
      startIdx = i;
      break;
    }
  }

  // If no structural marker found, return as-is
  if (startIdx === 0 && !isStructuralLine(lines[0])) {
    return response;
  }

  // Find the last line that's part of the document (walk back from end,
  // skip trailing conversational lines)
  let endIdx = lines.length - 1;
  for (let i = lines.length - 1; i > startIdx; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue; // skip blank lines

    // These patterns indicate post-artifact commentary
    if (
      trimmed.startsWith('Let me know') ||
      trimmed.startsWith('Would you like') ||
      trimmed.startsWith('Feel free') ||
      trimmed.startsWith('I can ') ||
      trimmed.startsWith('Shall I') ||
      trimmed.startsWith('If you') ||
      trimmed.startsWith('Happy to')
    ) {
      endIdx = i - 1;
    } else {
      break;
    }
  }

  // Trim trailing blank lines
  while (endIdx > startIdx && !lines[endIdx].trim()) {
    endIdx--;
  }

  const result = lines.slice(startIdx, endIdx + 1).join('\n').trim() + '\n';

  // Only strip if we kept a substantial portion (avoid over-stripping)
  if (result.length > response.length * 0.5) {
    return result;
  }

  return response;
}

function isStructuralLine(line: string): boolean {
  const trimmed = (line || '').trim();
  return (
    trimmed.startsWith('# ') ||
    trimmed.startsWith('## ') ||
    trimmed.startsWith('===') ||
    trimmed.startsWith('---') ||
    trimmed.startsWith('| ')
  );
}

export function writeArtifact(filePath: string, content: string, startMarker?: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  let extracted = extractArtifact(content, startMarker);

  // For YAML files, strip trailing non-YAML commentary (e.g. "COMPLETENESS CHECK: ...")
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    extracted = stripYamlTrailingCommentary(extracted);
  }

  writeFileSync(filePath, extracted, 'utf-8');
  console.log(chalk.green(`\n✓ Saved to ${filePath}`));
}

/**
 * Strip trailing non-YAML content from a YAML artifact.
 * Claude often adds commentary after the YAML (e.g. "COMPLETENESS CHECK: ...")
 * which breaks yaml.parse(). We find the last valid YAML line and truncate.
 */
function stripYamlTrailingCommentary(content: string): string {
  const lines = content.split('\n');

  // Walk backwards from the end, skip blank lines and find the first
  // line that looks like non-YAML commentary (starts with *, #, or uppercase words followed by :)
  let lastYamlLine = lines.length - 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue; // skip blank lines

    // These patterns indicate post-YAML commentary, not YAML content:
    // - Markdown bold: **text**
    // - Markdown headers: ## text
    // - Bare text sentences (no YAML indentation/structure)
    if (
      trimmed.startsWith('**') ||
      trimmed.startsWith('##') ||
      trimmed.startsWith('Your eval') ||
      trimmed.startsWith('COMPLETENESS') ||
      trimmed.startsWith('Run it with')
    ) {
      lastYamlLine = i - 1;
    } else {
      break;
    }
  }

  // Trim trailing blank lines
  while (lastYamlLine > 0 && !lines[lastYamlLine].trim()) {
    lastYamlLine--;
  }

  return lines.slice(0, lastYamlLine + 1).join('\n') + '\n';
}
