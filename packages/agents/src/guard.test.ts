import { describe, expect, it } from 'vitest';
import {
  changeRatio,
  cutMarked,
  isBoundedCorrection,
  isOneSentence,
  MAX_CORRECTION_LENGTH,
  MAX_CORRECTION_RATIO,
  narrativeProseIn,
  narrativeSentencesIn,
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
    expect(narrativeProseIn(scene, author).map((v) => v.kind)).toEqual([
      'dialogue',
      'quote',
      'narration',
    ]);
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

  it('spots plain narration, with no dash and no quotation mark', () => {
    const kinds = (answer: string) => narrativeProseIn(answer, author).map((v) => v.kind);
    expect(
      kinds(
        'Voici la scène que vous demandez :\n\nHélène descendit vers le fleuve. La pluie tombait toujours.\n\nElle s’arrêta devant la barque et posa la main sur le bois.',
      ),
    ).toEqual(['narration']);
    // One sentence is not a passage, unless it is announced as one.
    expect(kinds('Hélène descendit vers le fleuve.')).toEqual([]);
    expect(kinds('Voici le début :\n\nHélène descendit vers le fleuve.')).toEqual(['narration']);
    // The first person, and English.
    expect(kinds('Je poussai la porte. La pièce était vide.')).toEqual(['narration']);
    expect(kinds('She walked to the river. Paul waited on the bridge.')).toEqual(['narration']);
    // The author's own sentences, repeated, are theirs.
    expect(kinds('Il pleuvait sur Nantes. Hélène regardait la Loire monter, sans un mot.')).toEqual(
      [],
    );
    // What the Compagnon says of the book in the past is not the book.
    expect(
      kinds(
        'Dans la version précédente, Hélène partait à la fin. Maintenant elle reste : qu’y gagnez-vous ?',
      ),
    ).toEqual([]);
    expect(narrativeSentencesIn('Bien vu. Hélène serra la rambarde.', author)).toEqual([
      'Hélène serra la rambarde.',
    ]);
  });

  it('spots short dialogue, whatever its marks', () => {
    for (const line of [
      '« Je reste », dit Hélène.',
      '« Tu viens ? » demanda-t-elle.',
      '— je reste, dit-elle.',
      '"I’m not leaving," she said.',
      '— Vous ne partirez pas.',
    ])
      expect(narrativeProseIn(line, author).map((v) => v.kind)).toEqual(['dialogue']);
    // The author's own line, quoted with its tag.
    expect(narrativeProseIn('« Je reste », dit Hélène.', '— Je reste, dit Hélène.')).toEqual([]);
  });

  it('spots a long invented sentence between quotation marks', () => {
    const invented = `« ${'Hélène descendit vers le fleuve sans se presser, '.repeat(5)}et se tut. »`;
    expect(invented.length).toBeGreaterThan(250);
    expect(narrativeProseIn(`Essayez : ${invented}`, author).map((v) => v.kind)).toEqual(['quote']);
  });

  it('takes a list for a list, whatever its dash', () => {
    const list = [
      'Trois pistes :',
      '– Que risque Hélène si elle reste ?',
      '– Le désir d’Hélène : il n’apparaît qu’à la fin.',
      '– Resserrer l’ouverture.',
      '– Son père veut qu’elle parte.',
    ].join('\n');
    expect(narrativeProseIn(list, author)).toEqual([]);
  });

  it('lets a note tell a backstory, never a dialogue', () => {
    const backstory = 'Hélène était batelière. Son père mourut pendant la crue de 1910.';
    expect(narrativeProseIn(backstory, '').map((v) => v.kind)).toEqual(['narration']);
    expect(narrativeProseIn(backstory, '', { notes: true })).toEqual([]);
    expect(
      narrativeProseIn('— Je reste, dit Hélène.', '', { notes: true }).map((v) => v.kind),
    ).toEqual(['dialogue']);
  });

  it('never cuts in silence', () => {
    expect(cutMarked('Un point. Deux points.', 100)).toBe('Un point. Deux points.');
    const cut = cutMarked(
      'Le départ tient bien. La lettre disparaît après la crue. Est-ce voulu ?',
      70,
    );
    expect(cut).toBe('Le départ tient bien. La lettre disparaît après la crue. […]');
    expect(cutMarked('x'.repeat(100), 20)).toBe(`${'x'.repeat(16)} […]`);
    expect(cutMarked('x'.repeat(100), 20)).toHaveLength(20);
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
