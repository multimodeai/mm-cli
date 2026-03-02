import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walk up from startDir looking for a marker file that indicates project root.
 * Markers checked in order: .git, package.json, CLAUDE.md
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  const root = dirname(dir);

  while (dir !== root) {
    for (const marker of ['.git', 'package.json', 'CLAUDE.md']) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

export function getSkillsDir(projectRoot: string): string {
  return join(projectRoot, '.claude', 'skills');
}

export function getEvalsDir(projectRoot: string): string {
  return join(projectRoot, 'evals');
}

export function ensureDir(dirPath: string): void {
  const { mkdirSync } = require('node:fs');
  mkdirSync(dirPath, { recursive: true });
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
