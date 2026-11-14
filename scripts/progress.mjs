// Reads docs/PLAN.md and writes the progress of the plan as JSON
// ({rows, meta}) for the « Avancement de Charpentier » dashboard.
// Usage: node scripts/progress.mjs [output.json]   (stdout without an argument)
//
// A phase is done when its section has a « Réalisé » line, or when its step
// is among those the « Statut » line says are done (« étapes 1 à 3 réalisées »).
// The first phase not done, in the plan's order, is the next one (a step
// marked « (ensuite) » excepted).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const plan = readFileSync(`${root}docs/PLAN.md`, 'utf8');
const lines = plan.split('\n');

const status = lines.find((l) => l.startsWith('Statut'));
const doneUpTo = Number(/étapes 1 à (\d+) réalisées/.exec(status ?? '')?.[1] ?? 0);

const rows = [];
let step = null;
let phase = null;
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const clean = (text) =>
  text
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s*\[D-[\d, D-]+\]/g, '')
    .trim();

for (const line of lines) {
  const stepMatch = /^## Étape (\w+)(?: \(([^)]*)\))? : (.+)$/.exec(line);
  if (stepMatch) {
    step = { id: stepMatch[1], title: capital(clean(stepMatch[3])), later: stepMatch[2] ?? '' };
    phase = null;
    // A step without phases (4b) is one row.
    rows.push({
      step: step.id,
      stepTitle: step.title,
      phase: step.id,
      title: step.title,
      milestone: false,
      done: false,
      realised: '',
      check: '',
      placeholder: true,
      later: Boolean(step.later),
    });
    continue;
  }
  const phaseMatch = /^### (\d+\.\d+(?: bis| ter)?) (.+)$/.exec(line);
  if (phaseMatch && step) {
    // The step has phases: drop its placeholder row.
    const placeholder = rows.findIndex((r) => r.step === step.id && r.placeholder);
    if (placeholder >= 0) rows.splice(placeholder, 1);
    phase = {
      step: step.id,
      stepTitle: step.title,
      phase: phaseMatch[1],
      title: clean(phaseMatch[2]),
      milestone: false,
      done: Number.parseInt(step.id, 10) <= doneUpTo && /^\d+$/.test(step.id),
      realised: '',
      check: '',
      later: Boolean(step.later),
    };
    rows.push(phase);
    continue;
  }
  if (!phase) continue;
  if (/^\*\*Vérifiable/.test(line)) {
    phase.check = clean(line.replace(/^\*\*Vérifiable[^*]*\*\*\s*:\s*/, ''));
    if (/Jalon/.test(line)) phase.milestone = true;
  } else if (/^Réalisé/.test(line)) {
    phase.done = true;
    phase.realised = clean(line.replace(/^Réalisé[^:]*:?\s*/, ''));
  }
}

let next = false;
const out = rows.map((r, order) => {
  // A step marked « (ensuite) » waits its turn: it is never the next one.
  const state = r.done ? 'fait' : next || r.later ? 'à venir' : ((next = true), 'prochaine');
  return {
    order: order + 1,
    step: r.step,
    stepTitle: r.stepTitle,
    phase: r.phase,
    title: r.title,
    state,
    milestone: r.milestone,
    check: r.check,
    realised: r.realised,
  };
});

const commit = (() => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%h %cs', '--', 'docs/PLAN.md'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'inconnu';
  }
})();

const result = {
  rows: out,
  meta: [
    {
      label: 'progress.mjs',
      value: readFileSync(fileURLToPath(import.meta.url), 'utf8'),
      type: 'code',
      lang: 'javascript',
    },
    { label: 'Entrée', value: `docs/PLAN.md (dernier commit ${commit})` },
    { label: 'Statut du plan', value: status ?? '' },
  ],
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
