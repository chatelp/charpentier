import 'i18next';
import type fr from './locales/fr.json';

// Makes every t('…') key type-checked against the French catalogue.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof fr };
  }
}
