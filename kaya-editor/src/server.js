import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { injectOverlay, injectBaseTheme } from './overlay.js';
import { removeRegistry, writeRegistry } from './registry.js';
import { injectMermaidRuntime, mermaidRuntime } from './mermaid.js';
import { markdownDocument } from './markdown.js';
import { inlineAssets } from './export.js';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.html': 'text/html; charset=utf-8'
};

function json(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function body(request) {
  return new Promise((resolveBody, reject) => {
    let value = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { value += chunk; if (value.length > 1024 * 1024) reject(new Error('request body too large')); });
    request.on('end', () => resolveBody(value));
    request.on('error', reject);
  });
}

function safeAssetPath(root, pathname) {
  const relative = decodeURIComponent(pathname.replace(/^\//, ''));
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return undefined;
  return candidate;
}

export class KayaReviewServer {
  constructor(file, options = {}) {
    this.file = resolve(file);
    this.root = dirname(this.file);
    this.port = options.port || 0;
    this.host = options.host || '127.0.0.1';
    this.server = undefined;
    this.queue = [];
    this.waiters = new Set();
    this.agentReply = '';
    this.ended = false;
  }

  start() {
    if (this.server) return Promise.resolve(this);
    if (!existsSync(this.file) || !statSync(this.file).isFile()) throw new Error(`artifact not found: ${this.file}`);
    this.server = createServer((request, response) => this.handle(request, response));
    return new Promise((resolveStart, rejectStart) => {
      this.server.once('error', rejectStart);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', rejectStart);
        this.port = this.server.address().port;
        resolveStart(this);
      });
    });
  }

  address() { return `http://${this.host}:${this.port}/`; }

  async close() {
    for (const waiter of this.waiters) waiter({ feedback: [], ended: true });
    this.waiters.clear();
    if (!this.server) return;
    await new Promise((resolveClose) => this.server.close(() => resolveClose()));
    this.server = undefined;
    removeRegistry(this.file);
  }

  notify() {
    // Nobody is polling right now: keep the queue intact so the NEXT poll drains
    // it. Splicing here would silently drop feedback sent between polls.
    if (!this.waiters.size) return;
    if (!this.queue.length && !this.ended) return;
    const result = { feedback: this.queue.splice(0), ended: this.ended };
    for (const waiter of this.waiters) waiter(result);
    this.waiters.clear();
  }

  poll(agentReply) {
    if (typeof agentReply === 'string') this.agentReply = agentReply;
    if (this.queue.length || this.ended) return Promise.resolve({ feedback: this.queue.splice(0), ended: this.ended });
    return new Promise((resolvePoll) => {
      this.waiters.add(resolvePoll);
      // Bounded long-poll: resolve with an empty keep-alive well inside the
      // client's fetch/header timeout so the agent just re-polls instead of
      // erroring on a connection that was held open too long.
      const timer = setTimeout(() => {
        if (this.waiters.delete(resolvePoll)) resolvePoll({ feedback: [], ended: this.ended });
      }, 25000);
      if (timer.unref) timer.unref();
    });
  }

  async handle(request, response) {
    const url = new URL(request.url || '/', this.address());
    if (url.pathname === '/__kaya/health') return json(response, 200, { ok: true, file: this.file });
    if (url.pathname === '/__kaya/mermaid-runtime.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return response.end(mermaidRuntime());
    }
    if (url.pathname === '/__kaya/export') {
      const raw = readFileSync(this.file, 'utf8');
      const isMd = /\.(md|markdown)$/i.test(this.file);
      const source = isMd ? markdownDocument(raw, basename(this.file)) : raw;
      const html = await inlineAssets(source, this.file);
      const name = basename(this.file).replace(/\.(md|markdown|html?)$/i, '') + '.offline.html';
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'no-store',
      });
      return response.end(html);
    }
    if (url.pathname === '/__kaya/state' && request.method === 'GET') return json(response, 200, { agentReply: this.agentReply, ended: this.ended, queued: this.queue.length });
    if (url.pathname === '/__kaya/poll' && request.method === 'GET') {
      const result = await this.poll(url.searchParams.get('agent_reply') || undefined);
      const feedback = result.feedback.map((item) => item.rawText).join('\n\n');
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`${feedback}${feedback ? '\n\n' : ''}session_ended: ${result.ended ? 'true' : 'false'}\n`);
      return;
    }
    if (url.pathname === '/__kaya/feedback' && request.method === 'POST') {
      try {
        const data = JSON.parse(await body(request));
        if (!data || typeof data.text !== 'string' || !data.text.trim()) return json(response, 400, { error: 'text is required' });
        const item = { text: data.text.trim(), tag: data.tag || 'comment', selector: data.selector || undefined, selectedText: data.selectedText || undefined, createdAt: new Date().toISOString() };
        item.rawText = `[${item.tag}]${item.selector ? ` ${item.selector}` : ''}${item.selectedText ? `\nSelected: ${item.selectedText}` : ''}\n${item.text}`;
        this.queue.push(item);
        this.notify();
        return json(response, 202, { queued: true });
      } catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'invalid JSON' }); }
    }
    if (url.pathname === '/__kaya/end' && request.method === 'POST') {
      this.ended = true;
      this.notify();
      return json(response, 200, { ended: true });
    }
    if (url.pathname === '/__kaya/stop' && request.method === 'POST') {
      json(response, 200, { stopped: true });
      setImmediate(() => this.close());
      return;
    }
    if (request.method !== 'GET' || url.pathname.startsWith('/__kaya/')) return json(response, 404, { error: 'not found' });

    const requested = url.pathname === '/' ? this.file : safeAssetPath(this.root, url.pathname);
    if (!requested || !existsSync(requested) || !statSync(requested).isFile()) return json(response, 404, { error: 'asset not found' });
    const content = readFileSync(requested);
    if (requested === this.file && /\.(md|markdown)$/i.test(requested)) {
      const doc = injectMermaidRuntime(injectOverlay(markdownDocument(content.toString('utf8'), basename(this.file))));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return response.end(doc);
    }
    const type = MIME_TYPES[extname(requested).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(requested === this.file && /\.html?$/i.test(requested)
      ? injectMermaidRuntime(injectOverlay(injectBaseTheme(content.toString('utf8'))))
      : content);
  }
}

export async function startKayaServer(file, options = {}) {
  const instance = new KayaReviewServer(file, options);
  await instance.start();
  writeRegistry(file, { port: instance.port, pid: process.pid, host: instance.host });
  return instance;
}

export function formatFeedback(item) { return item.rawText || item.text || ''; }

export function fileName(file) { return basename(file); }
