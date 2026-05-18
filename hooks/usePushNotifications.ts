import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import {
  registerPushTokenForUser,
  clearPushTokenForUser,
  getExpoPushToken,
  getNotificationPermission,
} from '../lib/pushNotificationsService'

type PermissionStatus = 'granted' | 'denied' | 'undetermined'

export interface PushNotificationState {
  expoPushToken: string | null
  notificationPermission: PermissionStatus
}

export function usePushNotifications(userId: string | null): PushNotificationState {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<PermissionStatus>('undetermined')
  const prevUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (Platform.OS === 'web') return

    const prevUserId = prevUserIdRef.current
    prevUserIdRef.current = userId

    if (!userId) {
      if (prevUserId) {
        clearPushTokenForUser(prevUserId)
      }
      return
    }

    const timer = setTimeout(async () => {
      await registerPushTokenForUser(userId)
      setExpoPushToken(getExpoPushToken())
      setNotificationPermission(getNotificationPermission())
    }, 1500)

    return () => clearTimeout(timer)
  }, [userId])

  return { expoPushToken, notificationPermission }
}
