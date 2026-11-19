import { describe, expect, it } from 'vitest';
import { narrativeProseIn } from './guard';
import {
  CORPUS_AUTHOR,
  CORPUS_SHEETS,
  HELD_OUT_MENTORS,
  HELD_OUT_NOVEL,
  MENTORS,
  WRITES_THE_NOVEL,
} from './guard.corpus';

const author = `${CORPUS_AUTHOR}\n${CORPUS_SHEETS}`;
const refused = (answer: string) => narrativeProseIn(answer, author).length > 0;

/** Named lists, so that a regression says which answer it lost. */
function measure(positives: readonly string[], negatives: readonly string[]) {
  const missed = positives.filter((answer) => !refused(answer));
  const wronged = negatives.filter(refused);
  const caught = positives.length - missed.length;
  return {
    missed,
    wronged,
    recall: caught / positives.length,
    precision: caught / (caught + wronged.length),
  };
}

describe('the detector on its corpus', () => {
  it('is large enough to mean something', () => {
    expect(WRITES_THE_NOVEL.length).toBeGreaterThanOrEqual(40);
    expect(MENTORS.length).toBeGreaterThanOrEqual(40);
  });

  it('refuses the answers that write the novel, and no mentor’s answer (the set the rules were adjusted on)', () => {
    expect(measure(WRITES_THE_NOVEL, MENTORS)).toEqual({
      missed: [],
      wronged: [],
      recall: 1,
      precision: 1,
    });
  });

  it('holds on answers it was never adjusted on', () => {
    const held = measure(HELD_OUT_NOVEL, HELD_OUT_MENTORS);
    // Known limit: a short passage told in the present, with no announcement the rules know,
    // reads like a summary of the story. Kept as measured, not adjusted for.
    expect(held.missed).toEqual([
      'Voici comment je l’écrirais.\n\nAnna s’assoit au bord du lit. Elle regarde ses mains, puis la valise ouverte. Rien n’y manque, sauf l’envie de partir.',
    ]);
    expect(held.wronged).toEqual([]);
    expect(held.recall).toBeCloseTo(14 / 15);
    expect(held.precision).toBe(1);
  });
});
