// @vitest-environment happy-dom
import type { SignInResult, SyncService, SyncStatus } from '@charpentier/platform';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';
import { App } from './App';

afterEach(cleanup);

/** The sync of the app the server serves: nothing opens before signing in. */
function webSync({ signedIn = false } = {}) {
  let status: SyncStatus = 'off';
  let account = signedIn;
  const listeners = new Set<(s: SyncStatus) => void>();
  const setStatus = (next: SyncStatus) => {
    status = next;
    for (const l of listeners) l(next);
  };
  const calls: string[] = [];
  const service: SyncService = {
    server: 'https://ecrire.example.org',
    accountRequired: true,
    status: () => status,
    onStatusChange: (l) => (listeners.add(l), () => listeners.delete(l)),
    account: async () =>
      account ? { server: 'https://ecrire.example.org', email: 'p@example.org' } : null,
    signIn: async ({ server, email, password }): Promise<SignInResult> => {
      calls.push(`signIn ${server} ${email}`);
      if (password !== 'bon mot de passe') return 'invalid';
      account = true;
      setStatus('connecting');
      return 'ok';
    },
    signOut: async () => {
      account = false;
      setStatus('off');
    },
    devices: async () => [],
    revokeDevice: async () => true,
    openAdmin: async () => 'not-admin',
  };
  return { service, calls, setStatus };
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the app the server serves (phase 4.7 a)', () => {
  it('asks to sign in first, and opens nothing before', async () => {
    const { service } = webSync();
    const platform = createTestPlatform({ sync: service });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    expect(await screen.findByText('Connectez-vous pour retrouver vos romans.')).toBeTruthy();
    expect(screen.getByLabelText('Adresse e-mail').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Mot de passe').getAttribute('autocomplete')).toBe(
      'current-password',
    );
    expect(screen.queryByRole('textbox', { name: 'Texte de la scène' })).toBeNull();
    // No starter novel made in this browser for nobody.
    expect(await platform.library.list()).toEqual([]);
  });

  it('says a wrong password, then opens the account’s library', async () => {
    const { service, calls, setStatus } = webSync();
    const platform = createTestPlatform({ sync: service });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    await screen.findByLabelText('Adresse e-mail');
    fill('Adresse e-mail', ' p@example.org ');
    fill('Mot de passe', 'mauvais');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'E-mail ou mot de passe incorrect.',
    );

    fill('Mot de passe', 'bon mot de passe');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Vos romans arrivent…')).toBeTruthy();
    expect(calls.at(-1)).toBe('signIn https://ecrire.example.org p@example.org');
    // The account's novel comes with the sync.
    await platform.library.create({ title: 'Avant Nantes', kind: 'novel' });
    setStatus('synced');
    expect(await screen.findByRole('heading', { name: 'Bibliothèque' })).toBeTruthy();
    expect(await screen.findByText('Avant Nantes')).toBeTruthy();
  });

  it('opens straight away once signed in, and goes back to signing in after signing out', async () => {
    const { service } = webSync({ signedIn: true });
    render(<App platform={createTestPlatform({ sync: service })} i18n={await createI18n('fr')} />);
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await service.signOut();
    expect(await screen.findByLabelText('Adresse e-mail')).toBeTruthy();
  });
});
