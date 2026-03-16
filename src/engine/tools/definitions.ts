import type Anthropic from '@anthropic-ai/sdk';

export const CODEBASE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read a text file. Accepts relative paths (resolved against project root) or absolute paths for cross-directory access. For PDFs, use read_pdf instead. If a file is truncated, use offset to read the remaining content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description:
            'File path relative to project root (e.g. "src/index.ts") or absolute path (e.g. "/Users/foo/other-project/README.md")',
        },
        offset: {
          type: 'number',
          description:
            'Character offset to start reading from. Use when a previous read was truncated to continue reading the rest of the file.',
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
  {
    name: 'list_directory',
    description:
      'List all files and subdirectories in a directory (non-recursive). Returns names with trailing / for directories. Useful for understanding project structure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description:
            'Directory path relative to project root (default: project root). E.g. "src", "specs", "."',
        },
      },
    },
  },
  {
    name: 'git_info',
    description:
      'Get git repository information. Supports: "status" (working tree status), "log" (recent commits), "diff" (uncommitted changes summary), "branch" (current branch info).',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          enum: ['status', 'log', 'diff', 'branch'],
          description: 'Git command to run: status, log (last 20 commits), diff (stat only), or branch',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_pdf',
    description:
      'Extract text from a PDF file. For large PDFs (20+ pages), use the pages parameter to read in chunks. Accepts relative or absolute paths. Requires pdftotext (poppler).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description:
            'PDF file path relative to project root or absolute (e.g. "docs/design.pdf", "/Users/foo/Documents/spec.pdf")',
        },
        pages: {
          type: 'string',
          description:
            'Page range to extract, e.g. "1-10", "5-15", "5". Omit to read entire PDF. Use for large PDFs to stay within output limits.',
        },
      },
      required: ['path'],
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
 * Return all available tools for interviews.
 */
export function getTools(): Anthropic.Tool[] {
  return ALL_TOOLS;
}
