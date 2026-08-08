import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const VERSION = '11.15.0';
const here = dirname(fileURLToPath(import.meta.url));
const runtimeFile = join(here, '../vendor/mermaid/mermaid.min.js');
const renderedCache = new Map();

function decodeHtml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function sourceFromContent(content) {
  return decodeHtml(content.replace(/<[^>]*>/g, '').trim());
}

function browserCommand() {
  const configured = process.env.KAYA_BROWSER;
  if (configured) return configured;
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => existsSync(candidate));
}

function chromeArgs(file, profile) {
  return [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--no-first-run',
    '--no-sandbox',
    '--allow-file-access-from-files',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=10000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    pathToFileURL(file).href
  ];
}

function renderDocument(source) {
  const browser = browserCommand();
  if (!browser) {
    throw new Error('real Mermaid export requires Chrome or Chromium; set KAYA_BROWSER to its executable');
  }
  if (!existsSync(runtimeFile)) throw new Error(`vendored Mermaid runtime missing: ${runtimeFile}`);

  const directory = mkdtempSync(join(tmpdir(), 'kaya-mermaid-'));
  const input = join(directory, 'render.html');
  const profile = join(directory, 'profile');
  const sourceBase64 = Buffer.from(source, 'utf8').toString('base64');
  const runtimeUrl = pathToFileURL(runtimeFile).href;
  const html = `<!doctype html><meta charset="utf-8"><body><div id="kaya-export-target"></div><script src="${runtimeUrl}"></script><script>
(async () => {
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', deterministicIds: true, deterministicIDSeed: 'kaya' });
    const source = decodeURIComponent(Array.from(atob('${sourceBase64}'), (char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const result = await mermaid.render('kaya-export-diagram', source);
    document.getElementById('kaya-export-target').innerHTML = '<!--KAYA_SVG_BEGIN-->' + result.svg + '<!--KAYA_SVG_END-->';
  } catch (error) {
    document.body.setAttribute('data-kaya-mermaid-error', String(error));
  }
})();
</script></body>`;
  writeFileSync(input, html);
  return new Promise((resolveRender, rejectRender) => {
    const child = spawn(browser, chromeArgs(input, profile), { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const cleanup = () => {
      try { rmSync(directory, { recursive: true, force: true }); } catch (_error) { /* Chrome may still hold a profile file */ }
    };
    const finish = (error, svg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      if (error) rejectRender(error);
      else resolveRender(svg);
    };
    const inspect = () => {
      const match = output.match(/<!--KAYA_SVG_BEGIN-->([\s\S]*?)<!--KAYA_SVG_END-->/);
      if (match && /<svg\b/i.test(match[1])) return finish(undefined, match[1].trim());
      if (output.length > 12 * 1024 * 1024) return finish(new Error('Mermaid output exceeded 12 MB'));
      return undefined;
    };
    const timer = setTimeout(() => {
      const error = output.match(/data-kaya-mermaid-error="([^"]*)"/i)?.[1] || 'Chrome did not produce an SVG before the 15 second timeout';
      finish(new Error(`Mermaid ${VERSION} render failed: ${error}`));
    }, 15000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; inspect(); });
    child.on('error', (error) => finish(error));
    child.on('close', () => {
      cleanup();
      const match = output.match(/<!--KAYA_SVG_BEGIN-->([\s\S]*?)<!--KAYA_SVG_END-->/);
      if (match && /<svg\b/i.test(match[1])) finish(undefined, match[1].trim());
      else if (!settled) finish(new Error(`Mermaid ${VERSION} render failed: Chrome exited without an SVG`));
    });
    setTimeout(cleanup, 30000).unref();
  });
}

export function mermaidRuntime() {
  return readFileSync(runtimeFile, 'utf8');
}

export function mermaidRuntimeMarkup() {
  return `<script data-kaya-mermaid-runtime="${VERSION}">${mermaidRuntime()}</script><script data-kaya-mermaid-init="${VERSION}">
(() => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
  mermaid.run({ querySelector: '.mermaid' });
})();
</script>`;
}

export function injectMermaidRuntime(html) {
  if (!/class=["'][^"']*\bmermaid\b[^"']*["']/i.test(html) || /data-kaya-mermaid-runtime=/i.test(html)) return html;
  const markup = mermaidRuntimeMarkup();
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${markup}</body>`) : `${html}\n${markup}`;
}

export async function renderMermaidSource(source) {
  if (!renderedCache.has(source)) renderedCache.set(source, renderDocument(source));
  try { return await renderedCache.get(source); }
  catch (error) { renderedCache.delete(source); throw error; }
}

export async function prerenderMermaid(html) {
  const replacements = [];
  const template = html.replace(/(<(?:div|pre|section)[^>]*class=["'][^"']*\bmermaid\b[^"']*["'][^>]*>)([\s\S]*?)(<\/(?:div|pre|section)>)/gi, (_match, open, content, close) => {
    const source = sourceFromContent(content);
    const token = `KAYA_MERMAID_REPLACEMENT_${replacements.length}_${Buffer.from(source).toString('base64url')}`;
    replacements.push({ token, open, source, close, rendered: renderMermaidSource(source) });
    return token;
  });
  let output = template;
  for (const replacement of replacements) {
    const svg = await replacement.rendered;
    output = output.replace(replacement.token, `${replacement.open}<div data-kaya-mermaid-source="${Buffer.from(replacement.source).toString('base64')}">${svg}</div>${replacement.close}`);
  }
  return output;
}
