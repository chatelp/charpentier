#!/usr/bin/env node
// Runs the live tests of the Compagnon (`pnpm test:llm`) with the API key the
// author saved in the app on this Mac, without ever printing it.
//
// The app keeps the key with Electron's safeStorage: encrypted in
// `secrets.json` of its data folder, with a key held by the macOS Keychain
// (« @charpentier/desktop Safe Storage »). macOS asks the author, once, to let
// `security` read that Keychain entry. On macOS, safeStorage is AES-128-CBC,
// key = PBKDF2-SHA1(Keychain password, « saltysalt », 1003), IV = 16 spaces,
// prefix « v10 ».
//
//   pnpm test:llm:mac            all the live tests (they cost API credits)
//   pnpm test:llm:mac -t refuses only those whose name matches
import { execFileSync, spawnSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SERVICE = '@charpentier/desktop Safe Storage';
const SECRETS = path.join(
  homedir(),
  'Library/Application Support/@charpentier/desktop/secrets.json',
);

if (process.platform !== 'darwin') {
  console.error(
    'Sur le Mac seulement. Ailleurs : CHARPENTIER_LIVE_LLM=1 ANTHROPIC_API_KEY=… pnpm test:llm',
  );
  process.exit(1);
}

let stored;
try {
  stored = JSON.parse(readFileSync(SECRETS, 'utf8'))['anthropic.apiKey'];
} catch {
  stored = undefined;
}
if (!stored) {
  console.error('Aucune clé enregistrée dans l’app (Réglages de l’app › Compagnon).');
  process.exit(1);
}

let password;
try {
  password = execFileSync('security', ['find-generic-password', '-w', '-s', SERVICE], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trimEnd();
} catch {
  console.error('Le trousseau n’a pas donné la clé de l’app (accès refusé ?).');
  process.exit(1);
}

const data = Buffer.from(stored, 'base64');
if (data.subarray(0, 3).toString() !== 'v10') {
  console.error('Format de clé inattendu : ressaisissez-la dans l’app.');
  process.exit(1);
}
const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
const apiKey = Buffer.concat([decipher.update(data.subarray(3)), decipher.final()]).toString(
  'utf8',
);

const run = spawnSync('pnpm', ['test:llm', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, CHARPENTIER_LIVE_LLM: '1', ANTHROPIC_API_KEY: apiKey },
});
process.exit(run.status ?? 1);
