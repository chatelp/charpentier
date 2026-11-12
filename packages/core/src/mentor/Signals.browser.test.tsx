import {
  anchorForQuote,
  createAgentWriter,
  createEntity,
  getEntity,
  getScene,
  guids,
  listAllScenes,
  listSignals,
} from '@charpentier/schema';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

async function startApp() {
  const prefs = new Map<string, unknown>();
  const docs = new Map<string, Y.Doc>();
  const platform = createTestPlatform({
    keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
    preferences: {
      get: async <T,>(key: string) => prefs.get(key) as T | undefined,
      set: async (key, value) => void prefs.set(key, value),
    },
    documents: {
      open: async (guid) => {
        const doc = docs.get(guid) ?? new Y.Doc({ guid });
        docs.set(guid, doc);
        return { guid, doc, whenLoaded: Promise.resolve(), close: async () => {} };
      },
    },
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const projectId = String(prefs.get('lastProjectId'));
  const root = docs.get(guids.project(projectId)) as Y.Doc;
  const [scene] = listAllScenes(root);
  const sceneDoc = docs.get(guids.scene(projectId, scene?.id ?? '')) as Y.Doc;
  /** What the Compagnon would do: a remark on a quoted passage. */
  const remark = (quote: string, message: string, kind: 'craft' | 'conflict' = 'craft') => {
    const s = getScene(root, scene?.id ?? '');
    const textAnchor = anchorForQuote(sceneDoc, s?.id ?? '', s?.activeVariantId ?? '', quote);
    if (!textAnchor) throw new Error(`Quote not found: ${quote}`);
    return createAgentWriter(root, 'test').raiseSignal({
      kind,
      message,
      principle: 'Montrer plutôt que dire.',
      textAnchor,
    });
  };
  return { editor, root, remark };
}

describe('the Compagnon’s remarks in the text', () => {
  it('puts a pastille at the paragraph, unfolds the note at the passage and resolves it', async () => {
    const { editor, root, remark } = await startApp();
    await userEvent.keyboard('Il pleuvait sur Nantes.{Enter}Hélène était très triste ce soir-là.');
    await waitFor(() => expect(editor.textContent).toContain('ce soir-là.'));
    const id = remark('était très triste', 'L’émotion est nommée plutôt que montrée.');
    await waitFor(() => expect(editor.querySelectorAll('.ch-pastille')).toHaveLength(1));

    // The author keeps writing after the passage: the remark stays on its words.
    await userEvent.keyboard(' Elle se taisait.');
    // ⌥⏎ in the passage unfolds the note and gives it the focus.
    // Put the cursor inside « était très triste ».
    const text = editor.querySelectorAll('p')[1];
    const node = text?.firstChild?.nextSibling ?? text?.lastChild;
    const offset = (node?.textContent ?? '').indexOf('très') + 2;
    const range = document.createRange();
    if (node) range.setStart(node, offset);
    range.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    await new Promise((r) => setTimeout(r, 50));
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    const note = await screen.findByRole('complementary', { name: 'Métier' });
    expect(within(note).getByText('L’émotion est nommée plutôt que montrée.')).toBeTruthy();
    expect(within(note).getByText('Montrer plutôt que dire.')).toBeTruthy();
    expect(editor.querySelector('.ch-anchor')?.textContent).toBe('était très triste');
    await waitFor(() => expect(document.activeElement).toBe(note));

    await userEvent.keyboard('r');
    expect(listSignals(root, { state: 'resolved' }).map((s) => s.id)).toEqual([id]);
    await waitFor(() => expect(editor.querySelectorAll('.ch-pastille')).toHaveLength(0));
    await waitFor(() => expect(document.activeElement).toBe(editor));
    expect(editor.textContent).toContain('ce soir-là. Elle se taisait.');
  });

  it('lists the points in the panel and goes to each passage', async () => {
    const { editor, root, remark } = await startApp();
    await userEvent.keyboard('Il pleuvait sur Nantes.{Enter}Hélène avait les yeux verts.');
    await waitFor(() => expect(editor.textContent).toContain('yeux verts.'));
    remark('les yeux verts', 'La fiche d’Hélène dit « yeux bleus ».', 'conflict');
    remark('Il pleuvait', 'Ouverture météorologique : attendue.');

    await userEvent.keyboard(mod('l'));
    const panel = await screen.findByRole('complementary', { name: 'Le Compagnon' });
    const points = within(panel).getAllByRole('option');
    // In the order of the text.
    expect(points.map((p) => p.textContent)).toEqual([
      expect.stringContaining('Ouverture météorologique'),
      expect.stringContaining('yeux bleus'),
    ]);
    await waitFor(() => expect(document.activeElement).toBe(points[0]));
    await userEvent.keyboard('j{Enter}');
    await waitFor(() =>
      expect(editor.querySelector('.ch-anchor')?.textContent).toBe('les yeux verts'),
    );

    // Ignore the first one from the panel.
    within(panel).getAllByRole('option')[0]?.focus();
    await userEvent.keyboard('i');
    expect(listSignals(root, { state: 'dismissed' }).map((s) => s.message)).toEqual([
      'Ouverture météorologique : attendue.',
    ]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Le Compagnon' })).toBeNull();
  });

  it('lists the sheets the Compagnon proposes, to validate or reject from the panel', async () => {
    const { root } = await startApp();
    const writer = createAgentWriter(root, 'test');
    const marc = writer.proposeEntity('characters', { name: 'Marc' }, []);
    const evidence = [{ sceneId: 's', variantId: 'v', quote: 'q' }];
    const helene = createEntity(root, 'characters', { name: 'Hélène' });
    writer.proposeField(
      { module: 'characters', entityId: helene, field: 'residence' },
      'Anneau B',
      evidence,
    );

    await userEvent.keyboard(mod('l'));
    const panel = await screen.findByRole('complementary', { name: 'Le Compagnon' });
    expect(within(panel).getByText('Fiches proposées')).toBeTruthy();
    const points = within(panel).getAllByRole('option');
    expect(points.map((p) => p.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Marc'),
        expect.stringContaining('Hélène · Lieu de vie'),
      ]),
    );
    points.find((p) => p.textContent?.includes('Marc'))?.focus();
    await userEvent.keyboard('v');
    expect(getEntity(root, 'characters', marc)?.status).toBe('validated');
    await waitFor(() => expect(within(panel).getAllByRole('option')).toHaveLength(1));
    within(panel).getAllByRole('option')[0]?.focus();
    await userEvent.keyboard('x');
    expect(getEntity(root, 'characters', helene)?.fields['residence']?.status).toBe('rejected');
  });
});
