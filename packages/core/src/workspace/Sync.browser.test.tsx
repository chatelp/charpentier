import type { SignInResult, SyncDevice, SyncService, SyncStatus } from '@charpentier/platform';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);
const mod = (keys: string) => `{ControlOrMeta>}${keys}{/ControlOrMeta}`;

/** A sync service as the desktop host gives it, the server played by the test. */
function fakeSync({ signedIn = false } = {}) {
  let status: SyncStatus = 'off';
  const listeners = new Set<(s: SyncStatus) => void>();
  const calls: string[] = [];
  const setStatus = (next: SyncStatus) => {
    status = next;
    for (const l of listeners) l(next);
  };
  const devices: SyncDevice[] = [
    { id: 'a', device: 'Mac de Pierre', lastSeenAt: '2026-11-13T10:00:00Z', current: true },
    { id: 'b', device: 'x250', lastSeenAt: '2026-11-12T18:00:00Z', current: false },
  ];
  const service: SyncService = {
    status: () => status,
    onStatusChange: (l) => (listeners.add(l), () => listeners.delete(l)),
    account: async () =>
      status === 'off' && !signedIn
        ? null
        : { server: 'https://ecrire.example.org', email: 'p@example.org' },
    signIn: async ({ server, email, password }): Promise<SignInResult> => {
      calls.push(`signIn ${server} ${email} ${password}`);
      if (password !== 'bon mot de passe') return 'invalid';
      setStatus('synced');
      return 'ok';
    },
    signOut: async () => {
      calls.push('signOut');
      setStatus('off');
    },
    devices: async () => devices,
    revokeDevice: async (id) => (calls.push(`revoke ${id}`), true),
    openAdmin: async () => {
      calls.push('openAdmin');
      return status === 'off' ? 'not-admin' : 'opened';
    },
  };
  return { service, calls, setStatus };
}

async function start(sync: SyncService) {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
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
    sync,
  });
  render(<App platform={platform} i18n={await createI18n('fr')} />);
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  return platform;
}

const command = async (words: string) => {
  await userEvent.keyboard(mod('k'));
  await userEvent.keyboard(`${words}{Enter}`);
};

describe('signing in to the sync server (step 4.4)', () => {
  it('signs in from the command line, shows the state, lists the devices, signs out', async () => {
    const { service, calls, setStatus } = fakeSync();
    await start(service);

    await userEvent.keyboard(mod('k'));
    await userEvent.keyboard('connecter serveur{Enter}');
    await screen.findByRole('textbox', { name: 'Adresse du serveur (https://…)' });
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}https://ecrire.example.org{Enter}');
    await screen.findByRole('textbox', { name: 'Adresse e-mail du compte' });
    await userEvent.keyboard('p@example.org{Enter}');
    const password = await screen.findByLabelText('Mot de passe');
    expect(password.getAttribute('type')).toBe('password');
    await userEvent.keyboard('mauvais{Enter}');
    await screen.findByText('E-mail ou mot de passe incorrect.');

    await command('connecter serveur');
    await screen.findByRole('textbox', { name: 'Adresse du serveur (https://…)' });
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}https://ecrire.example.org{Enter}');
    await screen.findByRole('textbox', { name: 'Adresse e-mail du compte' });
    await userEvent.keyboard('p@example.org{Enter}');
    await screen.findByLabelText('Mot de passe');
    await userEvent.keyboard('bon mot de passe{Enter}');
    await screen.findByText('Connecté. Vos projets se synchronisent.');
    expect(calls).toContain('signIn https://ecrire.example.org p@example.org bon mot de passe');
    expect(screen.getByText('Synchronisé')).toBeTruthy();

    setStatus('offline');
    await screen.findByText('Hors ligne');

    // Signed out from elsewhere: the footer offers to sign in again.
    setStatus('unauthorized');
    const resume = await screen.findByRole('button', {
      name: 'Synchronisation en pause\u00A0: se reconnecter',
    });
    await userEvent.click(resume);
    await screen.findByRole('textbox', { name: 'Adresse du serveur (https://…)' });
    await userEvent.keyboard('{Escape}');

    setStatus('synced');
    await command('appareils');
    expect(await screen.findByText('cet appareil')).toBeTruthy();
    await userEvent.keyboard('x250{Enter}');
    await screen.findByText('Appareil déconnecté.');
    expect(calls).toContain('revoke b');

    await command('deconnecter');
    await screen.findByText('Déconnecté du serveur. Vos projets restent sur cet appareil.');
    expect(screen.queryByText('Synchronisé')).toBeNull();
  });

  it('opens the administration page from the command line', async () => {
    const { service, calls, setStatus } = fakeSync();
    await start(service);
    setStatus('synced');
    await command('administrer le serveur');
    await waitFor(() => expect(calls).toContain('openAdmin'));
    await screen.findByText('La page d’administration s’ouvre.');
  });

  it('offers the account’s projects after signing in on a new device', async () => {
    const { service, setStatus } = fakeSync();
    const platform = await start(service);
    // Signing in: the account's novel arrives in the library.
    setStatus('connecting');
    await platform.library.create({ title: 'Les Eaux basses', kind: 'novel' });
    setStatus('synced');
    // The library opens, to open it or start another; the device's blank start is in its trash.
    await screen.findByRole('heading', { name: 'Bibliothèque' });
    await screen.findByText('Les Eaux basses');
    expect((await platform.library.list()).map((p) => p.title)).toEqual(['Les Eaux basses']);
    expect((await platform.library.listTrashed()).map((p) => p.title)).toEqual(['Mon roman']);
  });

  it('keeps the open project when a signed-in device merely starts again', async () => {
    const { service, setStatus } = fakeSync({ signedIn: true });
    const platform = await start(service);
    setStatus('connecting');
    await platform.library.create({ title: 'Les Eaux basses', kind: 'novel' });
    setStatus('synced');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('heading', { name: 'Bibliothèque' })).toBeNull();
    expect(await platform.library.listTrashed()).toEqual([]);
  });
});
