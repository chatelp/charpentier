import { strFromU8, unzipSync } from 'fflate';
import { splitChapters, type ReferenceText } from './style-reference';

/**
 * A reference text read from its file (docs/PLAN.md phase 6.4): plain text,
 * Markdown, EPUB or PDF, down to its title, its author when the file says,
 * and its chapters as plain text. Nothing is written anywhere: the text
 * lives in memory for the time of the reading. The host reads the file's
 * bytes (the desktop from the disk, the browser from the file the author
 * picked); the parsing is the same.
 */

export type ReferenceFormat = 'txt' | 'md' | 'epub' | 'pdf';

export const REFERENCE_EXTENSIONS: readonly ReferenceFormat[] = ['txt', 'md', 'epub', 'pdf'];

/**
 * A file this reader cannot make sense of: damaged or not what it says
 * (`unreadable`), locked by a DRM or a password (`protected`), or a PDF of
 * scanned pages, images without text (`image-pdf`).
 */
export class UnreadableReferenceError extends Error {
  constructor(
    message: string,
    readonly reason: 'unreadable' | 'protected' | 'image-pdf' = 'unreadable',
  ) {
    super(message);
  }
}

/** A path inside an archive, its `.` and `..` resolved (`OEBPS/../Text/a.xhtml` → `Text/a.xhtml`). */
function normalizePath(name: string): string {
  const parts: string[] = [];
  for (const part of name.split('/'))
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  return parts.join('/');
}

/** No more than this is read: a long novel is about 1 MB of text, an EPUB a few. */
export const MAX_REFERENCE_BYTES = 80 * 1024 * 1024;

/** The format a file's name says, if it is one this reader knows. */
export function referenceFormat(name: string): ReferenceFormat | null {
  const format = /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  return (REFERENCE_EXTENSIONS as readonly string[]).includes(format)
    ? (format as ReferenceFormat)
    : null;
}

/** A file's bytes, by its name (« Le Grand Meaulnes.epub »), down to a reference text. */
export async function parseReferenceFile(
  data: Uint8Array,
  name: string,
): Promise<ReferenceText & { format: ReferenceFormat }> {
  const format = referenceFormat(name);
  if (!format || data.length > MAX_REFERENCE_BYTES) throw new UnreadableReferenceError(name);
  const fallbackTitle = name.replace(/^.*[/\\]/, '').replace(/\.[^.]*$/, '');
  try {
    switch (format) {
      case 'txt':
        return { format, title: fallbackTitle, chapters: splitChapters(strFromU8(data)) };
      case 'md':
        return { format, ...fromMarkdown(strFromU8(data), fallbackTitle) };
      case 'epub':
        return { format, ...fromEpub(data, fallbackTitle) };
      case 'pdf':
        return { format, ...(await fromPdf(data, fallbackTitle)) };
    }
  } catch (error) {
    if (error instanceof UnreadableReferenceError) throw error;
    throw new UnreadableReferenceError(String(error));
  }
}

// ─── Markdown ───

/** Markdown down to its prose: headings cut the chapters, the marks go. */
export function fromMarkdown(text: string, fallbackTitle: string): ReferenceText {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/u, '');
  const title = /^#\s+(.+)$/mu.exec(body)?.[1]?.trim();
  const plain = body
    .replace(/^#\s+.+$/mu, '')
    .replace(/^>\s?/gmu, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/(\*\*|__|\*|_)(\S(?:.*?\S)?)\1/gu, '$2')
    .replace(/^\s*(?:\*\s*){3,}$/gmu, '');
  return { title: title || fallbackTitle, chapters: splitChapters(plain) };
}

// ─── EPUB ───

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X'))
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

/** An XHTML page down to its paragraphs, one blank line between them. */
export function xhtmlToText(xhtml: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/iu.exec(xhtml)?.[1] ?? xhtml;
  return decode(
    body
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/giu, '')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|section)>/giu, '\n\n')
      .replace(/<[^>]+>/gu, ''),
  )
    .split(/\n\s*\n/u)
    .map((p) => p.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, 'iu').exec(tag);
const attrOf = (tag: string, name: string) => {
  const m = attr(tag, name);
  return m ? (m[1] ?? m[2]) : undefined;
};

/** Pages of the book shorter than this are its cover, title page, copyright… */
const MIN_CHAPTER_WORDS = 80;

/** An EPUB's chapters in reading order (its spine), with its title and author. */
export function fromEpub(data: Uint8Array, fallbackTitle: string): ReferenceText {
  const files = unzipSync(data);
  const read = (name: string) => {
    const file = files[name];
    if (!file) throw new UnreadableReferenceError(`missing ${name}`);
    return strFromU8(file);
  };
  // A DRM ciphers the pages (fonts alone may be obfuscated, which is no lock).
  const encryption = files['META-INF/encryption.xml'];
  if (
    encryption &&
    [
      ...strFromU8(encryption).matchAll(/<(?:\w+:)?CipherReference\b[^>]*URI\s*=\s*"([^"]+)"/giu),
    ].some((m) => /\.x?html?$/iu.test(m[1] ?? ''))
  )
    throw new UnreadableReferenceError('encrypted', 'protected');
  const container = read('META-INF/container.xml');
  const opfPath = attrOf(/<rootfile\b[^>]*>/iu.exec(container)?.[0] ?? '', 'full-path');
  if (!opfPath) throw new UnreadableReferenceError('no package document');
  const opf = read(opfPath);
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const meta = (tag: string) => {
    const m = new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'iu').exec(opf);
    return m?.[1] ? decode(m[1].replace(/<[^>]+>/gu, '')).trim() : undefined;
  };
  const manifest = new Map<string, string>();
  for (const [item] of opf.matchAll(/<item\b[^>]*>/giu)) {
    const id = attrOf(item, 'id');
    const href = attrOf(item, 'href');
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }
  const chapters: string[] = [];
  for (const [itemref] of opf.matchAll(/<itemref\b[^>]*>/giu)) {
    const href = manifest.get(attrOf(itemref, 'idref') ?? '');
    if (!href || attrOf(itemref, 'linear') === 'no') continue;
    const name = normalizePath(base + href.split('#')[0]);
    if (!files[name]) continue;
    const text = xhtmlToText(read(name));
    if (text.split(/\s+/u).length >= MIN_CHAPTER_WORDS) chapters.push(text);
  }
  const author = meta('creator');
  return { title: meta('title') || fallbackTitle, ...(author && { author }), chapters };
}

// ─── PDF ───

/**
 * A PDF's pages down to prose: page numbers and running heads dropped, words
 * cut at a line's end joined again, then chapters at their headings.
 */
async function fromPdf(data: Uint8Array, fallbackTitle: string): Promise<ReferenceText> {
  const { extractText, getDocumentProxy, getMeta } = await import('unpdf');
  const pdf = await getDocumentProxy(data).catch((error: unknown) => {
    if ((error as { name?: string } | null)?.name === 'PasswordException')
      throw new UnreadableReferenceError('password', 'protected');
    throw error;
  });
  const { info } = await getMeta(pdf);
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const text = cleanPdfPages(pages);
  // Scanned pages: hardly a word per page.
  if (pages.length >= 3 && text.split(/\s+/u).filter(Boolean).length < pages.length * 5)
    throw new UnreadableReferenceError('no text', 'image-pdf');
  const title =
    typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : fallbackTitle;
  const author = typeof info.Author === 'string' ? info.Author.trim() : '';
  return { title, ...(author && { author }), chapters: splitChapters(text) };
}

/** The text of a PDF's pages, as one plain text with its headings on their own lines. */
export function cleanPdfPages(pages: readonly string[]): string {
  const lines = pages.map((page) => page.split('\n').map((l) => l.trim()));
  // A line that heads or ends most pages is a running head or a folio.
  const counts = new Map<string, number>();
  for (const page of lines)
    for (const l of new Set([page[0], page.at(-1)].filter((x): x is string => !!x)))
      counts.set(l.replace(/\d+/gu, '#'), (counts.get(l.replace(/\d+/gu, '#')) ?? 0) + 1);
  const repeated = (l: string) =>
    pages.length >= 3 && (counts.get(l.replace(/\d+/gu, '#')) ?? 0) >= pages.length / 2;
  const kept = lines.flatMap((page) =>
    page.filter(
      (l, i) => !(/^\d{1,4}$/u.test(l) || ((i === 0 || i === page.length - 1) && repeated(l))),
    ),
  );
  return kept
    .join('\n')
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
    .replace(/([^\n.!?…:»”])\n(?=\p{Ll})/gu, '$1 ');
}
