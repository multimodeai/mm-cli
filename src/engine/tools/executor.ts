import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative } from 'node:path';

const MAX_OUTPUT = 30000;
const MAX_WEB_OUTPUT = 15000;

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
      const rawPath = input.path as string;
      const filePath = rawPath.startsWith('/') ? rawPath : resolve(cwd, rawPath);
      if (!existsSync(filePath)) {
        return `Error: File not found: ${rawPath}`;
      }
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return `Error: ${rawPath} is a directory, not a file. Use list_files to explore directories.`;
      }
      if (filePath.toLowerCase().endsWith('.pdf')) {
        return `Error: ${rawPath} is a PDF file. Use the read_pdf tool instead, which extracts text content. You can specify a page range for large PDFs.`;
      }
      try {
        const buffer = readFileSync(filePath);
        const checkLength = Math.min(buffer.length, 8192);
        for (let i = 0; i < checkLength; i++) {
          if (buffer[i] === 0) {
            return `Error: ${rawPath} appears to be a binary file and cannot be read as text.`;
          }
        }
        const fullContent = buffer.toString('utf-8');
        const offset = (input.offset as number) || 0;
        const content = offset > 0 ? fullContent.slice(offset) : fullContent;
        if (content.length > MAX_OUTPUT) {
          const end = offset + MAX_OUTPUT;
          return (
            content.slice(0, MAX_OUTPUT) +
            `\n\n... (truncated at char ${end}, file is ${fullContent.length} chars total. Use offset: ${end} to continue reading.)`
          );
        }
        return offset > 0
          ? `(reading from offset ${offset})\n${content}`
          : content;
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

    case 'read_pdf': {
      const rawPath = input.path as string;
      const pdfPath = rawPath.startsWith('/') ? rawPath : resolve(cwd, rawPath);
      if (!existsSync(pdfPath)) {
        return `Error: File not found: ${rawPath}`;
      }
      if (!pdfPath.toLowerCase().endsWith('.pdf')) {
        return `Error: ${rawPath} does not appear to be a PDF file. Use read_file for text files.`;
      }
      try {
        execSync('which pdftotext', { encoding: 'utf-8', timeout: 3000 });
      } catch {
        return 'Error: pdftotext is not installed. Install poppler to read PDFs:\n  macOS:  brew install poppler\n  Ubuntu: sudo apt install poppler-utils\n  Fedora: sudo dnf install poppler-utils';
      }
      try {
        let cmd = 'pdftotext';
        if (input.pages) {
          const pages = input.pages as string;
          const rangeMatch = pages.match(/^(\d+)(?:-(\d+))?$/);
          if (!rangeMatch) {
            return `Error: Invalid page range "${pages}". Use format like "1-10", "5", or "5-15".`;
          }
          const first = rangeMatch[1];
          const last = rangeMatch[2] || first;
          cmd += ` -f ${first} -l ${last}`;
        }
        cmd += ` "${pdfPath.replace(/"/g, '\\"')}" -`;
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
        if (!result.trim()) {
          return 'PDF extracted but contains no text content (may be a scanned/image-only PDF).';
        }
        if (result.length > MAX_OUTPUT) {
          return (
            result.slice(0, MAX_OUTPUT) +
            `\n\n... (truncated, output is ${result.length} chars total. Use the pages parameter to read specific page ranges.)`
          );
        }
        return result;
      } catch (err: unknown) {
        const msg = (err as Error).message;
        if (msg.includes('TIMEOUT')) {
          return 'Error: PDF extraction timed out. The file may be too large — use the pages parameter to read a specific range.';
        }
        return `Error reading PDF: ${msg}`;
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
