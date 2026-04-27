import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from '@expo-google-fonts/montserrat'
import { AuthProvider, useAuth } from '../lib/auth'
import { useFrameworkReady } from '@/hooks/useFrameworkReady'

SplashScreen.preventAutoHideAsync()

const PROTECTED_SEGMENTS = ['(tabs)', 'become-seller', 'wallet', 'story', 'listing']

function RootRedirector() {
  const { session, loading } = useAuth()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const inProtectedRoute = !inAuthGroup

    if (!session && inProtectedRoute) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [session, loading, segments])

  if (loading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="become-seller" />
      <Stack.Screen name="wallet/index" />
      <Stack.Screen name="story/create" />
      <Stack.Screen name="listing/create" />
      <Stack.Screen name="profile/payment-methods" />
      <Stack.Screen name="profile/orders" />
    </Stack>
  )
}

export default function RootLayout() {
  useFrameworkReady()

  const [fontsLoaded, fontError] = useFonts({
    'Montserrat-Regular': Montserrat_400Regular,
    'Montserrat-Medium': Montserrat_500Medium,
    'Montserrat-SemiBold': Montserrat_600SemiBold,
    'Montserrat-Bold': Montserrat_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#0F0F0F" />
      <RootRedirector />
    </AuthProvider>
  )
}
