import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function registryDirectory() {
  const configured = process.env.KAYA_STATE_DIR;
  const directory = configured ? resolve(configured) : join(tmpdir(), 'kaya-editor');
  mkdirSync(directory, { recursive: true });
  return directory;
}

function keyFor(file) {
  return createHash('sha256').update(resolve(file)).digest('hex').slice(0, 24);
}

export function registryPath(file) { return join(registryDirectory(), `${keyFor(file)}.json`); }

export function writeRegistry(file, value) {
  writeFileSync(registryPath(file), JSON.stringify({ file: resolve(file), ...value }, null, 2));
}

export function readRegistry(file) {
  const path = registryPath(file);
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (_error) { return undefined; }
}

export function removeRegistry(file) {
  const path = registryPath(file);
  if (existsSync(path)) unlinkSync(path);
}

export function listRegistries() {
  return readdirSync(registryDirectory()).filter((name) => name.endsWith('.json')).map((name) => {
    try { return JSON.parse(readFileSync(join(registryDirectory(), name), 'utf8')); }
    catch (_error) { return undefined; }
  }).filter(Boolean);
}

export function defaultStateDirectory() { return join(homedir(), '.kaya-editor'); }
