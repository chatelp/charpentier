import { fragmentToSceneDoc } from '@charpentier/schema';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createI18n } from '../i18n/i18n';
import { I18nextProvider } from 'react-i18next';
import { SceneEditor } from './SceneEditor';

afterEach(cleanup);

async function mountEditor(fragment: Y.XmlFragment) {
  const i18n = await createI18n('fr');
  render(
    <I18nextProvider i18n={i18n}>
      <SceneEditor fragment={fragment} language="fr" />
    </I18nextProvider>,
  );
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await userEvent.click(editor);
  return editor;
}

const sceneJson = (fragment: Y.XmlFragment) => fragmentToSceneDoc(fragment).toJSON();

describe('<SceneEditor> in a real browser', () => {
  it('writes every keystroke into the variant’s Yjs fragment', async () => {
    const fragment = new Y.Doc().getXmlFragment('variant:v1');
    await mountEditor(fragment);
    await userEvent.keyboard('Il pleuvait.{Enter}— Tu viens ?');
    expect(sceneJson(fragment)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Il pleuvait.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '— Tu viens ?' }] },
      ],
    });
  });

  it('shows the text again from the CRDT alone (a reload)', async () => {
    const doc = new Y.Doc();
    await mountEditor(doc.getXmlFragment('variant:v1'));
    await userEvent.keyboard('Première phrase.');
    cleanup();

    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(doc));
    const editor = await mountEditor(reloaded.getXmlFragment('variant:v1'));
    expect(editor.textContent).toBe('Première phrase.');
  });

  it('turns *text* into italics and * * * into a scene break', async () => {
    const fragment = new Y.Doc().getXmlFragment('variant:v1');
    await mountEditor(fragment);
    await userEvent.keyboard('Avec l’*Odyssée*.{Enter}* * * Après.');
    expect(sceneJson(fragment)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Avec l’' },
            { type: 'text', text: 'Odyssée', marks: [{ type: 'italic' }] },
            { type: 'text', text: '.' },
          ],
        },
        { type: 'sceneBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Après.' }] },
      ],
    });
  });

  it('inserts a scene break with ⌘⇧Entrée (Ctrl+Shift+Entrée elsewhere)', async () => {
    const fragment = new Y.Doc().getXmlFragment('variant:v1');
    await mountEditor(fragment);
    await userEvent.keyboard('Fin de la première partie.');
    await userEvent.keyboard('{ControlOrMeta>}{Shift>}{Enter}{/Shift}{/ControlOrMeta}');
    await userEvent.keyboard('Suite.');
    expect(sceneJson(fragment)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Fin de la première partie.' }] },
        { type: 'sceneBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Suite.' }] },
      ],
    });
  });

  it('keeps only what a scene can hold when pasting', async () => {
    const fragment = new Y.Doc().getXmlFragment('variant:v1');
    const editor = await mountEditor(fragment);
    const data = new DataTransfer();
    data.setData('text/html', '<h1>Titre</h1><p>Un <b>mot</b> <i>penché</i>\u0007.</p>');
    data.setData('text/plain', 'Titre\n\nUn mot penché.');
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    expect(sceneJson(fragment)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Titre' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Un mot ' },
            { type: 'text', text: 'penché', marks: [{ type: 'italic' }] },
            { type: 'text', text: '.' },
          ],
        },
      ],
    });
  });

  it('keeps the space between two words at the end of a line, never at the start of the next', async () => {
    const fragment = new Y.Doc().getXmlFragment('variant:v1');
    await mountEditor(fragment);
    const editor = screen.getByRole('textbox', { name: 'Texte de la scène' });
    expect(getComputedStyle(editor).whiteSpace).toBe('pre-wrap');
  });
});
