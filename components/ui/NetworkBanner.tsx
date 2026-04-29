import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, StyleSheet, Text } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontFamily } from '../../lib/theme'

const BANNER_HEIGHT = 36

function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      setIsOnline(navigator.onLine)
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }

    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected === true && state.isInternetReachable !== false
      setIsOnline(online)
    })

    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected === true && state.isInternetReachable !== false)
    })

    return unsubscribe
  }, [])

  return isOnline
}

export default function NetworkBanner() {
  const isOnline = useNetworkStatus()
  const [visible, setVisible] = useState(false)
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current
  const wasOffline = useRef(false)
  const insets = useSafeAreaInsets()

  const topPadding = Platform.OS === 'android' ? insets.top + 4 : insets.top

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
      setVisible(true)
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start()
    } else if (wasOffline.current) {
      setVisible(true)
      Animated.sequence([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.delay(2200),
        Animated.timing(translateY, { toValue: -BANNER_HEIGHT, duration: 280, useNativeDriver: true }),
      ]).start(() => {
        setVisible(false)
        wasOffline.current = false
      })
    }
  }, [isOnline])

  if (!visible) return null

  return (
    <Animated.View
      style={[
        styles.banner,
        !isOnline && styles.bannerOffline,
        { transform: [{ translateY }], paddingTop: topPadding },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={isOnline ? 'wifi' : 'wifi-outline'}
        size={14}
        color="#fff"
      />
      <Text style={styles.text}>
        {isOnline ? 'Connexion rétablie' : 'Pas de connexion internet'}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 8,
    zIndex: 9999,
  },
  bannerOffline: {
    backgroundColor: '#EF4444',
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: '#fff',
  },
})
