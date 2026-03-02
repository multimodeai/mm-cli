import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import chalk from 'chalk';

export function writeArtifact(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  console.log(chalk.green(`\n✓ Saved to ${filePath}`));
}
