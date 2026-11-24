#!/usr/bin/env node
// The hands and eyes of the « utilisateur lambda » agent (docs/PLAN.md 7.6, layer 3): the
// built desktop app (`pnpm build` first) in a library and a data folder of its own (the
// author's are never touched), driven one gesture at a time by an agent that looks at the
// screen. No selectors, no knowledge of the code: what a person has.
//
//   node driver.mjs serve <out> [--real] [--web=<url>]   starts the app and waits for gestures
//   node driver.mjs <verb> <out> [args…]                 one gesture, from another shell
//
// Verbs: look · click x y · dblclick x y · rightclick x y · hover x y · type "text" ·
// key Meta+K · write <file> <section> · wait <ms> · heard · restart · quit.
// `--real`: the real Compagnon, with the key the author saved in the app (it costs API
// credit: say how much to the author first). Without it, the Compagnon is unreachable.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../..');
const [verb, outArg, ...rest] = process.argv.slice(2);
if (!verb || !outArg) {
  console.error('usage: driver.mjs serve <out> [--real] | driver.mjs <verb> <out> [args…]');
  process.exit(2);
}
const out = path.resolve(outArg);
const stateFile = path.join(out, 'driver.json');

if (verb !== 'serve') {
  // A gesture: sent to the serving process, its answer printed.
  const { port } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    body: JSON.stringify({ verb, args: rest }),
  });
  console.log(await response.text());
  process.exit(response.ok ? 0 : 1);
}

const { _electron: electron } = await import('playwright');
const real = rest.includes('--real');
fs.mkdirSync(path.join(out, 'ecrans'), { recursive: true });
const dirs = { library: path.join(out, 'Bibliothèque'), userData: path.join(out, 'data') };
const apiKey = real ? (await import('../../../../scripts/saved-key.mjs')).savedApiKey() : undefined;

let app;
let window;
let shots = 0;
const journal = [];

async function start() {
  app = await electron.launch({
    args: [appDir],
    env: {
      ...process.env,
      CHARPENTIER_LIBRARY: dirs.library,
      CHARPENTIER_USER_DATA: dirs.userData,
      CHARPENTIER_TEST_PLAIN_SECRETS: '1',
      ...(apiKey && { CHARPENTIER_ANTHROPIC_API_KEY: apiKey }),
    },
  });
  window = await app.firstWindow();
  await window.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  window.on('console', (message) => {
    if (message.type() === 'error')
      journal.push(`erreur console : ${message.text().slice(0, 300)}`);
  });
  window.on('pageerror', (error) => journal.push(`erreur : ${String(error).slice(0, 300)}`));
  // What the app understood of each gesture (packages/core/src/commands/announce.ts).
  await window.exposeFunction('__heard', (line) => void journal.push(line)).catch(() => {});
  await window.evaluate(() => {
    window.addEventListener('charpentier:command', (event) => {
      const { id, from } = event.detail;
      void window.__heard(`commande : ${id} (${from})`);
    });
  });
  await window.waitForTimeout(1500);
}

/** A section of a Markdown file: the text under the heading that holds `name`. */
function section(file, name) {
  const lines = fs.readFileSync(path.resolve(file), 'utf8').split('\n');
  const from = lines.findIndex((l) => /^#{1,6} /.test(l) && l.includes(name));
  if (from < 0) throw new Error(`pas de section « ${name} » dans ${file}`);
  const to = lines.findIndex((l, i) => i > from && /^#{1,6} /.test(l));
  return lines
    .slice(from + 1, to < 0 ? undefined : to)
    .join('\n')
    .trim();
}

const xy = (args) => [Number(args[0]), Number(args[1])];

const verbs = {
  async look() {
    shots += 1;
    const file = path.join(out, 'ecrans', `${String(shots).padStart(3, '0')}.png`);
    await window.screenshot({ path: file });
    const title = await window.title();
    return `écran : ${file}\ntitre de la fenêtre : ${title}`;
  },
  async click(args) {
    await window.mouse.click(...xy(args));
    return 'cliqué';
  },
  async dblclick(args) {
    await window.mouse.dblclick(...xy(args));
    return 'double-cliqué';
  },
  async rightclick(args) {
    await window.mouse.click(...xy(args), { button: 'right' });
    return 'clic droit';
  },
  async hover(args) {
    await window.mouse.move(...xy(args), { steps: 4 });
    return 'souris déplacée';
  },
  async type(args) {
    await window.keyboard.type(args.join(' '), { delay: 8 });
    return 'tapé';
  },
  async key(args) {
    for (const key of args) await window.keyboard.press(key);
    return 'touche pressée';
  },
  /** Types a section of a file, as the author would type his text (paragraph by paragraph). */
  async write(args) {
    const paragraphs = section(args[0], args.slice(1).join(' ')).split(/\n\s*\n/);
    for (const [index, paragraph] of paragraphs.entries()) {
      if (index > 0) await window.keyboard.press('Enter');
      await window.keyboard.type(paragraph.replace(/\n/g, ' '), { delay: 1 });
    }
    return `${paragraphs.length} paragraphes tapés`;
  },
  async wait(args) {
    await window.waitForTimeout(Math.min(Number(args[0]) || 1000, 120_000));
    return 'attendu';
  },
  /** What the app said it understood since the last call, and its errors. */
  async heard() {
    return journal.splice(0).join('\n') || 'rien';
  },
  async restart() {
    await app.close().catch(() => {});
    await start();
    return 'app relancée';
  },
  async quit() {
    await app.close().catch(() => {});
    setTimeout(() => process.exit(0), 100);
    return 'app fermée';
  },
};

await start();
const server = http.createServer((request, response) => {
  let raw = '';
  request.on('data', (chunk) => (raw += chunk));
  request.on('end', async () => {
    try {
      const { verb: asked, args } = JSON.parse(raw);
      if (!verbs[asked]) throw new Error(`geste inconnu : ${asked}`);
      const result = await verbs[asked](args ?? []);
      fs.appendFileSync(path.join(out, 'gestes.log'), `${asked} ${(args ?? []).join(' ')}\n`);
      response.end(result);
    } catch (error) {
      response.statusCode = 500;
      response.end(`échec : ${error instanceof Error ? error.message : String(error)}`);
    }
  });
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(stateFile, JSON.stringify({ port: server.address().port, pid: process.pid }));
  console.log(`prêt : ${out} (${real ? 'vrai Compagnon' : 'sans Compagnon'})`);
});
