import * as Y from 'yjs';
import { variantFragment } from './scene-content';
import type { RelativePositionJson, TextAnchor } from './signals';

/** A run of plain text inside a block, and where it lives in the Yjs tree. */
interface TextRun {
  readonly text: Y.XmlText;
  /** Offset of the run in its block's plain text. */
  readonly offset: number;
  readonly length: number;
}

interface Block {
  readonly plain: string;
  readonly runs: readonly TextRun[];
}

function plainOf(text: Y.XmlText): string {
  return (text.toDelta() as { insert: unknown }[])
    .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
    .join('');
}

/** Textblocks of a variant (paragraphs, including those inside quotes), with their text runs. */
function blocksOf(fragment: Y.XmlFragment): Block[] {
  const blocks: Block[] = [];
  const visit = (element: Y.XmlElement) => {
    if (element.nodeName === 'blockquote') {
      for (const child of element.toArray()) if (child instanceof Y.XmlElement) visit(child);
      return;
    }
    if (element.nodeName !== 'paragraph') return;
    let plain = '';
    const runs: TextRun[] = [];
    for (const child of element.toArray()) {
      if (child instanceof Y.XmlText) {
        const value = plainOf(child);
        runs.push({ text: child, offset: plain.length, length: value.length });
        plain += value;
      } else {
        plain += '\n'; // hard break
      }
    }
    blocks.push({ plain, runs });
  };
  for (const child of fragment.toArray()) if (child instanceof Y.XmlElement) visit(child);
  return blocks;
}

/** Same comparison text for quotes coming from a model: apostrophes, spaces. */
const normalize = (s: string) => s.replace(/[’']/g, "'").replace(/[\s\u00A0\u202F]+/g, ' ');

function relativeAt(block: Block, offset: number, assoc: number): RelativePositionJson | undefined {
  // The run holding the offset (the end of the previous run for a boundary).
  const run =
    block.runs.find((r) => offset >= r.offset && offset < r.offset + r.length) ??
    block.runs.find((r) => offset === r.offset + r.length);
  if (!run) return undefined;
  return Y.relativePositionToJSON(
    Y.createRelativePositionFromTypeIndex(run.text, offset - run.offset, assoc),
  ) as RelativePositionJson;
}

/**
 * Anchors a passage quoted from a scene (agents quote, they never give
 * offsets). The quote must lie within one paragraph; the first occurrence is
 * used. Undefined when the passage is not in the text (any more).
 */
export function anchorForQuote(
  sceneDoc: Y.Doc,
  sceneId: string,
  variantId: string,
  quote: string,
): TextAnchor | undefined {
  const wanted = normalize(quote).trim();
  if (!wanted) return undefined;
  for (const block of blocksOf(variantFragment(sceneDoc, variantId))) {
    const at = normalize(block.plain).indexOf(wanted);
    if (at < 0) continue;
    // normalize() keeps lengths except for runs of spaces: map back by re-scanning.
    const from = mapNormalizedOffset(block.plain, at);
    const to = mapNormalizedOffset(block.plain, at + wanted.length);
    const start = relativeAt(block, from, 0);
    const end = relativeAt(block, to, -1);
    if (start && end) return { sceneId, variantId, start, end };
  }
  return undefined;
}

/** Offset in `text` of the character at `offset` in `normalize(text)`. */
function mapNormalizedOffset(text: string, offset: number): number {
  let n = 0;
  let i = 0;
  while (i < text.length && n < offset) {
    if (/[\s\u00A0\u202F]/.test(text[i] ?? '')) {
      while (i < text.length && /[\s\u00A0\u202F]/.test(text[i] ?? '')) i++;
    } else i++;
    n++;
  }
  return i;
}

/** The plain text an anchor covers now, or undefined if it was deleted. */
export function anchoredText(sceneDoc: Y.Doc, anchor: TextAnchor): string | undefined {
  const start = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON(anchor.start),
    sceneDoc,
  );
  const end = Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON(anchor.end),
    sceneDoc,
  );
  if (!start || !end || start.type !== end.type || !(start.type instanceof Y.XmlText))
    return undefined;
  const plain = plainOf(start.type);
  return end.index > start.index ? plain.slice(start.index, end.index) : undefined;
}
