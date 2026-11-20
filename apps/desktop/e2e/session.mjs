#!/usr/bin/env node
// An automatic session with the real Compagnon in the built desktop app
// (`pnpm build` first), in a library and a data folder of its own: the
// author's are never touched. It plays the author's gestures of phases 6.1 to
// 6.5 and leaves a screenshot of each in the output folder.
//
//   pnpm session:mac <out> [steps…]   (builds, then plays the session)
//
// Steps: book (the manuscript, no call), interview, guided, structure, style
// (with `--book=<file>`), memory (quits, relaunches, asks). Without steps: all of them. `--fake`: no
// key, the Compagnon unreachable (to try the gestures for free).
// It costs API credits: about 1 € for all the steps.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { savedApiKey } from '../../../scripts/saved-key.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => !a.startsWith('-')) ?? 'session');
const fake = args.includes('--fake');
// `--book=<file>`: the reference text of the style step (.txt, .md, .epub, .pdf).
const book = args.find((a) => a.startsWith('--book='))?.slice('--book='.length);
const asked = args.filter((a) => !a.startsWith('-')).slice(1);
const steps = asked.length
  ? asked
  : ['book', 'interview', 'guided', 'structure', ...(book ? ['style'] : []), 'memory'];
fs.mkdirSync(out, { recursive: true });
const dirs = { library: path.join(out, 'Bibliothèque'), userData: path.join(out, 'data') };
const apiKey = fake ? 'sk-ant-none' : savedApiKey();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MANUSCRIPT = [
  [
    'Le départ',
    [
      [
        'Le quai',
        'Hélène attache la barque au quai de la Fosse. La lettre de son frère Paul tremble dans sa main : il promet de rentrer avant la crue, et de tout lui expliquer.',
      ],
      [
        'La maison',
        'La maison du père sent le goudron et la Loire. Hélène range la lettre de Paul sous le pot de grès, sans la relire.',
      ],
    ],
  ],
  [
    'Le fleuve',
    [
      [
        'La crue',
        'La Loire monte depuis trois jours. Les mariniers attachent les gabares deux fois. Hélène charge le sel pour Angers et ne pense qu’au courant.',
      ],
      [
        'Angers',
        'À Angers, Hélène vend le sel au prix d’avant la crue. Le marchand rit de sa naïveté ; elle ne répond rien et repart avant la nuit.',
      ],
    ],
  ],
];

async function launch() {
  const app = await electron.launch({
    args: [appDir],
    env: {
      ...process.env,
      CHARPENTIER_LIBRARY: dirs.library,
      CHARPENTIER_USER_DATA: dirs.userData,
      CHARPENTIER_TEST_PLAIN_SECRETS: '1',
      CHARPENTIER_ANTHROPIC_API_KEY: apiKey,
    },
  });
  const window = await app.firstWindow();
  await window.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  const editor = window.getByRole('textbox', { name: 'Texte de la scène' });
  await editor.waitFor();
  window.on('console', (m) => m.type() === 'error' && console.log('  console:', m.text()));
  // The welcome of a first start: « Plus tard ».
  const later = window.getByRole('button', { name: /Plus tard/ });
  if (
    await later.waitFor({ timeout: 3000 }).then(
      () => true,
      () => false,
    )
  )
    await later.click();
  await editor.click();
  return { app, window, editor };
}

let shot = 0;
const snap = async (window, name) => {
  await wait(400);
  const file = path.join(out, `${String(++shot).padStart(2, '0')}-${name}.png`);
  await window.screenshot({ path: file });
  console.log('  capture', path.basename(file));
};

const command = async (window, title, text) => {
  await window.keyboard.press('ControlOrMeta+K');
  await window.keyboard.type(title);
  await wait(250);
  await window.keyboard.press('Enter');
  if (text !== undefined) {
    await wait(250);
    await window.keyboard.press('ControlOrMeta+A');
    await window.keyboard.type(text);
    await window.keyboard.press('Enter');
  }
  await wait(300);
};

/** Waits until the Compagnon has answered: the text appears, else the time runs out. */
const answered = async (window, locator, label, timeout = 180_000) => {
  const start = Date.now();
  try {
    await locator.waitFor({ timeout });
    console.log(`  ${label} : ${Math.round((Date.now() - start) / 1000)} s`);
  } catch {
    console.log(`  ${label} : rien après ${timeout / 1000} s`);
  }
};

/** Waits for « Le Compagnon réfléchit… » to come, then to go: his answer is there. */
const thinking = async (window, label, timeout = 240_000) => {
  const sign = window.getByText('Le Compagnon réfléchit…').first();
  const start = Date.now();
  await sign.waitFor({ timeout: 15_000 }).catch(() => {});
  try {
    await sign.waitFor({ state: 'hidden', timeout });
    console.log(`  ${label} : ${Math.round((Date.now() - start) / 1000)} s`);
  } catch {
    console.log(`  ${label} : toujours en cours après ${timeout / 1000} s`);
  }
  await wait(500);
};

const STEPS = {
  async book({ window, editor }) {
    // A new chapter or scene asks for its name at once: the command line is open.
    const name = async (text) => {
      await wait(300);
      await window.keyboard.press('ControlOrMeta+A');
      await window.keyboard.type(text);
      await window.keyboard.press('Enter');
      await wait(300);
    };
    await command(window, 'Renommer le projet', 'La batelière');
    for (const [c, [chapter, scenes]] of MANUSCRIPT.entries()) {
      if (c === 0) await command(window, 'Renommer le chapitre', chapter);
      else {
        await command(window, 'Nouveau chapitre');
        await name(chapter);
      }
      for (const [s, [title, text]] of scenes.entries()) {
        if (s === 0) await command(window, 'Renommer la scène', title);
        else {
          await command(window, 'Nouvelle scène');
          await name(title);
        }
        await editor.click();
        await window.keyboard.press('ControlOrMeta+End');
        await window.keyboard.type(text, { delay: 2 });
      }
    }
    await wait(800);
    await window.keyboard.press('ControlOrMeta+Shift+P');
    await snap(window, 'manuscrit');
    await window.keyboard.press('Escape');
  },

  async interview({ window }) {
    await window.keyboard.press('ControlOrMeta+0');
    const field = window.getByRole('textbox', { name: 'Parlez de votre projet…' });
    await field.waitFor();
    await field.fill(
      'Mon héroïne, Hélène, est batelière sur la Loire en 1890. Elle a peur de l’eau, ce qui est un comble pour une batelière. J’écris ce livre pour mon grand-père, qui était marinier à Nantes.',
    );
    await field.press('Enter');
    await thinking(window, 'entretien libre');
    await snap(window, 'entretien-libre');
    // A proposal validated on the page, then found validated in its sheet.
    const validate = window.getByRole('button', { name: /^Valider/ }).first();
    if (await validate.count()) {
      await validate.click();
      await snap(window, 'entretien-validee');
      await window.keyboard.press('ControlOrMeta+2');
      await snap(window, 'personnages');
    }
  },

  async guided({ window }) {
    await window.keyboard.press('ControlOrMeta+0');
    await window.keyboard.press('ControlOrMeta+Shift+M');
    await thinking(window, 'première question');
    await snap(window, 'entretien-dirige');
    const answer = window.getByRole('textbox', { name: 'Votre réponse…' });
    await answer.fill(
      'Une femme qui doit choisir entre attendre son frère et sauver la gabare de leur père avant la crue.',
    );
    await answer.press('Enter');
    await thinking(window, 'question suivante');
    await snap(window, 'entretien-dirige-suite');
  },

  async structure({ window, editor }) {
    await editor.click().catch(() => {});
    await command(window, 'Vérifier la structure');
    const card = window.getByRole('group', { name: 'Vérifier la structure' });
    await card.waitFor({ timeout: 15_000 }).catch(() => {});
    await snap(window, 'structure-cout');
    await window.getByRole('button', { name: /Lancer/ }).click();
    await answered(window, window.getByText(/Vérifiée aujourd’hui à/), 'structure', 300_000);
    await snap(window, 'structure-fin');
    const conversation = window.getByRole('tab', { name: 'Conversation' });
    if (await conversation.count()) {
      await conversation.click();
      await snap(window, 'structure-bilan');
    }
  },

  async style({ app, window }) {
    if (!book) throw new Error('--book=<fichier> manque');
    // The system's dialog answers with the book, without a window.
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, path.resolve(book));
    await window.keyboard.press('ControlOrMeta+0');
    await window.getByRole('button', { name: 'Texte de référence…' }).click();
    const card = window.getByRole('group', { name: 'Dégager les choix de style' });
    await card.waitFor({ timeout: 30_000 });
    await snap(window, 'style-cout');
    await window.getByRole('button', { name: /Lancer/ }).click();
    await answered(
      window,
      window.locator('.ch-bilan-head', { hasText: /Style · d’après/ }).first(),
      'choix de style',
      300_000,
    );
    await snap(window, 'style-propositions');
    // Two choices adopted: V validates the last proposal, twice.
    await window.getByRole('textbox', { name: 'Parlez de votre projet…' }).focus();
    await window.keyboard.press('v');
    await wait(400);
    await window.keyboard.press('v');
    await wait(600);
    await window.keyboard.press('ControlOrMeta+6');
    await snap(window, 'style-et-voix');
    // A remark that relies on them.
    await window.keyboard.press('ControlOrMeta+E');
    await command(window, 'Parler au Compagnon');
    const question = window.getByRole('textbox', { name: 'Votre question au Compagnon' });
    await question.fill('Ma scène d’Angers suit-elle les choix de style que j’ai adoptés ?');
    await question.press('Enter');
    await thinking(window, 'remarque de style');
    await snap(window, 'style-remarque');
    await window.keyboard.press('Escape');
  },

  async memory(session) {
    await session.app.close();
    const again = await launch();
    Object.assign(session, again);
    const { window, editor } = again;
    await editor.click();
    await command(window, 'Parler au Compagnon');
    const question = window.getByRole('textbox', { name: 'Votre question au Compagnon' });
    await question.fill(
      'Qu’est-ce que je vous avais dit de mon grand-père, au début de l’entretien ? Et de la peur d’Hélène ?',
    );
    await question.press('Enter');
    await thinking(window, 'mémoire');
    await snap(window, 'memoire-conversation');
    await window.keyboard.press('Escape');
    await window.keyboard.press('ControlOrMeta+7');
    await wait(600);
    await snap(window, 'carnet');
  },
};

const session = await launch();
try {
  for (const step of steps) {
    console.log(`— ${step}`);
    try {
      await STEPS[step](session);
    } catch (error) {
      console.log(`  échec : ${String(error).split('\n')[0]}`);
      await snap(session.window, `${step}-echec`).catch(() => {});
    }
  }
} finally {
  await session.app.close().catch(() => {});
}
