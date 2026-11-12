import markdownIt, { type MarkdownIt } from 'markdown-it';

/**
 * The Markdown dialect of the mirror: CommonMark restricted to what a scene
 * can hold. Only the rules listed here are active; anything else in a file
 * edited outside the app (headings, lists, code, links…) is read back as
 * plain text, never lost.
 *
 * Inline HTML is enabled only so that `<em>…</em>` can carry italics that
 * CommonMark delimiters cannot express, and `<!-- -->` can mark an empty
 * paragraph. Other inline HTML is kept as literal text.
 */
export function createSceneMarkdownIt(): MarkdownIt {
  const md = new markdownIt('zero', { html: true });
  md.enable([
    'paragraph',
    'blockquote',
    'hr',
    'emphasis',
    'escape',
    'entity',
    'newline',
    'html_inline',
  ]);
  return md;
}
