import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportHtml } from './export.js';
import { startKayaServer } from './server.js';
import { listRegistries, readRegistry } from './registry.js';

const cliFile = fileURLToPath(import.meta.url);

function usage() {
  console.error('Usage: kaya <file> | kaya list | kaya poll <file> [--agent-reply <msg>] | kaya end <file> | kaya export <file> [--out <path>] | kaya stop [file]');
}

function parseFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

async function requestTo(file, path, options = {}) {
  const registry = readRegistry(file);
  if (!registry) throw new Error(`no active Kaya session for ${file}`);
  const controller = new AbortController();
  if (options.timeoutMs) setTimeout(() => controller.abort(), options.timeoutMs).unref();
  const response = await fetch(`http://${registry.host || '127.0.0.1'}:${registry.port}${path}`, { ...options, signal: controller.signal });
  if (!response.ok) throw new Error(`Kaya server returned ${response.status}`);
  return response;
}

async function waitForSession(file) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    try {
      const response = await requestTo(file, '/__kaya/health', { timeoutMs: 500 });
      if (response.ok) return;
    } catch (_error) { /* child server may still be starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error('Kaya server did not start');
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

async function open(file) {
  const target = resolve(file);
  if (!existsSync(target)) throw new Error(`artifact not found: ${target}`);
  const existing = readRegistry(target);
  if (existing) {
    try {
      await requestTo(target, '/__kaya/health', { timeoutMs: 500 });
      // A live server for this file already exists. Reuse it so the URL and the
      // full conversation history are preserved, and clear any ended state so
      // review can continue. Reopening must never spawn a second server / URL.
      await requestTo(target, '/__kaya/reopen', { method: 'POST', timeoutMs: 500 }).catch(() => {});
      const reuseUrl = `http://${existing.host || '127.0.0.1'}:${existing.port}/`;
      console.log(`Kaya already serving ${target} at ${reuseUrl}`);
      try { openBrowser(reuseUrl); } catch (_error) { console.log(`Open this URL in a browser: ${reuseUrl}`); }
      return;
    } catch (_error) { /* stale/dead registry: fall through and spawn a fresh server */ }
  }
  const child = spawn(process.execPath, [cliFile, '--server', target], { detached: true, stdio: 'ignore', cwd: dirname(target) });
  child.unref();
  await waitForSession(target);
  const registry = readRegistry(target);
  const url = `http://${registry.host || '127.0.0.1'}:${registry.port}/`;
  console.log(`Kaya serving ${target} at ${url}`);
  try { openBrowser(url); } catch (_error) { console.log(`Open this URL in a browser: ${url}`); }
}

async function poll(file, agentReply) {
  const target = resolve(file);
  let replySent = false;
  // Block until there is real feedback or the session ends, looping over the
  // server's bounded keep-alives so no single request outlives the fetch header
  // timeout. This keeps the agent listening the whole time (like a blocking
  // poll) instead of returning an empty keep-alive that makes it stop watching
  // and miss feedback sent moments later.
  for (;;) {
    const qs = !replySent && agentReply ? `?agent_reply=${encodeURIComponent(agentReply)}` : '';
    const response = await requestTo(target, `/__kaya/poll${qs}`);
    const text = await response.text();
    replySent = true;
    const feedback = text.replace(/session_ended:[\s\S]*$/, '').trim();
    const ended = /session_ended:\s*true/.test(text);
    if (feedback || ended) { process.stdout.write(text); return; }
  }
}

async function end(file) {
  const response = await requestTo(resolve(file), '/__kaya/end', { method: 'POST' });
  console.log(await response.text());
}

function relTime(ms) {
  const s = Math.round(ms / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

async function list() {
  const rows = [];
  for (const r of listRegistries()) {
    if (!r.file || !r.port) continue;
    const origin = `http://${r.host || '127.0.0.1'}:${r.port}`;
    try {
      const resp = await fetch(`${origin}/__kaya/health`, { signal: AbortSignal.timeout(600) });
      if (!resp.ok) continue;
      const info = await resp.json();
      rows.push({ name: basename(r.file), url: `${origin}/`, ended: Boolean(info.ended), historyLen: info.historyLen || 0, lastActivity: info.lastActivity || 0 });
    } catch (_error) { /* dead session, skip */ }
  }
  rows.sort((a, b) => b.lastActivity - a.lastActivity);
  if (!rows.length) { console.log('No active Kaya sessions.'); return; }
  const now = Date.now();
  console.log(`${rows.length} active Kaya session${rows.length > 1 ? 's' : ''} (newest first):\n`);
  rows.forEach((row, index) => {
    const marker = index === 0 ? '→' : ' ';
    const status = row.ended ? ' [ended]' : '';
    console.log(`${marker} ${row.name}${status}`);
    console.log(`   ${row.url}  ${row.historyLen} msg${row.historyLen === 1 ? '' : 's'}  active ${relTime(now - row.lastActivity)}`);
  });
}

async function stop(file) {
  // `kaya stop <file>` stops only that session; bare `kaya stop` stops all.
  // Targeting matters: an untargeted stop would kill every open review at once.
  const registries = file ? [readRegistry(resolve(file))].filter(Boolean) : listRegistries();
  if (file && !registries.length) { console.log(`No active Kaya session for ${resolve(file)}`); return; }
  let stopped = 0;
  for (const registry of registries) {
    if (!registry.file) continue;
    try {
      const response = await fetch(`http://${registry.host || '127.0.0.1'}:${registry.port}/__kaya/stop`, { method: 'POST' });
      if (response.ok) { console.log(`Stopped Kaya for ${registry.file}`); stopped++; }
    } catch (_error) { /* stale registry will be replaced on the next open */ }
  }
  if (!file && !stopped) console.log('No active Kaya sessions.');
}

export async function main(args) {
  if (!args.length) { usage(); throw new Error('a command or HTML file is required'); }
  if (args[0] === '--server') {
    const server = await startKayaServer(args[1]);
    process.on('SIGTERM', () => server.close().then(() => process.exit(0)));
    process.on('SIGINT', () => server.close().then(() => process.exit(0)));
    return;
  }
  switch (args[0]) {
    case 'poll': return poll(args[1], parseFlag(args.slice(2), '--agent-reply'));
    case 'end': return end(args[1]);
    case 'export': return console.log(`Exported ${await exportHtml(args[1], parseFlag(args.slice(2), '--out'))}`);
    case 'stop': return stop(args[1]);
    case 'list': return list();
    default: return open(args[0]);
  }
}

// When executed directly - notably the detached `node cli.js --server <file>`
// child spawned by open() - run main. When imported by bin/kaya.js it stays
// dormant, so there is exactly one main() invocation per process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`kaya: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
