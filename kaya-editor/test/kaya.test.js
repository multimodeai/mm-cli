import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportHtml, inlineAssets } from '../src/export.js';
import { KayaReviewServer } from '../src/server.js';

const activeServers = [];
const tempDirs = [];

afterEach(async () => {
  await Promise.all(activeServers.splice(0).map((server) => server.close()));
  tempDirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

function fixture(content = '<!doctype html><html><body><main><h1>Hello Kaya</h1></main></body></html>') {
  const directory = mkdtempSync(join(tmpdir(), 'kaya-test-'));
  tempDirs.push(directory);
  const file = join(directory, 'artifact.html');
  writeFileSync(file, content);
  return { directory, file };
}

describe('Kaya HTTP review server', () => {
  it('serves the artifact with the injected overlay and sibling assets', async () => {
    const { directory, file } = fixture();
    writeFileSync(join(directory, 'note.txt'), 'sibling asset');
    const server = new KayaReviewServer(file);
    activeServers.push(server);
    await server.start();

    const page = await fetch(server.address());
    const asset = await fetch(`${server.address()}note.txt`);
    expect(page.status).toBe(200);
    const pageText = await page.text();
    expect(pageText).toContain('Multimode · Kaya');
    expect(pageText).toContain('#c75b3f');
    expect((await asset.text())).toBe('sibling asset');
  });

  it('serves Mermaid containers with the pinned real runtime', async () => {
    const { file } = fixture('<!doctype html><html><body><div class="mermaid">flowchart TD\nA[Start] --> B[Finish]</div></body></html>');
    const server = new KayaReviewServer(file);
    activeServers.push(server);
    await server.start();
    const page = await (await fetch(server.address())).text();
    expect(page).toContain('data-kaya-mermaid-runtime="11.15.0"');
    expect(page).toContain('data-kaya-mermaid-init="11.15.0"');
    expect(page).toContain('mermaid.run');
  });

  it('long-polls until feedback arrives and preserves raw text', async () => {
    const { file } = fixture();
    const server = new KayaReviewServer(file);
    activeServers.push(server);
    await server.start();

    const polling = fetch(`${server.address()}__kaya/poll?agent_reply=${encodeURIComponent('I am ready')}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const feedback = await fetch(`${server.address()}__kaya/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Make the title warmer', tag: 'change', selector: 'h1' })
    });
    expect(feedback.status).toBe(202);
    const pollText = await (await polling).text();
    expect(pollText).toContain('[change] h1');
    expect(pollText).toContain('Make the title warmer');
    expect(pollText).toContain('session_ended: false');
    expect((await (await fetch(`${server.address()}__kaya/state`)).json()).agentReply).toBe('I am ready');
  });

  it('returns a detectable ended marker when the session ends', async () => {
    const { file } = fixture();
    const server = new KayaReviewServer(file);
    activeServers.push(server);
    await server.start();
    await fetch(`${server.address()}__kaya/end`, { method: 'POST' });
    const response = await fetch(`${server.address()}__kaya/poll`);
    expect(await response.text()).toContain('session_ended: true');
  });
});

describe('Kaya offline export', () => {
  it('inlines local assets, removes network dependencies, and pre-renders Mermaid', async () => {
    const { directory, file } = fixture(`<!doctype html><html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5.5.19/daisyui.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5.5.19/themes.css"><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.2.4/dist/index.global.js"></script><script src="https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.min.js"></script></head><body><img src="images/pixel.png"><div class="mermaid">flowchart TD\nA[Start] --> B[Finish]</div></body></html>`);
    const styles = join(directory, 'styles.css');
    writeFileSync(styles, '.hero{background:url("images/pixel.png")}');
    const imageDirectory = join(directory, 'images');
    mkdirSync(imageDirectory);
    writeFileSync(join(imageDirectory, 'pixel.png'), Buffer.from('not-a-real-png'));
    const html = readFileSync(file, 'utf8').replace('styles/site.css', 'styles.css');
    writeFileSync(file, html);

    const output = await inlineAssets(html, file);
    expect(output).toContain('data:image/png;base64,');
    expect(output).toContain('data-kaya-vendor="daisyui"');
    expect(output).toContain('--color-primary');
    expect(output).toContain('data-kaya-vendor="themes"');
    expect(output).toContain('data-kaya-vendor="tailwind"');
    expect(output).toContain('4.2.4');
    expect(output).toContain('<svg');
    expect(output).toContain('marker-end=');
    expect(output).not.toContain('cdn.jsdelivr.net');
    expect(output).not.toContain('src="images/pixel.png"');
    expect(output).not.toMatch(/\b(?:src|href)=["']https?:/i);
    expect(output).not.toMatch(/url\(["']?https?:/i);
    expect(Buffer.byteLength(output)).toBeLessThan(2 * 1024 * 1024);
    expect(output).not.toContain('@font-face');

    const outFile = join(directory, 'offline.html');
    expect(await exportHtml(file, outFile)).toBe(outFile);
    expect(readFileSync(outFile, 'utf8')).toContain('data-kaya-vendor="daisyui"');
  }, 30000);
});
