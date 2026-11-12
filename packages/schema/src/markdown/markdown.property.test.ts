import fc from 'fast-check';
import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { sceneSchema } from '../prosemirror/scene-schema';
import { isSanitizedSceneText, sanitizeSceneText } from '../prosemirror/scene-text';
import { parseSceneMarkdown } from './parse';
import { serializeSceneMarkdown } from './serialize';

const { nodes, marks } = sceneSchema;
const italic = marks.italic.create();

/** Characters and snippets that stress Markdown: syntax, whitespace, French typography. */
const tricky = [
  ...'*_`[]<>&~\\#-+=.)!|(:0123456789',
  ' ',
  '  ',
  '\t',
  ' ',
  ' ',
  ' ',
  '　',
  '«',
  '»',
  '—',
  '–',
  '…',
  '’',
  "'",
  '"',
  '⁂',
  'é',
  'É',
  'œ',
  'ç',
  '🙂',
  '𝔄',
  '́',
  '* * *',
  '***',
  '---',
  '> ',
  '# ',
  '- ',
  '1. ',
  '2) ',
  '<em>',
  '</em>',
  '<br>',
  '<!-- -->',
  '&amp;',
  '&#160;',
  '&nbsp;',
  '\\\n',
  'http://x.fr',
  '\n',
  '\r\n',
];

const textArb = fc
  .oneof(
    fc.string({ unit: fc.constantFrom(...tricky), minLength: 1, maxLength: 10 }),
    fc.string({ unit: 'grapheme', minLength: 1, maxLength: 10 }),
    fc.string({ unit: fc.constantFrom(...'abcdefghij ,.'), minLength: 1, maxLength: 20 }),
  )
  .map(sanitizeSceneText)
  .filter((s) => s.length > 0);

const inlineArb: fc.Arbitrary<Node> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc
      .tuple(textArb, fc.boolean())
      .map(([text, it]) => sceneSchema.text(text, it ? [italic] : [])),
  },
  {
    weight: 1,
    arbitrary: fc.boolean().map((it) => nodes.hardBreak.create(null, null, it ? [italic] : [])),
  },
);

const paragraphArb = fc
  .array(inlineArb, { maxLength: 8 })
  .map((content) => nodes.paragraph.create(null, content));

const blockArb: fc.Arbitrary<Node> = fc.oneof(
  { weight: 6, arbitrary: paragraphArb },
  {
    weight: 2,
    arbitrary: fc
      .array(paragraphArb, { minLength: 1, maxLength: 3 })
      .map((ps) => nodes.blockquote.create(null, ps)),
  },
  { weight: 1, arbitrary: fc.constant(nodes.sceneBreak.create()) },
);

const docArb = fc
  .array(blockArb, { minLength: 1, maxLength: 6 })
  .map((blocks) => nodes.doc.create(null, blocks));

const markdownArb = fc.oneof(
  fc.string({ unit: fc.constantFrom(...tricky, 'mot', ' ', '\n', '\n\n', 'a'), maxLength: 40 }),
  fc.string({ unit: 'grapheme', maxLength: 60 }),
);

function allTextSanitized(doc: Node): boolean {
  let ok = true;
  doc.descendants((n) => {
    if (n.text !== undefined && !isSanitizedSceneText(n.text)) ok = false;
  });
  return ok;
}

describe('scene Markdown properties', () => {
  it('CRDT → Markdown → CRDT is lossless for every scene', () => {
    fc.assert(
      fc.property(docArb, (doc) => {
        const markdown = serializeSceneMarkdown(doc);
        expect(parseSceneMarkdown(markdown).toJSON(), JSON.stringify(markdown)).toEqual(
          doc.toJSON(),
        );
      }),
      { numRuns: 3000 },
    );
  });

  it('any Markdown file parses to a valid scene whose serialization is a fixed point', () => {
    fc.assert(
      fc.property(markdownArb, (markdown) => {
        const scene = parseSceneMarkdown(markdown);
        scene.check(); // valid against the schema
        expect(allTextSanitized(scene)).toBe(true);
        const canonical = serializeSceneMarkdown(scene);
        const reread = parseSceneMarkdown(canonical);
        expect(reread.toJSON(), JSON.stringify(canonical)).toEqual(scene.toJSON());
        expect(serializeSceneMarkdown(reread)).toBe(canonical);
      }),
      { numRuns: 3000 },
    );
  });
});
