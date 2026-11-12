import { describe, expect, it } from 'vitest';
import { doc, p, quote, sceneBreak } from '../testing/builders';
import { parseSceneMarkdown } from './parse';
import { serializeSceneMarkdown } from './serialize';

const NBSP = ' ';
const NNBSP = ' ';

function expectRoundTrip(d: ReturnType<typeof doc>) {
  const markdown = serializeSceneMarkdown(d);
  const back = parseSceneMarkdown(markdown);
  expect(back.toJSON(), markdown).toEqual(d.toJSON());
  return markdown;
}

describe('scene Markdown: readable canonical output', () => {
  it('writes French dialogue as plain, readable Markdown', () => {
    const scene = doc(
      p(`— Tu viens${NNBSP}? demanda-t-elle.`),
      p(`— Non${NBSP}: je reste ici, avec l’`, { italic: 'Odyssée' }, '.'),
      p(`Il murmura${NBSP}: «${NBSP}Jamais${NBSP}».`),
      sceneBreak(),
      quote(p('Chère Anna,'), p('Je t’écris de Brest.', 'BR', 'Paul')),
    );
    const markdown = expectRoundTrip(scene);
    expect(markdown).toBe(
      [
        `— Tu viens${NNBSP}? demanda-t-elle.`,
        '',
        `— Non${NBSP}: je reste ici, avec l’*Odyssée*.`,
        '',
        `Il murmura${NBSP}: «${NBSP}Jamais${NBSP}».`,
        '',
        '* * *',
        '',
        '> Chère Anna,',
        '>',
        '> Je t’écris de Brest.\\',
        '> Paul',
        '',
      ].join('\n'),
    );
  });

  it('writes an empty scene as an empty file', () => {
    expect(serializeSceneMarkdown(doc(p()))).toBe('');
    expect(parseSceneMarkdown('').toJSON()).toEqual(doc(p()).toJSON());
  });
});

describe('scene Markdown: lossless round trip of tricky text', () => {
  const cases: Record<string, ReturnType<typeof doc>> = {
    'non-breaking spaces at paragraph edges': doc(p(`${NBSP}«${NBSP}Oui${NBSP}»${NNBSP}`)),
    'regular spaces and tabs at paragraph edges': doc(p('   indenté\t ')),
    'Markdown syntax typed as text': doc(
      p('*pas italique* _ni ça_ `code` [lien](x) <b> & ~~barré~~ \\'),
    ),
    'line-start block markers': doc(
      p('# pas un titre'),
      p('- pas une liste'),
      p('+ non plus'),
      p('12. ni numérotée'),
      p('> pas une citation'),
      p('==='),
      p('* * *'),
    ),
    'block markers after a line break': doc(p('a', 'BR', '- b', 'BR', '3) c', 'BR', '> d')),
    'italic right after a letter, before punctuation': doc(p('a', { italic: '.b' }, 'c')),
    'italic with spaces at its edges': doc(p('un', { italic: ' mot ' }, 'ici')),
    'italic spanning a line break': doc(
      p({ italic: 'vers un' }, { italicBreak: true }, { italic: 'vers deux' }),
    ),
    'line breaks at paragraph edges': doc(p('BR', 'milieu', 'BR', 'BR')),
    'empty paragraphs between text': doc(p('avant'), p(), p(), p('après')),
    'empty paragraph inside a quote': doc(quote(p(), p('x'))),
    'consecutive quotes stay separate': doc(quote(p('un')), quote(p('deux'))),
    'only a scene break': doc(sceneBreak()),
    'HTML-looking text': doc(p('<em>non</em> <!-- --> <br>')),
    'character references typed as text': doc(p('&amp; &#160; &nbsp;')),
    'emoji and astral characters': doc(p('🙂 𝔄 ⁂')),
  };

  for (const [name, scene] of Object.entries(cases)) {
    it(name, () => {
      expectRoundTrip(scene);
    });
  }
});

describe('scene Markdown: control characters', () => {
  it('turns stray line breaks into spaces and drops other control characters', () => {
    const markdown = serializeSceneMarkdown(doc(p('a\nb\r\nc\u0007d\te')));
    expect(parseSceneMarkdown(markdown).toJSON()).toEqual(doc(p('a b cd\te')).toJSON());
  });
});

describe('scene Markdown: lenient parsing of files edited outside the app', () => {
  it('keeps headings, lists and code as text', () => {
    const scene = parseSceneMarkdown('# Titre\n\n- un\n- deux\n\n    code\n');
    expect(scene.toJSON()).toEqual(doc(p('# Titre'), p('- un - deux'), p('code')).toJSON());
  });

  it('drops bold markers but keeps the words', () => {
    expect(parseSceneMarkdown('Un **mot** fort.').toJSON()).toEqual(
      doc(p('Un mot fort.')).toJSON(),
    );
  });

  it('reads both italic syntaxes', () => {
    expect(
      parseSceneMarkdown('Un *mot* et un _autre_ et <i>un</i> <em>dernier</em>.').toJSON(),
    ).toEqual(
      doc(
        p(
          'Un ',
          { italic: 'mot' },
          ' et un ',
          { italic: 'autre' },
          ' et ',
          { italic: 'un' },
          ' ',
          { italic: 'dernier' },
          '.',
        ),
      ).toJSON(),
    );
  });

  it('joins wrapped lines with a space', () => {
    expect(parseSceneMarkdown('Une phrase\ncoupée en deux.').toJSON()).toEqual(
      doc(p('Une phrase coupée en deux.')).toJSON(),
    );
  });

  it('reads ***, --- and ___ as scene breaks', () => {
    expect(parseSceneMarkdown('a\n\n***\n\nb\n\n---\n\nc\n\n___\n').toJSON()).toEqual(
      doc(p('a'), sceneBreak(), p('b'), sceneBreak(), p('c'), sceneBreak()).toJSON(),
    );
  });

  it('flattens nested quotes and splits a quote around a scene break', () => {
    expect(parseSceneMarkdown('> a\n> > b\n> ***\n> c\n').toJSON()).toEqual(
      doc(quote(p('a'), p('b')), sceneBreak(), quote(p('c'))).toJSON(),
    );
  });

  it('accepts Windows line endings', () => {
    expect(parseSceneMarkdown('un\r\n\r\ndeux\r\n').toJSON()).toEqual(
      doc(p('un'), p('deux')).toJSON(),
    );
  });
});
