import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

type PermissionStatus = 'granted' | 'denied' | 'undetermined'

export interface PushNotificationState {
  expoPushToken: string | null
  notificationPermission: PermissionStatus
}

export function usePushNotifications(userId: string | null): PushNotificationState {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<PermissionStatus>('undetermined')
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (Platform.OS === 'web') return

    let cancelled = false

    async function setup() {
      try {
        const Device = await import('expo-device')

        if (!Device.isDevice) {
          // Physical device required for push notifications
          return
        }

        const Notifications = await import('expo-notifications')

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        })

        // Android: create default channel before requesting permissions
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#00D2B8',
            sound: 'default',
          })
        }

        const { status: existing } = await Notifications.getPermissionsAsync()
        let finalStatus: PermissionStatus = existing as PermissionStatus

        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync()
          finalStatus = status as PermissionStatus
        }

        if (cancelled) return

        setNotificationPermission(finalStatus)

        if (finalStatus !== 'granted') return

        const Constants = await import('expo-constants')
        const projectId =
          Constants.default.expoConfig?.extra?.eas?.projectId ??
          Constants.default.easConfig?.projectId

        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        )
        const token = tokenData.data

        if (cancelled) return

        setExpoPushToken(token)
        console.log('[PushNotifications] Expo push token:', token)

        // Persist token to profile if user is logged in
        if (userId && token) {
          await supabase.from('profiles').update({ push_token: token }).eq('id', userId)
        }

        const { router } = await import('expo-router')

        const sub = Notifications.addNotificationResponseReceivedListener(response => {
          const data = response.notification.request.content.data as Record<string, unknown>
          if (data.story_id) router.push(`/story/${data.story_id}`)
          else if (data.order_id) router.push('/profile/orders')
          else if (data.conversation_id) router.push(`/conversation/${data.conversation_id}`)
        })

        cleanupRef.current = () => sub.remove()
      } catch (err) {
        console.warn('[PushNotifications] Setup failed:', err)
      }
    }

    setup()

    return () => {
      cancelled = true
      cleanupRef.current?.()
    }
  }, [userId])

  return { expoPushToken, notificationPermission }
}
