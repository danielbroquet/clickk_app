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
    if (!userId) return

    let cancelled = false

    // Defer setup so login navigation/state transitions can settle first.
    // Without this delay, iOS may terminate the app due to concurrent
    // native operations (permission prompt, APNs token fetch, navigation).
    const startTimer = setTimeout(() => { setup() }, 2000)

    async function setup() {
      if (cancelled) return
      try {
        const Device = await import('expo-device')

        if (!Device.isDevice) {
          return
        }

        if (cancelled) return
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

        // Persist token to profile if user is logged in
        if (userId && token) {
          await supabase.from('profiles').update({ push_token: token }).eq('id', userId)
        }

        const { safeNavigate } = await import('../lib/navigate')

        const sub = Notifications.addNotificationResponseReceivedListener(response => {
          const data = response.notification.request.content.data as Record<string, unknown>
          if (data.story_id) safeNavigate(`/story/${data.story_id}`)
          else if (data.order_id) safeNavigate('/profile/orders')
          else if (data.conversation_id) safeNavigate(`/conversation/${data.conversation_id}`)
        })

        cleanupRef.current = () => sub.remove()
      } catch (err) {
        console.warn('[PushNotifications] Setup failed:', err)
      }
    }

    return () => {
      cancelled = true
      clearTimeout(startTimer)
      cleanupRef.current?.()
    }
  }, [userId])

  return { expoPushToken, notificationPermission }
}
