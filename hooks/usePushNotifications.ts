import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

// expo-notifications is a native-only module — not available on web.
// All push logic is skipped on web.

export function usePushNotifications(userId: string | null) {
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return

    let cancelled = false

    async function setup() {
      try {
        // Dynamic import so the web bundle never references this module
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

        const { status: existing } = await Notifications.getPermissionsAsync()
        let finalStatus = existing
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync()
          finalStatus = status
        }

        if (finalStatus !== 'granted' || cancelled) return

        const tokenData = await Notifications.getExpoPushTokenAsync()
        const token = tokenData.data

        if (!cancelled && token) {
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
      } catch {
        // expo-notifications not available in this environment
      }
    }

    setup()

    return () => {
      cancelled = true
      cleanupRef.current?.()
    }
  }, [userId])
}
