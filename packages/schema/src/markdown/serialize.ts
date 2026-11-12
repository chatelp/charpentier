import type { Node } from 'prosemirror-model';
import { sceneSchema } from '../prosemirror/scene-schema';
import { sanitizeSceneText } from '../prosemirror/scene-text';
import { parseSceneMarkdown } from './parse';

/**
 * Serializes a scene into canonical Markdown (docs/SPEC.md §17).
 *
 * Guarantee, enforced by property-based tests: for every scene document `d`
 * whose text is sanitized (see `sanitizeSceneText`),
 * `parseSceneMarkdown(serializeSceneMarkdown(d))` is equal to `d`.
 * Unsanitized text is sanitized on the way out.
 * The output stays readable in any Markdown viewer: one line per paragraph,
 * `*italic*`, `> ` quotes, `* * *` for scene breaks.
 *
 * Encodings used only where plain Markdown cannot express the text:
 * - whitespace at the edge of a line becomes a numeric character reference
 *   (`&#xA0;`), because Markdown trims it;
 * - italics CommonMark delimiters cannot open or close (e.g. right after a
 *   letter and before punctuation) fall back to `<em>…</em>`;
 * - a line break at the very end of a paragraph becomes `<br>`;
 * - an empty paragraph is written `<!-- -->`.
 */
export function serializeSceneMarkdown(doc: Node): string {
  const only = doc.childCount === 1 ? doc.firstChild : null;
  if (only?.type === sceneSchema.nodes.paragraph && only.childCount === 0) return '';

  const blocks: string[] = [];
  doc.forEach((block) => {
    switch (block.type) {
      case sceneSchema.nodes.paragraph:
        blocks.push(serializeParagraph(block));
        break;
      case sceneSchema.nodes.blockquote: {
        const paragraphs: string[] = [];
        block.forEach((p) => paragraphs.push(quote(serializeParagraph(p))));
        blocks.push(paragraphs.join('\n>\n'));
        break;
      }
      case sceneSchema.nodes.sceneBreak:
        blocks.push('* * *');
        break;
      default:
        throw new Error(`Unexpected block in scene: ${block.type.name}`);
    }
  });
  return blocks.join('\n\n') + '\n';
}

const quote = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

// ─── Paragraphs ──────────────────────────────────────────────────────────

type Strategy = { italic: 'delimiters' | 'html'; lineBreak: 'backslash' | 'html' };

/** From the most readable to the most explicit. */
const STRATEGIES: readonly Strategy[] = [
  { italic: 'delimiters', lineBreak: 'backslash' },
  { italic: 'html', lineBreak: 'backslash' },
  { italic: 'html', lineBreak: 'html' },
];

function serializeParagraph(original: Node): string {
  const paragraph = sanitizeParagraph(original);
  if (paragraph.childCount === 0) return '<!-- -->';
  const atoms = toAtoms(paragraph);
  for (const strategy of STRATEGIES) {
    const markdown = renderAtoms(atoms, strategy);
    if (readsBackAs(markdown, paragraph)) return markdown;
  }
  throw new Error(`Cannot serialize paragraph losslessly: ${JSON.stringify(paragraph.toJSON())}`);
}

function sanitizeParagraph(paragraph: Node): Node {
  const content: Node[] = [];
  paragraph.forEach((child) => {
    if (child.text === undefined) content.push(child);
    else {
      const text = sanitizeSceneText(child.text);
      if (text) content.push(sceneSchema.text(text, child.marks));
    }
  });
  return paragraph.type.create(paragraph.attrs, content);
}

function readsBackAs(markdown: string, paragraph: Node): boolean {
  const doc = parseSceneMarkdown(markdown);
  return doc.childCount === 1 && doc.firstChild?.eq(paragraph) === true;
}

/** One code point, or a line break, with its italic flag. */
type Atom = { kind: 'char'; char: string; italic: boolean } | { kind: 'break'; italic: boolean };

function toAtoms(paragraph: Node): Atom[] {
  const atoms: Atom[] = [];
  paragraph.forEach((child) => {
    const italic = sceneSchema.marks.italic.isInSet(child.marks) !== undefined;
    if (child.text !== undefined) {
      for (const char of child.text) atoms.push({ kind: 'char', char, italic });
    } else if (child.type === sceneSchema.nodes.hardBreak) {
      atoms.push({ kind: 'break', italic });
    }
  });
  return atoms;
}

function renderAtoms(atoms: readonly Atom[], strategy: Strategy): string {
  const encode = whereToEncode(atoms);
  let out = '';
  let inItalic = false;
  let lineStart = true; // only encoded whitespace seen so far on this line

  atoms.forEach((atom, i) => {
    if (atom.italic !== inItalic) {
      out += strategy.italic === 'delimiters' ? '*' : atom.italic ? '<em>' : '</em>';
      inItalic = atom.italic;
    }
    if (atom.kind === 'break') {
      const isLast = atoms.slice(i + 1).every((a) => a.kind === 'break');
      out += strategy.lineBreak === 'html' || isLast ? '<br>' : '\\\n';
      lineStart = true;
      return;
    }
    if (encode[i]) {
      out += charRef(atom.char);
      return; // encoded whitespace keeps lineStart as is
    }
    out += escapeChar(atom.char, lineStart, atoms, i);
    lineStart = false;
  });
  if (inItalic) out += strategy.italic === 'delimiters' ? '*' : '</em>';
  return out;
}

/**
 * Marks the characters that must become character references: whitespace at
 * the start or end of each line (Markdown strips it).
 */
function whereToEncode(atoms: readonly Atom[]): boolean[] {
  const encode = atoms.map(() => false);
  const isWhitespace = (a: Atom | undefined) => a?.kind === 'char' && /\s/u.test(a.char);

  let lineFrom = 0;
  for (let i = 0; i <= atoms.length; i++) {
    if (i < atoms.length && atoms[i]?.kind !== 'break') continue;
    // Line is atoms[lineFrom .. i).
    for (let j = lineFrom; j < i && isWhitespace(atoms[j]); j++) encode[j] = true;
    for (let j = i - 1; j >= lineFrom && isWhitespace(atoms[j]); j--) encode[j] = true;
    lineFrom = i + 1;
  }
  return encode;
}

const charRef = (char: string) => `&#x${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()};`;

/** Always escaped: they mean something inline, here or in common Markdown flavours. */
const ALWAYS = new Set(['\\', '*', '_', '`', '[', ']', '<', '&', '~']);
/** Escaped at the start of a line, where they would open a block. */
const LINE_START = new Set(['>', '#', '-', '+', '=']);

function escapeChar(
  char: string,
  lineStart: boolean,
  atoms: readonly Atom[],
  index: number,
): string {
  if (ALWAYS.has(char) || (lineStart && LINE_START.has(char))) return `\\${char}`;
  if ((char === '.' || char === ')') && followsLineStartDigits(atoms, index)) return `\\${char}`;
  return char;
}

/** True for the `.` in `12. ` at the start of a line (ordered list marker). */
function followsLineStartDigits(atoms: readonly Atom[], index: number): boolean {
  let j = index - 1;
  let digits = 0;
  while (j >= 0) {
    const atom = atoms[j];
    if (atom?.kind !== 'char' || !/[0-9]/.test(atom.char)) break;
    digits++;
    j--;
  }
  if (digits === 0) return false;
  while (j >= 0) {
    const atom = atoms[j];
    if (!atom || atom.kind === 'break') return true;
    if (!/\s/u.test(atom.char)) return false;
    j--;
  }
  return true;
}
