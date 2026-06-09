#!/usr/bin/env node
/**
 * CLI entry point — compiled output is at dist/runner.js but we call the
 * TypeScript source via tsx at dev time and the dist/ folder in production.
 * The bin field in package.json points here; npm/npx resolve the path.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try compiled dist first, fall back to tsx for development
let cli;
try {
  const { default: mod } = await import(join(__dirname, '../dist/cli.js'));
  cli = mod;
} catch {
  // During development: run via `npx tsx src/cli.ts`
  console.error('Run `npm run build` first, or use: npx tsx src/cli.ts <url>');
  process.exit(1);
}

await cli();
