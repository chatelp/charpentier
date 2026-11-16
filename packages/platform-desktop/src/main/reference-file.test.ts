import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanPdfPages,
  readReferenceFile,
  UnreadableReferenceError,
  xhtmlToText,
} from './reference-file';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function file(name: string, content: string | Uint8Array) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-reference-'));
  dirs.push(dir);
  const target = path.join(dir, name);
  fs.writeFileSync(target, content);
  return target;
}

const LONG = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `Phrase numéro ${i + 1} de la page, avec quelques mots.`,
  ).join(' ');

/** A small EPUB 3: a cover, two chapters, one page left out of the reading order. */
function epub() {
  const page = (body: string) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body>${body}</body></html>`;
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    ),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0"?>
<package xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata><dc:title>La P&#233;niche</dc:title><dc:creator>Anne Essai</dc:creator></metadata>
  <manifest>
    <item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="Text/chapitre%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="notes" href="Text/notes.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="cover"/><itemref idref="c2"/><itemref idref="c1"/><itemref idref="notes" linear="no"/></spine>
</package>`),
    'OEBPS/Text/cover.xhtml': strToU8(page('<p>La Péniche</p>')),
    'OEBPS/Text/chapitre 1.xhtml': strToU8(
      page(`<h1>Un</h1><p>Marthe tenait la barre&#160;; le fleuve décidait.</p><p>${LONG(12)}</p>`),
    ),
    'OEBPS/Text/c2.xhtml': strToU8(
      page(
        `<h1>Deux</h1><p>&laquo;&nbsp;Tu viens&#x202F;?&nbsp;&raquo; dit-il.<br/>Elle ne vint pas.</p><p>${LONG(12)}</p>`,
      ),
    ),
    'OEBPS/Text/notes.xhtml': strToU8(page(`<p>${LONG(20)}</p>`)),
  });
}

/** A PDF of three pages, each with a running head and its folio, built by hand. */
function pdf() {
  const pages = [
    [
      'La Péniche',
      'Chapitre 1',
      "Marthe tenait la barre depuis l'aube, les mains ger-",
      'cées par le froid.',
      '1',
    ],
    ['La Péniche', 'Le fleuve décidait pour elle. Elle haussa', 'les épaules.', '2'],
    ['La Péniche', 'Chapitre 2', "Au matin, la brume couvrait l'écluse.", '3'],
  ];
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) + 2; // ids from 3 (1 catalog, 2 pages)
  const font = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const latin1 = (s: string) => Buffer.from(s, 'latin1').toString('latin1');
  const escape = (s: string) => s.replace(/([()\\])/g, '\\$1');
  const kids = pages.map((lines) => {
    const stream = `BT /F1 12 Tf 14 TL 72 760 Td ${lines.map((l) => `(${escape(latin1(l))}) Tj T*`).join(' ')} ET`;
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
    return add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
  });
  const info = add('<< /Title (La P\\351niche) /Author (Anne Essai) >>');
  const all = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`,
    ...objects,
  ];
  let out = '%PDF-1.4\n';
  const offsets = all.map((body, i) => {
    const offset = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${all.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

describe('reading a reference text from its file (phase 6.4)', () => {
  it('reads a plain text, its chapters at their headings, titled by its name', async () => {
    const text = await readReferenceFile(
      file(
        'La péniche.txt',
        'Chapitre 1\n\nMarthe tenait la barre.\n\nChapitre 2\n\nElle repartit seule.',
      ),
    );
    expect(text).toEqual({
      format: 'txt',
      title: 'La péniche',
      chapters: ['Marthe tenait la barre.', 'Elle repartit seule.'],
    });
  });

  it('reads Markdown without its marks, titled by its first heading', async () => {
    const text = await readReferenceFile(
      file(
        'brouillon.md',
        '---\nid: x\n---\n# La péniche\n\n## Un\n\nMarthe tenait *la barre*, [lien](http://x).\n\n> Une citation.\n\n## Deux\n\n**Elle** repartit.',
      ),
    );
    expect(text.title).toBe('La péniche');
    expect(text.chapters).toEqual([
      'Marthe tenait la barre, lien.\n\nUne citation.',
      'Elle repartit.',
    ]);
  });

  it('reads an EPUB in its reading order, without its cover or what is out of it', async () => {
    const text = await readReferenceFile(file('peniche.epub', epub()));
    expect(text.title).toBe('La Péniche');
    expect(text.author).toBe('Anne Essai');
    expect(text.chapters).toHaveLength(2);
    expect(text.chapters[0]).toMatch(/^Deux\n\n« Tu viens \? » dit-il\. Elle ne vint pas\./u);
    expect(text.chapters[1]).toMatch(/^Un\n\nMarthe tenait la barre ; le fleuve décidait\./u);
  });

  it('reads a PDF without its running heads and folios, words cut at a line end joined', async () => {
    const text = await readReferenceFile(file('peniche.pdf', pdf()));
    expect(text.title).toBe('La Péniche');
    expect(text.author).toBe('Anne Essai');
    expect(text.chapters).toHaveLength(2);
    expect(text.chapters[0]).toContain('les mains gercées par le froid.');
    expect(text.chapters[0]).toContain('Elle haussa les épaules.');
    expect(text.chapters.join(' ')).not.toMatch(/La Péniche|\b[123]\b/u);
  });

  it('refuses a file it cannot read, or of another kind', async () => {
    await expect(readReferenceFile(file('abime.epub', 'pas un zip'))).rejects.toBeInstanceOf(
      UnreadableReferenceError,
    );
    await expect(readReferenceFile(file('image.png', 'x'))).rejects.toBeInstanceOf(
      UnreadableReferenceError,
    );
  });

  it('keeps paragraphs and decodes entities in XHTML', () => {
    expect(xhtmlToText('<body><p>A&amp;B</p><div>C<br/>D</div></body>')).toBe('A&B\n\nC D');
    expect(cleanPdfPages(['Un mot cou-\npé ici.', '12'])).toBe('Un mot coupé ici.');
  });
});
