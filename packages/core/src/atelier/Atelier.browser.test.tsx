import {
  createAgentWriter,
  createChapter,
  createEntity,
  knownByField,
  readOutline,
  createScene,
  guids,
  listEntities,
  readFieldRef,
  readSingleton,
  type Evidence,
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

/** An app whose documents survive an unmount, like a reload. */
function createHost() {
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
  const root = () => docs.get(guids.project(String(prefs.get('lastProjectId')))) as Y.Doc;
  const start = async () => {
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
  };
  return { start, root };
}

const field = (name: string) => screen.getByRole('button', { name });

describe('Atelier', () => {
  it('fills the pitch and a character sheet from the keyboard; all survives a reload', async () => {
    const host = createHost();
    await host.start();

    await userEvent.keyboard(mod('e'));
    await screen.findByRole('region', { name: 'Atelier' });
    // « Le projet » has no list: the focus lands on the first field of the sheet.
    await waitFor(() => expect(document.activeElement).toBe(field('Pitch')));
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('Une enquêtrice des serres découvre qui a ouvert le sas.{Enter}');
    expect(readSingleton(host.root(), 'meta')['pitch']).toMatchObject({
      status: 'validated',
      value: 'Une enquêtrice des serres découvre qui a ouvert le sas.',
    });
    expect(field('Pitch').closest('.ch-fld')?.getAttribute('data-status')).toBe('validated');

    // Characters: new one from the list, named in the command line.
    await userEvent.keyboard(mod('2'));
    await waitFor(() => expect(screen.getByRole('listbox', { name: 'Personnages' })).toBeTruthy());
    await userEvent.keyboard('n');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('Hélène Varenne{Enter}');
    const entry = await screen.findByRole('option', { name: 'Hélène Varenne' });
    await waitFor(() => expect(document.activeElement).toBe(entry));
    await userEvent.keyboard('{Enter}'); // into the sheet: Nom
    expect(document.activeElement).toBe(field('Nom'));
    await userEvent.keyboard('{ArrowDown}{Enter}47 ans{Enter}');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}'); // Physique, Métier, Lieu, Désir
    expect(document.activeElement).toBe(field('Désir'));
    await userEvent.keyboard('{Enter}Comprendre qui a ouvert le sas nord{Enter}');

    const [helene] = listEntities(host.root(), 'characters');
    expect(helene?.fields['age']).toMatchObject({ status: 'validated', value: '47 ans' });
    expect(helene?.fields['desire']?.value).toBe('Comprendre qui a ouvert le sas nord');

    // Échap goes back to the text.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Texte de la scène'),
    );

    // Reload: everything is still there.
    cleanup();
    await host.start();
    await userEvent.keyboard(mod('2'));
    const reloaded = await screen.findByRole('option', { name: 'Hélène Varenne' });
    expect(reloaded).toBeTruthy();
    expect(field('Désir').textContent).toBe('Comprendre qui a ouvert le sas nord');
    await userEvent.keyboard(mod('1'));
    await waitFor(() =>
      expect(field('Pitch').textContent).toBe(
        'Une enquêtrice des serres découvre qui a ouvert le sas.',
      ),
    );
  });

  it('shows the Compagnon’s proposals in relief and lets the author validate or reject them', async () => {
    const host = createHost();
    await host.start();
    const root = host.root();
    const chapterId = createChapter(root, { title: 'Deux' });
    const { sceneId, variantId } = createScene(root, { chapterId, title: 'Le sas' });
    const evidence: Evidence[] = [{ sceneId, variantId, quote: 'sa coursive' }];
    const writer = createAgentWriter(root, 'bottom-up');
    const id = writer.proposeEntity(
      'characters',
      { name: 'Paul Vasseur', residence: 'Anneau B', fear: 'La surface' },
      evidence,
    );
    const residence = { module: 'characters', entityId: id, field: 'residence' } as const;
    const fear = { module: 'characters', entityId: id, field: 'fear' } as const;

    await userEvent.keyboard(mod('2'));
    const entry = await screen.findByRole('option', { name: /Paul Vasseur/ });
    expect(entry.className).toContain('is-proposed');
    expect(entry.textContent).toContain('proposé · scène II.1');
    const row = field('Lieu de vie').closest('.ch-fld') as HTMLElement;
    expect(row.getAttribute('data-status')).toBe('proposed');
    expect(within(row).getByText('Proposée · d’après la scène II.1')).toBeTruthy();

    field('Lieu de vie').focus();
    await userEvent.keyboard('v');
    expect(readFieldRef(root, residence).status).toBe('validated');
    await waitFor(() => expect(row.getAttribute('data-status')).toBe('validated'));

    field('Peur').focus();
    await userEvent.keyboard('x');
    expect(readFieldRef(root, fear).status).toBe('rejected');
    // Rejections are hidden by default: the field looks empty, « 1 rejet » under it.
    await waitFor(() =>
      expect(field('Peur').closest('.ch-fld')?.getAttribute('data-status')).toBe('empty'),
    );
    expect(
      within(field('Peur').closest('.ch-fld') as HTMLElement).getByText('1 rejet'),
    ).toBeTruthy();

    // A conflict on a validated field makes it « contredite ».
    writer.raiseSignal({
      kind: 'conflict',
      message: 'la scène II.1 le fait vivre ailleurs.',
      fieldRef: residence,
    });
    await waitFor(() => expect(row.getAttribute('data-status')).toBe('contradicted'));
    expect(
      within(row).getByText('Contredite : la scène II.1 le fait vivre ailleurs.'),
    ).toBeTruthy();

    // The whole entry is validated with V from the list.
    entry.focus();
    await userEvent.keyboard('v');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Paul Vasseur/ }).className).not.toContain(
        'is-proposed',
      ),
    );
  });

  it('places scenes in acts and follows a clue from planting to resolution, and who knows it', async () => {
    const host = createHost();
    await host.start();
    const root = host.root();
    const chapterId = createChapter(root, { title: 'Deux' });
    for (const title of ['B', 'C', 'D', 'E']) createScene(root, { chapterId, title });
    const pick = async (text: string) => {
      await screen.findByRole('dialog', { name: 'Ligne de commande' });
      await userEvent.keyboard(`${text}{Enter}`);
    };

    // Structure: the narrative model, then an act holding scenes.
    await userEvent.keyboard(mod('3'));
    await screen.findByRole('option', { name: 'Modèle narratif' });
    await userEvent.keyboard('{Enter}'); // into the sheet
    expect(document.activeElement).toBe(field('Modèle'));
    await userEvent.keyboard('{Enter}');
    await pick('trois');
    await waitFor(() => expect(field('Modèle').textContent).toBe('Trois actes'));
    expect(readSingleton(root, 'structure')['narrativeModel']?.value).toBe('threeActs');

    await userEvent.keyboard('{ArrowLeft}n');
    await pick('Exposition');
    await screen.findByRole('option', { name: 'Exposition' });
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowDown}'); // Titre, Résumé, Scènes
    expect(document.activeElement).toBe(field('Scènes'));
    await userEvent.keyboard('{Enter}');
    await pick('I.1');
    await userEvent.keyboard('{Enter}');
    await pick('II.1');
    await waitFor(() => expect(field('Scènes').textContent).toBe('I.1II.1'));
    const [act] = listEntities(root, 'acts');
    expect(act?.fields['sceneIds']?.value).toHaveLength(2);

    // A clue: planted in II.1, resolved in II.4; Hélène knows from II.1, the reader from II.4.
    const helene = createEntity(root, 'characters', { name: 'Hélène' });
    await userEvent.keyboard(mod('5'));
    await waitFor(() =>
      expect(screen.getByRole('listbox', { name: 'Indices et révélations' })).toBeTruthy(),
    );
    await userEvent.keyboard('n');
    await pick('Le badge du technicien');
    await screen.findByRole('option', { name: 'Le badge du technicien' });
    await userEvent.keyboard('{Enter}{Enter}');
    await pick('indice');
    await waitFor(() => expect(field('Type').textContent).toBe('Indice'));
    field('Posé dans').focus();
    await userEvent.keyboard('{Enter}');
    await pick('II.1');
    field('Résolu dans').focus();
    await userEvent.keyboard('{Enter}');
    await pick('II.4');
    field('Le lecteur').focus();
    await userEvent.keyboard('{Enter}');
    await pick('II.4');
    field('Hélène').focus();
    await userEvent.keyboard('{Enter}');
    await pick('II.1');

    const [clue] = listEntities(root, 'clues');
    const scenes = readOutline(root)[1]?.scenes.map((sc) => sc.id) ?? [];
    expect(clue?.fields['kind']?.value).toBe('clue');
    expect(clue?.fields['plantedIn']?.value).toEqual([scenes[0]]);
    expect(clue?.fields['resolvedIn']?.value).toEqual([scenes[3]]);
    expect(clue?.fields[knownByField('reader')]?.value).toEqual({ fromSceneId: scenes[3] });
    expect(clue?.fields[knownByField(helene)]?.value).toEqual({ fromSceneId: scenes[0] });
    await waitFor(() => expect(field('Le lecteur').textContent).toBe('dès la scène II.4 · E'));
  });

  it('opens a sheet from the command line with @', async () => {
    const host = createHost();
    await host.start();
    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('@');
    expect(screen.getByText('Fiches')).toBeTruthy();
    await userEvent.keyboard('mon roman{Enter}');
    await screen.findByRole('region', { name: 'Atelier' });
    expect(screen.getByRole('heading', { name: 'Mon roman' })).toBeTruthy();
  });

  it('hides the rejections, shows them with ⇧X, and lets the author take one back', async () => {
    const host = createHost();
    await host.start();
    const root = host.root();
    const writer = createAgentWriter(root, 'bottom-up');
    const vasseur = writer.proposeEntity('characters', { name: 'Paul Vasseur' }, []);
    const helene = createEntity(root, 'characters', { name: 'Hélène' });
    writer.proposeField({ module: 'characters', entityId: helene, field: 'age' }, '52 ans', []);
    const age = { module: 'characters', entityId: helene, field: 'age' } as const;

    await userEvent.keyboard(mod('2'));
    // The proposed entry is rejected from the list: gone, counted at the foot.
    await userEvent.click(await screen.findByRole('option', { name: /Paul Vasseur/ }));
    await userEvent.keyboard('x');
    await waitFor(() => expect(screen.queryByRole('option', { name: /Paul Vasseur/ })).toBeNull());
    expect(screen.getByText(/1 proposition rejetée/)).toBeTruthy();

    // Hélène's proposed age is rejected: empty field, « 1 rejet ».
    (await screen.findByRole('option', { name: /Hélène/ })).click();
    await waitFor(() => expect(field('Âge')).toBeTruthy());
    field('Âge').focus();
    await userEvent.keyboard('x');
    await waitFor(() =>
      expect(field('Âge').closest('.ch-fld')?.getAttribute('data-status')).toBe('empty'),
    );

    // ⇧X shows them: the field is rejected again, its value can be used; the entry comes back.
    await userEvent.keyboard('{Shift>}X{/Shift}');
    await waitFor(() =>
      expect(field('Âge').closest('.ch-fld')?.getAttribute('data-status')).toBe('rejected'),
    );
    const rejected = await screen.findByRole('option', { name: /Paul Vasseur/ });
    expect(rejected.className).toContain('is-rejected');
    await userEvent.click(screen.getByRole('button', { name: 'Utiliser cette valeur' }));
    await waitFor(() => expect(readFieldRef(root, age).status).toBe('validated'));
    expect(readFieldRef(root, age).value).toBe('52 ans');
    await userEvent.click(within(rejected).getByRole('button', { name: 'Reprendre' }));
    await waitFor(() =>
      expect(listEntities(root, 'characters').find((c) => c.id === vasseur)?.status).toBe(
        'proposed',
      ),
    );
    expect(vasseur).toBeTruthy();
  });
});
