import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import { I18n } from 'i18n-js'
import fr from '../locales/fr'
import de from '../locales/de'
import it from '../locales/it'
import en from '../locales/en'

export type Locale = 'fr' | 'de' | 'it' | 'en'
export const SUPPORTED_LOCALES: Locale[] = ['fr', 'de', 'it', 'en']

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  en: 'English',
}

export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  en: '🇬🇧',
}

const STORAGE_KEY = 'clickk_locale'

const i18n = new I18n({ fr, de, it, en })
i18n.enableFallback = true
i18n.defaultLocale = 'fr'

const deviceLocale = getLocales()[0]?.languageCode ?? 'fr'
const isSupported = (l: string): l is Locale =>
  SUPPORTED_LOCALES.includes(l as Locale)

i18n.locale = isSupported(deviceLocale) ? deviceLocale : 'fr'

AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
  if (saved && isSupported(saved)) {
    i18n.locale = saved
    notifyLocaleChange(saved)
  }
}).catch(() => {})

type LocaleListener = (locale: Locale) => void
const listeners = new Set<LocaleListener>()

export function subscribeLocale(fn: LocaleListener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function notifyLocaleChange(locale: Locale) {
  listeners.forEach(fn => fn(locale))
}

export async function setLocale(locale: Locale): Promise<void> {
  i18n.locale = locale
  await AsyncStorage.setItem(STORAGE_KEY, locale)
  notifyLocaleChange(locale)
}

export function getCurrentLocale(): Locale {
  return i18n.locale as Locale
}

export function useTranslation() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = subscribeLocale(() => setTick(t => t + 1))
    return unsub
  }, [])

  return {
    t: (key: string, options?: any) => i18n.t(key, options),
    locale: i18n.locale as Locale,
  }
}

export default i18n
