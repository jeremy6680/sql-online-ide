import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'

// Read the persisted language from localStorage before React mounts so the
// first render already uses the correct language (avoids a flash of English).
function getPersistedLanguage(): 'en' | 'fr' {
  try {
    const raw = localStorage.getItem('sql-ide-storage')
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { language?: string } }
      if (parsed?.state?.language === 'fr') return 'fr'
    }
  } catch {
    // ignore
  }
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: getPersistedLanguage(),
    fallbackLng: 'en',
    interpolation: {
      // React already handles XSS escaping
      escapeValue: false,
    },
  })

export default i18n
