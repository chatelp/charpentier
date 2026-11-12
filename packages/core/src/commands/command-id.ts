import type fr from '../i18n/locales/fr.json';

/** Command ids are the keys of `commands` in the catalogue: every command has a title. */
export type CommandId = keyof (typeof fr)['commands'];
