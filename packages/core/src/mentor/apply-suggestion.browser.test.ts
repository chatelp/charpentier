import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { sceneSchemaExtensions } from '../editor/extensions';
import { applyCorrection, insertExample } from './apply-suggestion';

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

const open = (html: string) =>
  (editor = new Editor({ extensions: sceneSchemaExtensions, content: html }));

describe('the example sentence enters the text as text (D-11)', () => {
  it('never reads it as HTML: tags stay characters, in one paragraph', () => {
    const e = open('<p>Avant.</p>');
    e.commands.focus('end');
    expect(insertExample(e, '<p>Un.</p><p>deux</p>')).toBe(true);
    expect(e.state.doc.childCount).toBe(1);
    expect(e.state.doc.textContent).toBe('Avant.<p>Un.</p><p>deux</p>');
  });

  it('keeps one line and the no-break spaces of French', () => {
    const e = open('<p></p>');
    e.commands.focus('end');
    insertExample(e, 'Tu viens\u202F?\n\nNon\u00A0!');
    expect(e.state.doc.childCount).toBe(1);
    expect(e.state.doc.textContent).toBe('Tu viens\u202F? Non\u00A0!');
    expect(insertExample(e, ' \n ')).toBe(false);
  });
});

describe('a language correction replaces only the passage it was written for', () => {
  // « Avant les chevals. » : the passage « les chevals » is at 7..18.
  const range = { from: 7, to: 18 };

  it('replaces the passage while it still reads the stored quote', () => {
    const e = open('<p>Avant les chevals.</p>');
    expect(e.state.doc.textBetween(range.from, range.to)).toBe('les chevals');
    expect(applyCorrection(e, range, 'les chevals', 'les chevaux')).toBe(true);
    expect(e.state.doc.textContent).toBe('Avant les chevaux.');
  });

  it('leaves a passage the author rewrote, or one it cannot check', () => {
    const e = open('<p>Avant des chevals.</p>');
    expect(applyCorrection(e, range, 'les chevals', 'les chevaux')).toBe(false);
    expect(applyCorrection(e, range, undefined, 'les chevaux')).toBe(false);
    expect(applyCorrection(e, { from: 7, to: 99 }, 'les chevals', 'les chevaux')).toBe(false);
    expect(e.state.doc.textContent).toBe('Avant des chevals.');
  });

  it('never reads the correction as HTML', () => {
    const e = open('<p>Avant les chevals.</p>');
    expect(applyCorrection(e, range, 'les chevals', '<p>les</p><p>chevaux</p>')).toBe(true);
    expect(e.state.doc.childCount).toBe(1);
    expect(e.state.doc.textContent).toBe('Avant <p>les</p><p>chevaux</p>.');
  });
});
