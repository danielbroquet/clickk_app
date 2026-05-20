import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'
import { safeNavigate } from './navigate'

let initialized = false
let cachedToken: string | null = null
let cachedPermission: 'granted' | 'denied' | 'undetermined' = 'undetermined'

export function getExpoPushToken() {
  return cachedToken
}

export function getNotificationPermission() {
  return cachedPermission
}

export function initializePushNotifications() {
  if (initialized) return
  if (Platform.OS === 'web') return
  initialized = true

  ;(async () => {
    try {
      if (!Device.isDevice) return

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      })

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#00D2B8',
          sound: 'default',
        })
      }

      Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data as Record<string, unknown>
        if (data.story_id) safeNavigate(`/story/${data.story_id}`)
        else if (data.order_id) safeNavigate('/profile/orders')
        else if (data.conversation_id) safeNavigate(`/conversation/${data.conversation_id}`)
      })
    } catch (err) {
      console.warn('[PushNotifications] Init failed:', err)
    }
  })()
}

export async function registerPushTokenForUser(userId: string): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    if (!Device.isDevice) return

    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing as typeof cachedPermission

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status as typeof cachedPermission
    }

    cachedPermission = finalStatus
    if (finalStatus !== 'granted') return

    if (!cachedToken) {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId

      const tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      )
      cachedToken = tokenData.data
    }

    if (cachedToken && userId) {
      await supabase.from('profiles').update({ push_token: cachedToken }).eq('id', userId)
    }
  } catch (err) {
    console.warn('[PushNotifications] Token registration failed:', err)
  }
}

export async function clearPushTokenForUser(userId: string): Promise<void> {
  try {
    await supabase.from('profiles').update({ push_token: null }).eq('id', userId)
  } catch (err) {
    console.warn('[PushNotifications] Token clear failed:', err)
  }
}
