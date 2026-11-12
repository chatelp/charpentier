import {
  anchorForQuote,
  createAgentWriter,
  createChapter,
  createEntity,
  createScene,
  getScene,
  guids,
  listSignals,
  readMentorLevel,
  readOutline,
  setMentorLevel,
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

describe('the Compagnon reads a scene', () => {
  it('flags green eyes against the validated sheet; the author updates the sheet or the text', async () => {
    const prefs = new Map<string, unknown>();
    const docs = new Map<string, Y.Doc>();
    const doc = (guid: string) => {
      const existing = docs.get(guid) ?? new Y.Doc({ guid });
      docs.set(guid, existing);
      return existing;
    };
    const analyses: { sceneIds: readonly string[]; automatic: boolean }[] = [];
    let heleneId = '';
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
      agents: {
        status: () => 'available',
        onStatusChange: () => () => {},
        setApiKey: async () => 'saved',
        forgetApiKey: async () => {},
        ask: async () => 'answered',
        lightModel: async () => 'opus',
        setLightModel: async () => {},
        reviewChapter: async () => 'answered',
        // What the main process's analysis does on this scene.
        analyze: async ({ projectId, sceneIds, automatic }) => {
          analyses.push({ sceneIds, automatic });
          const root = doc(guids.project(projectId));
          const scene = getScene(root, sceneIds[0] ?? '');
          const textAnchor = anchorForQuote(
            doc(guids.scene(projectId, scene?.id ?? '')),
            scene?.id ?? '',
            scene?.activeVariantId ?? '',
            'les yeux verts',
          );
          if (!textAnchor) return 'failed';
          createAgentWriter(root, 'scene-analysis').raiseSignal({
            kind: 'conflict',
            message: 'La fiche d’Hélène dit « yeux bleus ».',
            principle: 'Un détail physique qui change trouble le lecteur.',
            textAnchor,
            fieldRef: { module: 'characters', entityId: heleneId, field: 'appearance' },
          });
          return 'answered';
        },
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    const root = doc(guids.project(String(prefs.get('lastProjectId'))));
    heleneId = createEntity(root, 'characters', { name: 'Hélène', appearance: 'yeux bleus' });

    await userEvent.keyboard('Hélène avait les yeux verts ce matin-là.');
    await userEvent.keyboard(mod('{Shift>}a{/Shift}')); // ⌘⇧A: the Compagnon's opinion
    await waitFor(() => expect(editor.querySelectorAll('.ch-pastille')).toHaveLength(1));
    expect(analyses).toEqual([{ sceneIds: [expect.any(String)], automatic: false }]);

    // ⌘' to the remark, ⌥⏎ unfolds it: correct the text, update the sheet, or ignore.
    await userEvent.keyboard(mod("'"));
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    const note = await screen.findByRole('complementary', { name: 'Incohérence' });
    expect(within(note).getByText(/Corriger le texte/)).toBeTruthy();
    expect(within(note).getByText(/Mettre à jour la fiche/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(note));
    await userEvent.keyboard('2');
    await screen.findByRole('region', { name: 'Atelier' });
    expect(screen.getByRole('heading', { name: 'Hélène' })).toBeTruthy();
    expect(listSignals(root, { state: 'resolved' })).toHaveLength(1);
  });

  it('sets the intervention level with the slider, per project', async () => {
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
          const d = docs.get(guid) ?? new Y.Doc({ guid });
          docs.set(guid, d);
          return { guid, doc: d, whenLoaded: Promise.resolve(), close: async () => {} };
        },
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    const root = docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
    expect(readMentorLevel(root)).toBe(3);
    await userEvent.keyboard(mod('l'));
    const slider = await screen.findByRole('slider', { name: 'Intervention du Compagnon' });
    expect(slider.getAttribute('aria-valuetext')).toBe('Accompagnant');
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(readMentorLevel(root)).toBe(4));
    expect(screen.getByText('Tuteur')).toBeTruthy();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await waitFor(() => expect(readMentorLevel(root)).toBe(1));
  });

  it('at level 4, reviews a chapter when the author leaves its last scene for the next chapter', async () => {
    const prefs = new Map<string, unknown>();
    const docs = new Map<string, Y.Doc>();
    const analyses: { sceneIds: readonly string[]; automatic: boolean }[] = [];
    const reviews: { chapterId: string; automatic: boolean }[] = [];
    const platform = createTestPlatform({
      keybindings: { primaryModifier: isMac ? 'Meta' : 'Control', reserved: [] },
      preferences: {
        get: async <T,>(key: string) => prefs.get(key) as T | undefined,
        set: async (key, value) => void prefs.set(key, value),
      },
      documents: {
        open: async (guid) => {
          const d = docs.get(guid) ?? new Y.Doc({ guid });
          docs.set(guid, d);
          return { guid, doc: d, whenLoaded: Promise.resolve(), close: async () => {} };
        },
      },
      agents: {
        status: () => 'available',
        onStatusChange: () => () => {},
        setApiKey: async () => 'saved',
        forgetApiKey: async () => {},
        ask: async () => 'answered',
        lightModel: async () => 'opus',
        setLightModel: async () => {},
        analyze: async ({ sceneIds, automatic }) => (
          analyses.push({ sceneIds, automatic }),
          'answered'
        ),
        reviewChapter: async ({ chapterId, automatic }) => (
          reviews.push({ chapterId, automatic }),
          'answered'
        ),
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    const root = docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
    const [first] = readOutline(root);
    const chapterId = createChapter(root, { title: 'Deux' });
    createScene(root, { chapterId, title: 'La gare' });

    // Level 3: leaving the scene analyses it, no review.
    await userEvent.keyboard(mod('{Alt>}{ArrowDown}{/Alt}'));
    await waitFor(() => expect(analyses).toHaveLength(1));
    expect(reviews).toEqual([]);

    // Level 4: back to the first chapter's last scene, then on to the next chapter.
    setMentorLevel(root, 4);
    await userEvent.keyboard(mod('{Alt>}{ArrowUp}{/Alt}'));
    await waitFor(() => expect(analyses).toHaveLength(2));
    expect(reviews).toEqual([]); // Leaving chapter 2's only scene backwards: not its end.
    await userEvent.keyboard(mod('{Alt>}{ArrowDown}{/Alt}'));
    await waitFor(() => expect(reviews).toEqual([{ chapterId: first?.id, automatic: true }]));
  });
});
