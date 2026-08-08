import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prerenderMermaid } from './mermaid.js';

const vendorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor');
const vendorFiles = {
  daisyui: resolve(vendorRoot, 'daisyui.css'),
  themes: resolve(vendorRoot, 'themes.css'),
  tailwind: resolve(vendorRoot, 'tailwind/index.global.js'),
  mermaid: resolve(vendorRoot, 'mermaid/mermaid.min.js')
};

function dataUri(file) {
  const type = ({
    '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf'
  })[extname(file).toLowerCase()] || 'application/octet-stream';
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}

function localFile(base, reference) {
  if (!reference || /^(data:|#|\/)/i.test(reference) || /^https?:/i.test(reference)) return undefined;
  const clean = reference.split(/[?#]/, 1)[0];
  const file = resolve(base, clean);
  return existsSync(file) ? file : undefined;
}

function inlineCssUrls(css, base) {
  return css
    .replace(/url\((['"]?)([^)'"\s]+)\1\)/gi, (match, quote, reference) => {
      const file = localFile(base, reference);
      return file ? `url("${dataUri(file)}")` : (/^https?:/i.test(reference) ? '' : match);
    })
    .replace(/@import\s+url\((['"]?)https?:[^)]*\1\);?/gi, '');
}

function remoteKind(reference) {
  if (!/^https?:/i.test(reference)) return undefined;
  const value = reference.toLowerCase();
  if (value.includes('daisyui') && value.includes('themes')) return 'themes';
  if (value.includes('daisyui')) return 'daisyui';
  if (value.includes('@tailwindcss/browser') || value.includes('cdn.tailwindcss.com')) return 'tailwind';
  if (value.includes('mermaid')) return 'mermaid';
  return undefined;
}

function vendorText(kind) {
  const file = vendorFiles[kind];
  if (!file || !existsSync(file)) throw new Error(`Kaya vendor asset missing: ${kind}`);
  return readFileSync(file, 'utf8');
}

function vendorStyle(kind) {
  return `<style data-kaya-vendor="${kind}">${vendorText(kind)}</style>`;
}

function vendorScript(kind) {
  return `<script data-kaya-vendor="${kind}">${vendorText(kind)}</script>`;
}

function inlineLocalStyles(html, base) {
  return html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attributes, css) => {
    return `<style${attributes}>${inlineCssUrls(css, base)}</style>`;
  });
}

function removeRemoteResourceAttributes(html) {
  return html.replace(/\s(?:href|src|poster|action)=["']https?:[^"']+["']/gi, '');
}

export async function inlineAssets(inputHtml, sourceFile) {
  const base = dirname(resolve(sourceFile));
  let html = await prerenderMermaid(inputHtml);
  html = inlineLocalStyles(html, base);

  html = html.replace(/<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi, (match, before, reference, after) => {
    const kind = remoteKind(reference);
    if (kind === 'daisyui' || kind === 'themes') return vendorStyle(kind);
    if (/^https?:/i.test(reference)) return '';
    const file = localFile(base, reference);
    return /stylesheet/i.test(match) && file
      ? `<style${before}${after}>${inlineCssUrls(readFileSync(file, 'utf8'), dirname(file))}</style>`
      : match;
  });

  html = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (match, before, reference, after) => {
    const kind = remoteKind(reference);
    if (kind === 'tailwind') return vendorScript(kind);
    if (kind === 'mermaid') return '';
    if (/^https?:/i.test(reference)) return '';
    const file = localFile(base, reference);
    if (!file) return match;
    if (file === vendorFiles.mermaid || /mermaid/i.test(file)) return '';
    return `<script${before}${after}>${readFileSync(file, 'utf8')}</script>`;
  });

  html = html.replace(/\s(src|poster)=["']([^"']+)["']/gi, (match, attribute, reference) => {
    const file = localFile(base, reference);
    return file ? ` ${attribute}="${dataUri(file)}"` : match;
  });
  html = html.replace(/url\((['"]?)https?:[^)'"\s]+\1\)/gi, '');
  return removeRemoteResourceAttributes(html);
}

export async function exportHtml(sourceFile, outputFile = `${sourceFile.replace(/\.html?$/i, '')}.offline.html`) {
  const html = readFileSync(resolve(sourceFile), 'utf8');
  const output = await inlineAssets(html, sourceFile);
  writeFileSync(resolve(outputFile), output);
  return resolve(outputFile);
}
