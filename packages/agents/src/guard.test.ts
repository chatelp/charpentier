import { describe, expect, it } from 'vitest';
import {
  changeRatio,
  isBoundedCorrection,
  isOneSentence,
  MAX_CORRECTION_LENGTH,
  MAX_CORRECTION_RATIO,
  narrativeProseIn,
  sentencesOf,
} from './guard';

const author = 'Il pleuvait sur Nantes. Hélène regardait la Loire monter, sans un mot.';

describe('guardrails: the Compagnon never writes the novel', () => {
  it('accepts a single short example sentence only', () => {
    expect(isOneSentence('La pluie collait la chemise d’Hélène à sa peau.')).toBe(true);
    expect(isOneSentence('— Tu viens ? demanda-t-elle.')).toBe(true);
    expect(isOneSentence('Il pleuvait. Elle attendait.')).toBe(false);
    expect(isOneSentence('Une phrase\nsur deux lignes.')).toBe(false);
    expect(isOneSentence('x'.repeat(300) + '.')).toBe(false);
  });

  it('spots dialogue and long quoted passages that are not the author’s', () => {
    const scene = [
      'Voici une proposition :',
      '— Je ne partirai pas, dit Hélène.',
      '> La pluie tombait toujours sur Nantes quand Hélène descendit vers le fleuve, les mains dans les poches.',
    ].join('\n');
    expect(narrativeProseIn(scene, author).map((v) => v.kind)).toEqual(['dialogue', 'quote']);
  });

  it('tells a list of questions from dialogue written with hyphens', () => {
    // From a live answer (18 November 2026): questions to the author, not lines of the novel.
    const questions = [
      'Quelques questions pour trouver votre fin :',
      '- Que signifie un sas ouvert dans votre monde ? Qu’est-ce qui risque d’entrer ?',
      '- Que risquent les serres si le sas reste ouvert pendant que la Loire monte ?',
      '- Hélène va-t-elle fermer cette porte ? Le faire ou ne pas le faire est un choix.',
    ].join('\n');
    expect(narrativeProseIn(questions, author)).toEqual([]);
    // Dialogue stays dialogue, whatever its dash, as soon as someone speaks.
    for (const line of [
      '- Je ne partirai pas, dit Hélène.',
      '- Tu viens ? demanda-t-elle.',
      '- Ferme cette porte ! s’écria Paul.',
      '- Il reviendra, murmura-t-il, avant la crue.',
      '-- Je reste.',
      '– Je reste.',
    ])
      expect(narrativeProseIn(line, author).map((v) => v.kind)).toEqual(['dialogue']);
  });

  it('lets the Compagnon quote the author’s own text and talk about the craft', () => {
    const answer = [
      'Votre phrase « Hélène regardait la Loire monter, sans un mot » installe bien le silence.',
      'Que veut Hélène, à ce moment-là ? Si vous le savez, montrez-le par un geste.',
      '> Il pleuvait sur Nantes.',
    ].join('\n');
    expect(narrativeProseIn(answer, author)).toEqual([]);
  });

  it('splits French sentences', () => {
    expect(sentencesOf('Il pleut. Vraiment ? Oui… « Partons. » Bon')).toHaveLength(5);
  });

  it('bounds corrections', () => {
    expect(changeRatio('Il pleuvai', 'Il pleuvait')).toBeLessThan(0.2);
    expect(changeRatio('Il pleuvait', 'La pluie tombait dru')).toBeGreaterThan(0.5);
  });
});

describe('a language correction stays a correction (D-11)', () => {
  it('lets through what fixes the passage', () => {
    expect(isBoundedCorrection('Il pleuvai sur Nantes', 'Il pleuvait sur Nantes')).toBe(true);
    expect(isBoundedCorrection('les serre était fermé', 'les serres étaient fermées')).toBe(true);
    expect(isBoundedCorrection('Il pleuvai sur Nantes', 'Il pleuvait sur Nantes.')).toBe(true);
    expect(isBoundedCorrection('Il sortit. elle resta', 'Il sortit. Elle resta')).toBe(true);
  });

  it('refuses a long passage with an invented sentence appended, though the ratio allows it', () => {
    const quote = 'Le vent tournait au-dessus des serres et la pluie battait les vitres. '
      .repeat(7)
      .trim();
    const correction = `${quote} Marc sortit alors un couteau de sa poche.`;
    expect([...quote].length).toBeGreaterThan(400);
    expect(changeRatio(quote, correction)).toBeLessThanOrEqual(MAX_CORRECTION_RATIO);
    expect(isBoundedCorrection(quote, correction)).toBe(false);
  });

  it('caps the passage and the correction, whatever they say', () => {
    const long = `${'a'.repeat(MAX_CORRECTION_LENGTH)}b`;
    expect(isBoundedCorrection(long, long)).toBe(false);
    expect(isBoundedCorrection(long.slice(1), long.slice(1))).toBe(true);
  });

  it('refuses a sentence more than the passage has', () => {
    // Within the ratio and the length: only the count of sentences catches these.
    const quote = 'Hélène ouvrit la porte du bureau et regarda longuement la pluie';
    expect(isBoundedCorrection(quote, `${quote}. Elle pleura.`)).toBe(false);
    expect(isBoundedCorrection(quote, `${quote}. elle pleura`)).toBe(false); // no capital
    expect(isBoundedCorrection(quote, `${quote} ! Enfin…`)).toBe(false);
    expect(isBoundedCorrection(`${quote}.`, `${quote}. Elle rit.`)).toBe(false);
  });

  it('refuses a new line or a new paragraph', () => {
    expect(isBoundedCorrection('Il pleuvai sur Nantes', 'Il pleuvait\nsur Nantes')).toBe(false);
    expect(isBoundedCorrection('Il pleuvai sur Nantes', 'Il pleuvait sur Nantes\n\n')).toBe(false);
    expect(isBoundedCorrection('Il pleuvai sur Nantes', 'Il pleuvait\u2029sur Nantes')).toBe(false);
  });

  it('refuses words added beyond a few characters, a rewriting, and nothing at all', () => {
    const quote =
      'Le vent tournait au-dessus des serres et la pluie battait les vitres du grand hall';
    expect(isBoundedCorrection(quote, `${quote} tandis que Marc affûtait son couteau`)).toBe(false);
    expect(isBoundedCorrection('Il pleuvait', 'La pluie tombait dru')).toBe(false);
    expect(isBoundedCorrection('Il pleuvait', '   ')).toBe(false);
    expect(isBoundedCorrection('', 'Il pleuvait')).toBe(false);
  });
});
