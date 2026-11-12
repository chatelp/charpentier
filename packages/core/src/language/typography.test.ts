import { describe, expect, it } from 'vitest';
import { applyTypography, NBSP, NNBSP, typographyIssues } from './typography';
import { wordsOf } from './words';

describe('French typography', () => {
  it('puts the right no-break spaces before high punctuation and inside guillemets', () => {
    expect(applyTypography('Vous venez? Oui ! Non;')).toBe(
      `Vous venez${NNBSP}? Oui${NNBSP}! Non${NNBSP};`,
    );
    expect(applyTypography('Il dit: « Partons »')).toBe(`Il dit${NBSP}: «${NBSP}Partons${NBSP}»`);
    expect(applyTypography('Il est 10:30.')).toBe('Il est 10:30.');
  });

  it('turns straight quotes, apostrophes, dashes and dots into French typography', () => {
    expect(applyTypography('- Il a dit "non" à l\'enquêtrice...')).toBe(
      `—${NBSP}Il a dit «${NBSP}non${NBSP}» à l’enquêtrice…`,
    );
  });

  it('leaves correct text alone', () => {
    const correct = `—${NBSP}Vous venez${NNBSP}? demanda-t-elle à l’enquêtrice. «${NBSP}Oui${NBSP}», dit-il${NBSP}: rien…`;
    expect(typographyIssues(correct)).toEqual([]);
  });

  it('reports each issue with the stretch to replace', () => {
    expect(typographyIssues('Vous venez ?')).toEqual([
      {
        from: 10,
        to: 12,
        kind: 'typography',
        rule: 'space-before-high-punctuation',
        replacement: `${NNBSP}?`,
      },
    ]);
  });
});

describe('words for the spellchecker', () => {
  it('splits elisions off and keeps hyphenated words', () => {
    expect(wordsOf('Qu’il regarde l’Odyssée, demanda-t-elle à 10 h.').map((t) => t.word)).toEqual([
      'il',
      'regarde',
      'Odyssée',
      'demanda-t-elle',
    ]);
    const [, , odyssee] = wordsOf('Qu’il regarde l’Odyssée');
    expect(odyssee).toEqual({ from: 16, to: 23, word: 'Odyssée' });
  });
});
