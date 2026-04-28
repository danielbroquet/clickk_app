import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily } from '../../lib/theme'

function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    if (Platform.OS !== 'web') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

export default function NetworkBanner() {
  const isOnline = useNetworkStatus()
  const [visible, setVisible] = useState(false)
  const translateY = useRef(new Animated.Value(-60)).current
  const wasOffline = useRef(false)

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
      // Show "back online" briefly then hide
      setVisible(true)
      Animated.sequence([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.delay(2200),
        Animated.timing(translateY, { toValue: -60, duration: 280, useNativeDriver: true }),
      ]).start(() => {
        setVisible(false)
        wasOffline.current = false
      })
    }
  }, [isOnline])

  if (!visible) return null

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY }] }, !isOnline && styles.bannerOffline]}
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
    paddingVertical: 8,
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
