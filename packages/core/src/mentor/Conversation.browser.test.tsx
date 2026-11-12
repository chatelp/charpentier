import { addChatMessage, agentOrigin, chatMessages, guids } from '@charpentier/schema';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { App } from '../app/App';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

afterEach(cleanup);

const isMac = /Mac/.test(navigator.platform);

describe('conversation with the Compagnon', () => {
  it('asks a question, shows the answer and inserts the example sentence on request', async () => {
    const prefs = new Map<string, unknown>();
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
      agents: {
        status: () => 'available',
        onStatusChange: () => () => {},
        setApiKey: async () => 'saved',
        forgetApiKey: async () => {},
        // What the main process does: answer in the mentor document.
        ask: async ({ projectId }) => {
          const mentor = doc(guids.mentor(projectId));
          const question = chatMessages(mentor).at(-1)?.text ?? '';
          addChatMessage(
            mentor,
            {
              role: 'compagnon',
              text: `Vous demandez : « ${question} ». Que veut Hélène ?`,
              example: 'Hélène serra la rambarde jusqu’à blanchir ses doigts.',
            },
            agentOrigin('chat'),
          );
          return 'answered';
        },
      },
    });
    render(<App platform={platform} i18n={await createI18n('fr')} />);
    const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    await userEvent.keyboard('Il pleuvait. ');

    await userEvent.keyboard('{ControlOrMeta>}k{/ControlOrMeta}');
    await userEvent.keyboard('parler au compagnon{Enter}');
    const field = await screen.findByRole('textbox', { name: 'Votre question au Compagnon' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    await userEvent.keyboard('Comment rendre Hélène vivante ?{Enter}');

    const log = screen.getByRole('log');
    await waitFor(() => expect(log.textContent).toContain('Que veut Hélène ?'));
    expect(within(log).getByText('Comment rendre Hélène vivante ?')).toBeTruthy();
    expect(within(log).getByText('Exemple · une phrase')).toBeTruthy();

    await userEvent.keyboard('{ControlOrMeta>}{Enter}{/ControlOrMeta}');
    await waitFor(() =>
      expect(editor.textContent).toBe(
        'Il pleuvait. Hélène serra la rambarde jusqu’à blanchir ses doigts.',
      ),
    );
  });
});
