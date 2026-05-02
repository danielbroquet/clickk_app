import React, { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated'

export interface SaleToastPayload {
  id: string
  username: string
  priceChf: number
}

export function SaleToast({
  payload,
  onDismiss,
}: {
  payload: SaleToastPayload
  onDismiss: () => void
}) {
  const translateY = useSharedValue(-80)
  const opacity = useSharedValue(0)

  useEffect(() => {
    translateY.value = withSequence(
      withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }),
      withDelay(2200, withTiming(-80, { duration: 320, easing: Easing.in(Easing.cubic) }))
    )
    opacity.value = withSequence(
      withTiming(1, { duration: 220 }),
      withDelay(
        2200,
        withTiming(0, { duration: 320 }, (done) => {
          if (done) runOnJS(onDismiss)()
        })
      )
    )
  }, [payload.id, translateY, opacity, onDismiss])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  return (
    <SafeAreaView edges={['top']} style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.toast, animatedStyle]}>
        <View style={styles.iconBubble}>
          <Ionicons name="flash" size={14} color="#0F0F0F" />
        </View>
        <Text style={styles.text} numberOfLines={1}>
          <Text style={styles.username}>@{payload.username}</Text>
          <Text> a acheté à </Text>
          <Text style={styles.price}>CHF {payload.priceChf.toFixed(2)}</Text>
        </Text>
      </Animated.View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(26,26,26,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    maxWidth: '92%',
  },
  iconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#00D2B8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { color: '#FFFFFF', fontSize: 13, flexShrink: 1 },
  username: { fontWeight: '700' },
  price: { color: '#00D2B8', fontWeight: '700' },
})
