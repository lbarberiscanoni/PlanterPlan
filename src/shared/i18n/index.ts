import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import es from './locales/es.json';

// Namespaces live as top-level keys inside the one translation bundle so
// callers can write `t('domain.section.element')` with a single dotted path.
// en-json.test.ts / es-json.test.ts assert each of these exists in en/es.json.
export const NAMESPACES = [
  'common',
  'nav',
  'onboarding',
  'auth',
  'tasks',
  'activity',
  'projects',
  'library',
  'dashboard',
  'settings',
  'notifications',
  'errors',
  'ics',
  'gantt',
  'admin',
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'planterplan.locale',
      caches: ['localStorage'],
    },
  });

export { i18n };

export const SUPPORTED_LOCALES = [
  { code: 'en' as const, label: 'English' },
  { code: 'es' as const, label: 'Español' },
];
