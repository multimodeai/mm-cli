#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(`kaya: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
