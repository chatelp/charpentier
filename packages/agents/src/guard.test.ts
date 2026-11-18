import { describe, expect, it } from 'vitest';
import { changeRatio, isOneSentence, narrativeProseIn, sentencesOf } from './guard';

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
