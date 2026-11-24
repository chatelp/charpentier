import type { Platform } from '@charpentier/platform';
import { render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import { App } from '../app/App';
import { COMMAND_EVENT, type CommandAnnouncement } from '../commands/announce';
import type { PrimaryModifier } from '../commands/keybinding';
import type { Feature } from '../features/feature';
import { createI18n } from '../i18n/i18n';
import { createTestPlatform } from '../testing/test-platform';

/**
 * The app as the conformance tests start it (docs/DESIGN.md §5.0, docs/PLAN.md 7.6): a new
 * project, already welcomed, with the styles the host brings (each test imports
 * `../styles/base.css`: without them surfaces overlap and a real mouse proves nothing).
 */
export async function startApp(
  options: {
    readonly primary?: PrimaryModifier;
    readonly reserved?: readonly string[];
    readonly features?: readonly Feature[];
    readonly platform?: Partial<Platform>;
  } = {},
) {
  const prefs = new Map<string, unknown>([['welcomed', true]]);
  const docs = new Map<string, Y.Doc>();
  const platform = createTestPlatform({
    keybindings: {
      primaryModifier: options.primary ?? hostPrimary,
      reserved: [...(options.reserved ?? [])],
    },
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
    ...options.platform,
  });
  render(
    <App
      platform={platform}
      i18n={await createI18n('fr')}
      {...(options.features && { features: options.features })}
    />,
  );
  const editor = await screen.findByRole('textbox', { name: 'Texte de la scène' });
  return { platform, editor, docs, prefs };
}

export const hostPrimary: PrimaryModifier = /Mac/.test(navigator.platform) ? 'Meta' : 'Control';

/**
 * Listens to the commands the app announces. With `hold`, they are heard and not run: a test
 * can press every shortcut in one app without living with what each does.
 */
export function listenToCommands(hold = false) {
  const heard: CommandAnnouncement[] = [];
  const onCommand = (event: Event) => {
    heard.push((event as CustomEvent<CommandAnnouncement>).detail);
    if (hold) event.preventDefault();
  };
  window.addEventListener(COMMAND_EVENT, onCommand);
  return {
    heard,
    take: () => heard.splice(0),
    stop: () => window.removeEventListener(COMMAND_EVENT, onCommand),
  };
}
