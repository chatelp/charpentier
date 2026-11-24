import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformContext } from '../app/platform-context';
import { formatBinding, parseKeybinding } from '../commands/keybinding';
import { hostPrimary } from '../conformance/app-under-test';
import { createI18n } from '../i18n/i18n';
import '../styles/base.css';
import { createTestPlatform } from '../testing/test-platform';
import { ThingMenuSheet } from './ThingMenuSheet';
import type { ThingMenu } from './thing-menu';

beforeEach(() => page.viewport(1440, 900));
afterEach(cleanup);

/** A key as the host names it: never a Mac sign written here. */
const key = (binding: string) => formatBinding(binding, hostPrimary);

describe('the sheet of a menu', () => {
  const choices = (count: number, run: (id: string) => void) =>
    Array.from({ length: count }, (_, i) => ({
      id: `c${i + 1}`,
      label: `Chapitre ${i + 1}`,
      run: () => run(`c${i + 1}`),
    }));

  async function show(model: ThingMenu, anchor: { x: number; y: number } | HTMLElement) {
    const onClose = vi.fn();
    const onChoose = vi.fn((run: () => void) => run());
    render(
      <PlatformContext.Provider value={createTestPlatform()}>
        <I18nextProvider i18n={await createI18n('fr')}>
          <ThingMenuSheet
            menu={model}
            anchor={
              anchor instanceof HTMLElement
                ? { kind: 'button', element: anchor }
                : { kind: 'point', ...anchor }
            }
            surface="page"
            onClose={onClose}
            onChoose={onChoose}
          />
        </I18nextProvider>
      </PlatformContext.Provider>,
    );
    return { sheet: await screen.findByRole('menu'), onClose, onChoose };
  }

  it('turns upward when room is short under its « ⋯ »', async () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.style.cssText = 'position: fixed; right: 40px; bottom: 20px; width: 24px; height: 24px';
    const { sheet } = await show(
      {
        head: { kind: 'Scène', name: 'Le quai' },
        groups: [{ id: 'g', entries: choices(4, () => {}) }],
      },
      button,
    );
    const box = sheet.getBoundingClientRect();
    const anchor = button.getBoundingClientRect();
    expect(sheet.dataset['placement']).toBe('above');
    expect(box.bottom).toBeLessThanOrEqual(anchor.top);
    expect(Math.round(box.right)).toBe(Math.round(anchor.right));
    button.remove();
  });

  it('filters a long list of choices as the author types', async () => {
    const picked: string[] = [];
    const { sheet } = await show(
      {
        head: { kind: 'Scène', name: 'Le quai' },
        groups: [
          {
            id: 'g',
            entries: [
              {
                id: 'move',
                label: 'Déplacer vers le chapitre…',
                choices: choices(12, (id) => picked.push(id)),
              },
            ],
          },
        ],
      },
      { x: 20, y: 20 },
    );
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(within(sheet).getAllByRole('menuitem')).toHaveLength(13));
    await userEvent.keyboard('12');
    await waitFor(() => expect(within(sheet).getAllByRole('menuitem')).toHaveLength(2));
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(within(sheet).getAllByRole('menuitem')).toHaveLength(5));
    await userEvent.keyboard('2{Enter}');
    expect(picked).toEqual(['c12']);
  });

  it('stays open after an entry that asks for a second press', async () => {
    const ran: string[] = [];
    const model = (armed: boolean): ThingMenu => ({
      head: { kind: 'Chapitre', name: 'Nantes' },
      groups: [
        {
          id: 'g',
          entries: [
            { id: 'open', label: 'Ouvrir', run: () => ran.push('open') },
            {
              id: 'trash',
              label: armed ? 'Confirmer' : 'Mettre à la corbeille',
              shortcut: key('Backspace'),
              keys: [parseKeybinding('Backspace', hostPrimary)],
              keepOpen: !armed,
              run: () => ran.push(armed ? 'trashed' : 'armed'),
            },
          ],
        },
      ],
    });
    const { sheet, onChoose } = await show(model(false), { x: 20, y: 20 });
    await userEvent.keyboard('{Backspace}');
    expect(ran).toEqual(['armed']);
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBe(sheet);
  });
});
