import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SupportedStorage } from '@supabase/supabase-js'

// AsyncStorage v3 on iOS requires the New Architecture native module.
// This adapter falls back to an in-memory store when AsyncStorage is unavailable,
// which prevents the "Native module is null" crash on older builds.
function makeStorage(): SupportedStorage {
  const mem: Record<string, string> = {}

  if (Platform.OS === 'web') {
    return {
      getItem: (key) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key, value) => Promise.resolve(localStorage.setItem(key, value)),
      removeItem: (key) => Promise.resolve(localStorage.removeItem(key)),
    }
  }

  return {
    getItem: async (key) => {
      try {
        return await AsyncStorage.getItem(key)
      } catch {
        return mem[key] ?? null
      }
    },
    setItem: async (key, value) => {
      try {
        await AsyncStorage.setItem(key, value)
      } catch {
        mem[key] = value
      }
    },
    removeItem: async (key) => {
      try {
        await AsyncStorage.removeItem(key)
      } catch {
        delete mem[key]
      }
    },
  }
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: makeStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  }
)
