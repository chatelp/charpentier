import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { sceneSchemaExtensions } from './extensions';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

/** Runs insertSceneBreak at `position` ('end' or an offset in the text), then types `typed`. */
function breakAt(html: string, place: (e: Editor) => void, typed = 'Suite.') {
  editor = new Editor({ extensions: sceneSchemaExtensions, content: html });
  place(editor);
  expect(editor.commands.insertSceneBreak()).toBe(true);
  editor.commands.insertContent(typed);
  return editor.getHTML();
}

const HR = '<hr class="ch-scene-break">';

describe('insertSceneBreak', () => {
  it('at the end of a paragraph, opens a new paragraph after the break', () => {
    expect(breakAt('<p>Fin.</p>', (e) => e.commands.focus('end'))).toBe(
      `<p>Fin.</p>${HR}<p>Suite.</p>`,
    );
  });

  it('in the middle of a paragraph, splits it around the break', () => {
    expect(breakAt('<p>AvantAprès</p>', (e) => e.commands.setTextSelection(6), '')).toBe(
      `<p>Avant</p>${HR}<p>Après</p>`,
    );
  });

  it('in an empty paragraph, puts the break before it and keeps writing there', () => {
    expect(breakAt('<p>Un.</p><p></p>', (e) => e.commands.focus('end'))).toBe(
      `<p>Un.</p>${HR}<p>Suite.</p>`,
    );
  });

  it('at the end of a quote, leaves the quote: a break never lives in a quote', () => {
    expect(breakAt('<blockquote><p>Lettre.</p></blockquote>', (e) => e.commands.focus('end'))).toBe(
      `<blockquote><p>Lettre.</p></blockquote>${HR}<p>Suite.</p>`,
    );
  });

  it('inside a quote, splits the quote around the break', () => {
    expect(
      breakAt(
        '<blockquote><p>Un.</p><p>Deux.</p></blockquote>',
        (e) => e.commands.setTextSelection(5),
        '',
      ),
    ).toBe(`<blockquote><p>Un.</p></blockquote>${HR}<blockquote><p>Deux.</p></blockquote>`);
  });
});
