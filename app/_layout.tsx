import { useEffect, useRef, useState } from 'react'
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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { AuthProvider, useAuth } from '../lib/auth'
import { StripeWrapper } from '../lib/StripeWrapper'
import { useFrameworkReady } from '@/hooks/useFrameworkReady'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { ONBOARDING_KEY } from './onboarding'
import NetworkBanner from '../components/ui/NetworkBanner'

SplashScreen.preventAutoHideAsync()

function RootRedirector() {
  const { session, loading } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(true)
  const redirectedRef = useRef(false)

  const { expoPushToken, notificationPermission } = usePushNotifications(session?.user?.id ?? null)
  // Token is logged inside the hook on acquisition; log permission status here for diagnostics
  useEffect(() => {
    if (notificationPermission !== 'undetermined') {
      console.log('[PushNotifications] Permission:', notificationPermission, '| Token:', expoPushToken)
    }
  }, [expoPushToken, notificationPermission])

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(val => {
      setOnboardingDone(val === 'true')
      setOnboardingChecked(true)
    })
  }, [])

  useEffect(() => {
    if (loading || !onboardingChecked) return

    const inOnboarding = segments[0] === 'onboarding'
    const inAuthGroup = segments[0] === '(auth)'

    // First launch: show onboarding (only redirect once)
    if (!onboardingDone && !inOnboarding && !redirectedRef.current) {
      redirectedRef.current = true
      router.replace('/onboarding')
      return
    }

    const inProtectedRoute = !inAuthGroup && !inOnboarding

    if (!session && inProtectedRoute) {
      router.replace('/(auth)/login')
    } else if (session && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)')
    }
  }, [session, loading, segments, onboardingChecked, onboardingDone])

  if (loading || !onboardingChecked) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="become-seller" />
      <Stack.Screen name="wallet/index" />
      <Stack.Screen name="(seller)/listings" />
      <Stack.Screen name="story/create" />
      <Stack.Screen name="listing/create" />
      <Stack.Screen name="profile/payment-methods" />
      <Stack.Screen name="profile/orders" />
      <Stack.Screen name="profile/about" />
      <Stack.Screen name="profile/[id]" />
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeWrapper>
        <AuthProvider>
          <StatusBar style="light" backgroundColor="#0F0F0F" />
          <View style={{ flex: 1 }}>
            <RootRedirector />
            <NetworkBanner />
          </View>
        </AuthProvider>
      </StripeWrapper>
    </GestureHandlerRootView>
  )
}
