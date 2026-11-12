// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';
import { App } from './App';

afterEach(cleanup);

describe('<App>', () => {
  it('renders the writing surface in French', async () => {
    render(<App platform={createTestPlatform()} i18n={await createI18n('fr')} />);
    expect(screen.getByText('Votre manuscrit commence ici.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Charpentier' })).toBeTruthy();
  });

  it('says discreetly when the host offers no mentor', async () => {
    render(<App platform={createTestPlatform()} i18n={await createI18n('fr')} />);
    expect(screen.queryByText("Le mentor n'est pas disponible dans cette version.")).toBeTruthy();
  });

  it('stays silent about the mentor when it is available', async () => {
    const platform = createTestPlatform({
      agents: { status: () => 'available', onStatusChange: () => () => {} },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    expect(screen.queryByText("Le mentor n'est pas disponible dans cette version.")).toBeNull();
  });
});
