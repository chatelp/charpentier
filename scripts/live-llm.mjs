#!/usr/bin/env node
// Runs the live tests of the Compagnon (`pnpm test:llm`) with the API key the
// author saved in the app on this Mac (see saved-key.mjs), never printed.
//
//   pnpm test:llm:mac            all the live tests (they cost API credits)
//   pnpm test:llm:mac -t refuses only those whose name matches
import { spawnSync } from 'node:child_process';
import { savedApiKey } from './saved-key.mjs';

const apiKey = savedApiKey();
const run = spawnSync('pnpm', ['test:llm', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, CHARPENTIER_LIVE_LLM: '1', ANTHROPIC_API_KEY: apiKey },
});
process.exit(run.status ?? 1);
