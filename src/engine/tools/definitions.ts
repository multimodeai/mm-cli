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
            'Directory path relative to project root. Use "." for project root. E.g. "src", "specs", "."',
        },
      },
      required: ['path'],
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
          description: 'Git command to run. One of: status, log, diff, branch',
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

/**
 * Distractor tools for the tool-pruning ablation (BLOATED condition).
 *
 * Unlike the earlier cartoon-junk set (send_email, lookup_weather, …) — which
 * Opus 4.8 trivially ignored, producing a 0% wrong-tool rate — these are
 * PLAUSIBLY-COMPETING tools for a data-reconciliation task. They overlap the
 * real file tools enough to create genuine selection ambiguity.
 *
 * The crux is `quick_preview` (THE TRAP): it really reads the target file but
 * returns only the first ~15 rows with NO truncation warning, presented as the
 * whole file. A model that reaches for quick_preview on a long ledger sees the
 * header rows and never reaches the mid-file FROZEN flag — this is the precise
 * mechanism by which tool bloat causes a load-bearing miss. The remaining eight
 * are plausible stubs (read_spreadsheet, extract_table, …) that waste a step but
 * never crash. See evals/khairat-fund/eval.yaml.
 */
export const DISTRACTOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'quick_preview',
    description:
      'Quickly preview a data file to get the gist without loading the whole thing. Returns the leading rows plus a one-line summary — ideal for large CSV/TSV/log files when you just need to understand the shape and columns fast.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path (relative to project root or absolute).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_spreadsheet',
    description:
      'Read a spreadsheet (CSV/TSV/XLSX) and return its cells as structured rows. Handles delimited and workbook formats.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Spreadsheet file path' },
        sheet: { type: 'string', description: 'Sheet name (for multi-sheet workbooks)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'extract_table',
    description:
      'Extract a tabular region from a document or data file and return it as rows and columns.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Source file path' },
        table_index: { type: 'number', description: 'Which table to extract if several (0-based)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'parse_csv_records',
    description:
      'Parse a CSV file into a list of typed records keyed by header, with basic type inference.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'CSV file path' },
        delimiter: { type: 'string', description: 'Field delimiter (default ",")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'summarize_document',
    description:
      'Produce a concise summary of a document or data file, highlighting key fields and notable values.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Document or data file path' },
        max_sentences: { type: 'number', description: 'Approximate summary length' },
      },
      required: ['path'],
    },
  },
  {
    name: 'full_text_search',
    description:
      'Run a full-text search across an indexed document store and return ranked snippets. Useful for finding records by free-text query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        index: { type: 'string', description: 'Named index to search (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_record_by_id',
    description:
      'Fetch a single record by its identifier from the records service (e.g. a member or claim ID).',
    input_schema: {
      type: 'object' as const,
      properties: {
        record_id: { type: 'string', description: 'Record identifier (e.g. "MBR-0317")' },
        collection: { type: 'string', description: 'Record collection/table name (optional)' },
      },
      required: ['record_id'],
    },
  },
  {
    name: 'open_archive',
    description:
      'Open a compressed archive (zip/tar/gz) and list or extract its contents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Archive file path' },
        extract_to: { type: 'string', description: 'Directory to extract into (optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_sheet_names',
    description:
      'List the sheet/tab names inside a spreadsheet workbook without reading cell data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Workbook file path' },
      },
      required: ['path'],
    },
  },
];

/**
 * Minimal file-discovery subset of CODEBASE_TOOLS — the three tools a corpus
 * reconciliation task genuinely needs: read text sources, find files by name,
 * and grep contents. Drops list_directory, read_pdf, and git_info as well as
 * every distractor. Critically, it OMITS quick_preview, so a pruned model has
 * no truncating shortcut and must read the ledger in full to find the canary.
 * This is the PRUNED condition of the tool-pruning ablation.
 */
export const PRUNED_CODEBASE_TOOLS: Anthropic.Tool[] = CODEBASE_TOOLS.filter((t) =>
  ['read_file', 'list_files', 'search_files'].includes(t.name)
);

/** CODEBASE_TOOLS plus the distractor tools — the BLOATED condition. */
export const BLOATED_CODEBASE_TOOLS: Anthropic.Tool[] = [
  ...CODEBASE_TOOLS,
  ...DISTRACTOR_TOOLS,
];

export type ToolSet = 'pruned' | 'full' | 'bloated';

/** Set of distractor tool names, for computing wrong-tool-selection rate. */
export const DISTRACTOR_TOOL_NAMES: Set<string> = new Set(
  DISTRACTOR_TOOLS.map((t) => t.name)
);

/**
 * Resolve the tool array the runner should pass for a given tool_set.
 * Defaults to 'full' (CODEBASE_TOOLS) so existing suites are unaffected.
 */
export function resolveToolSet(toolSet: ToolSet = 'full'): Anthropic.Tool[] {
  switch (toolSet) {
    case 'pruned':
      return PRUNED_CODEBASE_TOOLS;
    case 'bloated':
      return BLOATED_CODEBASE_TOOLS;
    case 'full':
    default:
      return CODEBASE_TOOLS;
  }
}

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
