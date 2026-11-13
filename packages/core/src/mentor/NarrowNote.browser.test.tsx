import { anchorForQuote, createAgentWriter, guids, listAllScenes } from '@charpentier/schema';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);

describe('the note in a narrow window (docs/DESIGN.md §4.2)', () => {
  it('unfolds under its paragraph and pushes the text down, covering nothing', async () => {
    await page.viewport(1000, 800);
    const prefs = new Map<string, unknown>([['welcomed', true]]);
    const docs = new Map<string, Y.Doc>();
    const doc = (guid: string) => {
      const existing = docs.get(guid) ?? new Y.Doc({ guid });
      docs.set(guid, existing);
      return existing;
    };
    const platform = createTestPlatform({
      keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
      preferences: {
        get: async <T,>(key: string) => prefs.get(key) as T | undefined,
        set: async (key, value) => void prefs.set(key, value),
      },
      documents: {
        open: async (guid) => ({
          guid,
          doc: doc(guid),
          whenLoaded: Promise.resolve(),
          close: async () => {},
        }),
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    await userEvent.keyboard('Il pleuvait sur Nantes depuis trois jours.{Enter}Hélène entra.');

    const projectId = String(prefs.get('lastProjectId'));
    const root = doc(guids.project(projectId));
    const [scene] = listAllScenes(root);
    const textAnchor = anchorForQuote(
      doc(guids.scene(projectId, scene?.id ?? '')),
      scene?.id ?? '',
      scene?.activeVariantId ?? '',
      'depuis trois jours',
    );
    expect(textAnchor).toBeTruthy();
    if (!textAnchor) return;
    createAgentWriter(root, 'scene-analysis').raiseSignal({
      kind: 'craft',
      title: 'Une attente sans enjeu',
      message: 'Que veut-elle ?',
      principle: 'Une scène avance par un désir.',
      textAnchor,
    });
    await waitFor(() => expect(editor.querySelectorAll('.ch-pastille')).toHaveLength(1));
    await userEvent.keyboard("{ControlOrMeta>}'{/ControlOrMeta}{Alt>}{Enter}{/Alt}");

    const note = await screen.findByRole('complementary', { name: 'Métier' });
    const [first, second] = [...editor.querySelectorAll('p')].filter((p) => !p.closest('.ch-note'));
    // In the flow, between the two paragraphs.
    expect(note.closest('.ch-note-slot')?.parentElement).toBe(editor);
    const noteBox = note.getBoundingClientRect();
    expect(noteBox.top).toBeGreaterThanOrEqual(first?.getBoundingClientRect().bottom ?? 0);
    expect(second?.getBoundingClientRect().top ?? 0).toBeGreaterThanOrEqual(noteBox.bottom);
    // As wide as the text column.
    expect(Math.round(noteBox.width)).toBe(Math.round(editor.getBoundingClientRect().width));
    // Its keys work there too, and nothing reaches the text: I ignores the remark.
    await waitFor(() => expect(document.activeElement).toBe(note));
    await userEvent.keyboard('i');
    await waitFor(() => expect(editor.querySelector('.ch-note-slot')).toBeNull());
    expect(editor.textContent).toBe('Il pleuvait sur Nantes depuis trois jours.Hélène entra.');
  });
});
