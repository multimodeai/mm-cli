#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { registerPreflight } from './commands/preflight.js';
import { registerDiagnose } from './commands/diagnose.js';
import { registerRewrite } from './commands/rewrite.js';
import { registerContext } from './commands/context.js';
import { registerSpec } from './commands/spec.js';
import { registerIntent } from './commands/intent.js';
import { registerEval } from './commands/eval.js';
import { registerConstraint } from './commands/constraint.js';
import { registerSkill } from './commands/skill.js';
import { registerHarness } from './commands/harness.js';

// Read the version from package.json at runtime instead of hardcoding it here,
// so `mm --version` can never drift from the real package version again.
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('mm')
  .version(pkg.version)
  .description(
    'Operationalize the 4 disciplines of AI input with measurable eval outcomes.\n\n' +
    '  Prompt Craft    → mm preflight, mm rewrite\n' +
    '  Context Eng.    → mm diagnose, mm context build\n' +
    '  Intent Eng.     → mm intent init, mm constraint\n' +
    '  Spec Eng.       → mm spec new\n' +
    '  Eval & Skills   → mm eval, mm skill'
  );

// Register all commands
registerPreflight(program);
registerDiagnose(program);
registerRewrite(program);
registerContext(program);
registerSpec(program);
registerIntent(program);
registerEval(program);
registerConstraint(program);
registerSkill(program);
registerHarness(program);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n');
  process.exit(0);
});

program.parse();
