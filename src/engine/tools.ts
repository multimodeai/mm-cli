import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import type { MmTier } from '../util/config.js';

const MAX_OUTPUT = 10000;
const MAX_WEB_OUTPUT = 15000;

export const CODEBASE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read a file from the project. Returns its full contents. Use this to understand existing code, configs, and documentation before writing specifications.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root (e.g. "src/index.ts", "lib/db/schema.ts", "CLAUDE.md")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description:
      'Find files matching a name pattern in the project. Returns relative file paths, sorted. Use glob-style name patterns.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description:
            'File name pattern (e.g. "*.ts", "*.tsx", "schema*", "route.ts")',
        },
        path: {
          type: 'string',
          description:
            'Directory to search in, relative to project root (default: project root)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'search_files',
    description:
      'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers. Like grep.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description:
            'Regex pattern to search for (e.g. "function.*compose", "import.*ffmpeg")',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: project root)',
        },
        file_pattern: {
          type: 'string',
          description:
            'Filter to specific file types (e.g. "*.ts", "*.tsx")',
        },
      },
      required: ['pattern'],
    },
  },
];

export const WEB_TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description:
      'Search the web for information. Returns titles, URLs, and snippets for top results. Use for researching best practices, academic papers (arxiv, Google Scholar), documentation, algorithms, and current techniques.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Search query (e.g. "adversarial attacks content fingerprinting arxiv", "TikTok duplicate detection algorithm 2024")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description:
      'Fetch a web page and return its text content (HTML stripped). Use to read articles, papers, documentation, blog posts after finding them via web_search.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description:
            'Full URL to fetch (e.g. "https://arxiv.org/abs/2301.12345")',
        },
        max_length: {
          type: 'number',
          description: 'Maximum characters to return (default: 15000)',
        },
      },
      required: ['url'],
    },
  },
];

/** All tools available during interviews */
export const ALL_TOOLS: Anthropic.Tool[] = [
  ...CODEBASE_TOOLS,
  ...WEB_TOOLS,
];

/**
 * Return the tools available for a given tier.
 * - free: codebase tools only (read_file, list_files, search_files)
 * - pro/enterprise: all tools (codebase + web_search + web_fetch)
 */
export function getToolsForTier(tier: MmTier): Anthropic.Tool[] {
  if (tier === 'free') return CODEBASE_TOOLS;
  return ALL_TOOLS;
}

/**
 * Execute a tool by name. Async because web tools use fetch.
 * Codebase tools run synchronously but are wrapped in async for uniform interface.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const cwd = process.cwd();

  switch (name) {
    case 'read_file': {
      const filePath = resolve(cwd, input.path as string);
      if (!filePath.startsWith(cwd)) {
        return 'Error: Cannot read files outside the project directory';
      }
      if (!existsSync(filePath)) {
        return `Error: File not found: ${input.path}`;
      }
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return `Error: ${input.path} is a directory, not a file. Use list_files to explore directories.`;
      }
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (content.length > MAX_OUTPUT) {
          return (
            content.slice(0, MAX_OUTPUT) +
            `\n\n... (truncated, file is ${content.length} chars total)`
          );
        }
        return content;
      } catch (err: unknown) {
        return `Error reading file: ${(err as Error).message}`;
      }
    }

    case 'list_files': {
      const basePath = input.path
        ? resolve(cwd, input.path as string)
        : cwd;
      if (!basePath.startsWith(cwd)) {
        return 'Error: Cannot search outside the project directory';
      }
      try {
        const pattern = (input.pattern as string).replace(/"/g, '\\"');
        const cmd = `find "${basePath}" -name "${pattern}" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -not -path "*/dist/*" -type f 2>/dev/null | sort | head -100`;
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
        const files = result
          .split('\n')
          .filter(Boolean)
          .map((p) => relative(cwd, p));
        return files.length > 0
          ? files.join('\n')
          : 'No files found matching pattern';
      } catch {
        return 'No files found matching pattern';
      }
    }

    case 'search_files': {
      const searchPath = input.path
        ? resolve(cwd, input.path as string)
        : cwd;
      if (!searchPath.startsWith(cwd)) {
        return 'Error: Cannot search outside the project directory';
      }
      try {
        const pattern = (input.pattern as string).replace(/"/g, '\\"');
        const include = input.file_pattern
          ? `--include="${(input.file_pattern as string).replace(/"/g, '\\"')}"`
          : '';
        const cmd = `grep -rn ${include} "${pattern}" "${searchPath}" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist 2>/dev/null | head -60`;
        let result = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
        // Convert absolute paths to relative
        result = result
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) return line;
            const filePart = line.slice(0, colonIdx);
            const rest = line.slice(colonIdx);
            if (filePart.startsWith('/')) {
              return relative(cwd, filePart) + rest;
            }
            return line;
          })
          .join('\n');
        if (result.length > MAX_OUTPUT) {
          result =
            result.slice(0, MAX_OUTPUT) + '\n... (truncated)';
        }
        return result || 'No matches found';
      } catch {
        return 'No matches found';
      }
    }

    case 'web_search': {
      return executeWebSearch(input.query as string);
    }

    case 'web_fetch': {
      const maxLength = (input.max_length as number) || MAX_WEB_OUTPUT;
      return executeWebFetch(input.url as string, maxLength);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

/**
 * Search the web using DuckDuckGo HTML. No API key required.
 */
async function executeWebSearch(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return `Error: Search returned status ${response.status}`;
    }

    const html = await response.text();

    // Parse DDG HTML results
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // DDG HTML has result links with class="result__a" and snippets with class="result__snippet"
    const linkRegex =
      /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex =
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span)>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      let resultUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();

      // DDG wraps URLs in redirects: //duckduckgo.com/l/?uddg=ENCODED_URL
      if (resultUrl.includes('uddg=')) {
        const uddgMatch = resultUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          resultUrl = decodeURIComponent(uddgMatch[1]);
        }
      }

      if (title && resultUrl && !resultUrl.startsWith('//duckduckgo.com')) {
        links.push({ url: resultUrl, title });
      }
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      const snippet = match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
      if (snippet) snippets.push(snippet);
    }

    for (let i = 0; i < Math.min(links.length, 10); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || '',
      });
    }

    if (results.length === 0) {
      return 'No search results found. Try a different or broader query.';
    }

    return results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
      )
      .join('\n\n');
  } catch (err) {
    return `Error performing web search: ${(err as Error).message}`;
  }
}

/**
 * Fetch a web page and return text content (HTML stripped).
 */
async function executeWebFetch(
  url: string,
  maxLength: number
): Promise<string> {
  try {
    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return 'Error: URL must start with http:// or https://';
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return `Error: Fetch returned status ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();

    let text: string;
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      text = stripHtml(body);
    } else {
      text = body;
    }

    if (text.length > maxLength) {
      text =
        text.slice(0, maxLength) +
        `\n\n... (truncated, page is ${text.length} chars total)`;
    }

    return text || 'Page returned empty content.';
  } catch (err) {
    return `Error fetching URL: ${(err as Error).message}`;
  }
}

/**
 * Strip HTML tags and convert to readable plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +/gm, '')
    .trim();
}
