import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';

/** UI languages shipped with the app. The book's own language is a project setting. */
export const uiLanguages = ['fr'] as const;
export type UiLanguage = (typeof uiLanguages)[number];

export const resources = { fr: { translation: fr } } as const;

/**
 * Creates an isolated i18next instance (no global singleton, so tests and
 * several app instances never share state).
 */
export async function createI18n(language: UiLanguage = 'fr'): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    // A copy: i18next merges the features' texts into its resources, which
    // must never reach the catalogue module itself (checked against it).
    resources: structuredClone(resources),
    lng: language,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false }, // React already escapes.
    returnNull: false,
  });
  return instance;
}
