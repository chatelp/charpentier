// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';
import { App } from './App';

afterEach(cleanup);

describe('<App>', () => {
  it('opens the default scene in a French writing surface', async () => {
    render(<App platform={createTestPlatform()} i18n={await createI18n('fr')} />);
    expect(await screen.findByRole('heading', { name: 'Charpentier' })).toBeTruthy();
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    expect(editor.getAttribute('lang')).toBe('fr');
  });

  it('says discreetly when the host offers no mentor', async () => {
    render(<App platform={createTestPlatform()} i18n={await createI18n('fr')} />);
    expect(
      await screen.findByText('Le Compagnon n’est pas disponible dans cette version.'),
    ).toBeTruthy();
  });

  it('stays silent about the mentor when it is available', async () => {
    const platform = createTestPlatform({
      agents: {
        status: () => 'available',
        onStatusChange: () => () => {},
        setApiKey: async () => 'saved',
        forgetApiKey: async () => {},
        analyze: async () => 'answered',
        reviewChapter: async () => 'answered',
        lightModel: async () => 'opus',
        setLightModel: async () => {},
        estimateDeepWork: async () => null,
        deepWork: async () => 'unavailable',
        stopDeepWork: async () => {},
        chooseReference: async () => 'cancelled',
        readReference: async () => 'empty',
        dropReference: async () => {},
        interview: async () => 'unavailable',
        ask: async () => 'answered',
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    expect(screen.queryByText('Le Compagnon n’est pas disponible dans cette version.')).toBeNull();
  });
});

describe('a project that does not open', () => {
  /** A device whose disk can fail. */
  function start() {
    const store = new Map<string, unknown>();
    const base = createTestPlatform({
      preferences: {
        get: async <T,>(key: string) => store.get(key) as T | undefined,
        set: async (key, value) => void store.set(key, value),
      },
    });
    const disk = { broken: true };
    const platform = {
      ...base,
      documents: {
        open: async (guid: string) => {
          if (disk.broken) throw new Error('unreadable');
          return base.documents.open(guid);
        },
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return { platform, disk };
  }
  afterEach(() => vi.restoreAllMocks());

  it('says it is opening, then offers to try again', async () => {
    const { platform, disk } = start();
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    expect(screen.getByRole('status').textContent).toBe('Ouverture…');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Impossible d'ouvrir le projet.");
    expect(screen.queryByRole('status')).toBeNull();

    disk.broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers the library as a way out, to open another project', async () => {
    const { platform, disk } = start();
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tous les romans…' }));
    const other = await screen.findByText('Mon roman');
    expect(screen.queryByRole('alert')).toBeNull();
    disk.broken = false;
    fireEvent.doubleClick(other);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Enter' });
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
  });
});
