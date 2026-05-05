import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import i18n, { Locale, SUPPORTED_LOCALES, getCurrentLocale, setLocale as setLocaleStorage } from './i18n'

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
  t: (key: string, options?: any) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getCurrentLocale())

  useEffect(() => {
    AsyncStorage.getItem('clickk_locale').then((saved) => {
      if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
        i18n.locale = saved
        setLocaleState(saved as Locale)
      }
    }).catch(() => {})
  }, [])

  const setLocale = useCallback(async (next: Locale) => {
    await setLocaleStorage(next)
    setLocaleState(next)
  }, [])

  const t = useCallback((key: string, options?: any) => i18n.t(key, options), [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
