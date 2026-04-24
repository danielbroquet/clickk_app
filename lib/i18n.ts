import { getLocales } from 'expo-localization'
import { I18n } from 'i18n-js'
import fr from '../locales/fr'
import de from '../locales/de'
import it from '../locales/it'
import en from '../locales/en'

const i18n = new I18n({ fr, de, it, en })
i18n.enableFallback = true
i18n.defaultLocale = 'fr'

const deviceLocale = getLocales()[0]?.languageCode ?? 'fr'
i18n.locale = ['fr', 'de', 'it'].includes(deviceLocale)
  ? deviceLocale
  : 'fr'

export default i18n
