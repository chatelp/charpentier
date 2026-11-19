import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { altLabel, formatBinding, type PrimaryModifier } from '../commands/keybinding';
import { usePlatform } from './platform-context';

/** The host's file manager, as a hint names it (« dans le Finder »). */
export const fileManagerName = (t: TFunction, primary: PrimaryModifier): string =>
  t(primary === 'Meta' ? 'library.fileManager.mac' : 'library.fileManager.other');

/** « (⌘L) » after a sentence, or nothing where the command has no shortcut. */
export const bracketed = (shortcut: string | undefined): string =>
  shortcut ? ` (${shortcut})` : '';

/**
 * The words of a hint that depend on the host: the keys a panel handles
 * itself (not a command's: those come from the registry), as the host's
 * keyboard names them, and the name of its file manager.
 */
export function useHostWords(): {
  /** `Mod-Enter` → `⌘⏎` on macOS, `Ctrl+⏎` elsewhere. */
  key(binding: string): string;
  readonly alt: string;
  readonly fileManager: string;
} {
  const primary = usePlatform().keybindings.primaryModifier;
  const { t } = useTranslation();
  return useMemo(
    () => ({
      key: (binding: string) => formatBinding(binding, primary),
      alt: altLabel(primary),
      fileManager: fileManagerName(t, primary),
    }),
    [primary, t],
  );
}
