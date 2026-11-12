import type { Token } from 'markdown-it';
import type { Mark, Node } from 'prosemirror-model';
import { sceneSchema } from '../prosemirror/scene-schema';
import { sanitizeSceneText } from '../prosemirror/scene-text';
import { createSceneMarkdownIt } from './markdown-it';

const md = createSceneMarkdownIt();
const { nodes, marks } = sceneSchema;

const EMPTY_PARAGRAPH = /^<!--\s*-->$/;
const EM_OPEN = /^<(em|i)>$/i;
const EM_CLOSE = /^<\/(em|i)>$/i;
const BR = /^<br\s*\/?>$/i;

/**
 * Parses the Markdown of a scene into a ProseMirror document.
 *
 * Lenient by design: any Markdown (including files edited outside the app)
 * yields a valid scene. Constructs a scene cannot hold are flattened, never
 * dropped: headings, list markers and code are kept as text, bold loses its
 * markers but keeps its words, nested quotes are flattened.
 */
export function parseSceneMarkdown(markdown: string): Node {
  const tokens = md.parse(markdown, {});
  const blocks: Node[] = [];
  let quoteDepth = 0;
  let quoteParagraphs: Node[] = [];

  const flushQuote = () => {
    if (quoteParagraphs.length) blocks.push(nodes.blockquote.create(null, quoteParagraphs));
    quoteParagraphs = [];
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'blockquote_open':
        quoteDepth++;
        break;
      case 'blockquote_close':
        quoteDepth--;
        if (quoteDepth === 0) flushQuote();
        break;
      case 'hr':
        // A scene break cannot live inside a quote: split the quote around it.
        if (quoteDepth > 0) flushQuote();
        blocks.push(nodes.sceneBreak.create());
        break;
      case 'inline': {
        const paragraph = parseInline(token.children ?? []);
        if (quoteDepth > 0) quoteParagraphs.push(paragraph);
        else blocks.push(paragraph);
        break;
      }
      default:
        // paragraph_open/close carry no information of their own.
        break;
    }
  }
  flushQuote();

  if (blocks.length === 0) blocks.push(nodes.paragraph.create());
  return nodes.doc.create(null, blocks);
}

function parseInline(children: readonly Token[]): Node {
  const only = children.length === 1 ? children[0] : undefined;
  if (only?.type === 'html_inline' && EMPTY_PARAGRAPH.test(only.content.trim())) {
    return nodes.paragraph.create();
  }

  const content: Node[] = [];
  let italicDepth = 0;
  const currentMarks = (): readonly Mark[] => (italicDepth > 0 ? [marks.italic.create()] : []);
  const pushText = (raw: string) => {
    const text = sanitizeSceneText(raw);
    if (text) content.push(sceneSchema.text(text, currentMarks()));
  };

  for (const token of children) {
    switch (token.type) {
      case 'text':
      case 'text_special':
        pushText(token.content);
        break;
      case 'softbreak':
        pushText(' ');
        break;
      case 'hardbreak':
        content.push(nodes.hardBreak.create(null, null, currentMarks()));
        break;
      case 'em_open':
        italicDepth++;
        break;
      case 'em_close':
        italicDepth = Math.max(0, italicDepth - 1);
        break;
      case 'strong_open':
      case 'strong_close':
        // Bold is not part of a scene: keep the words, drop the emphasis.
        break;
      case 'html_inline': {
        const html = token.content.trim();
        if (EM_OPEN.test(html)) italicDepth++;
        else if (EM_CLOSE.test(html)) italicDepth = Math.max(0, italicDepth - 1);
        else if (BR.test(html)) content.push(nodes.hardBreak.create(null, null, currentMarks()));
        else pushText(token.content);
        break;
      }
      default:
        pushText(token.content);
    }
  }
  return nodes.paragraph.create(null, content);
}
