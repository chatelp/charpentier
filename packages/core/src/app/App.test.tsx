// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
        ask: async () => 'answered',
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    await screen.findByRole('textbox', { name: 'Texte de la scène' });
    expect(screen.queryByText('Le Compagnon n’est pas disponible dans cette version.')).toBeNull();
  });
});
