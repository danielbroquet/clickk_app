import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Story } from '../../types'
import { fontFamily } from '../../lib/theme'
import { useStoryPurchase } from '../../lib/stripe'
import { useStoryPrice } from '../../hooks/useStoryPrice'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface StoriesViewerProps {
  story: Story | null
  visible: boolean
  onClose: () => void
}

export default function StoriesViewer({ story, visible, onClose }: StoriesViewerProps) {
  const insets = useSafeAreaInsets()
  const [countdown, setCountdown] = useState(10)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { handlePurchase, purchasing, purchaseError, purchased } = useStoryPurchase()

  const currentPrice = useStoryPrice(
    story?.id ?? '',
    story?.current_price_chf ?? 0
  )

  const pulseOpacity = useSharedValue(1)

  useEffect(() => {
    if (story?.status === 'active' && visible) {
      pulseOpacity.value = withRepeat(
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    } else {
      pulseOpacity.value = 1
    }
  }, [story?.status, visible])

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }))

  // Initialise le countdown correctement depuis last_drop_at
  useEffect(() => {
    if (!story || !visible) return

    const computeInitial = () => {
      const elapsed = (Date.now() - new Date(story.last_drop_at).getTime()) / 1000
      return Math.max(0, Math.ceil(story.price_drop_seconds - elapsed))
    }

    setCountdown(computeInitial())

    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return story.price_drop_seconds
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [story?.id, visible])

  // Remet le countdown à zéro quand le prix change via Realtime
  useEffect(() => {
    if (story?.price_drop_seconds && visible) {
      setCountdown(story.price_drop_seconds)
    }
  }, [currentPrice])

  if (!story) return null

  const floor = story.floor_price_chf ?? 0
  const range = story.start_price_chf - floor
  const progress = range > 0 ? (currentPrice - floor) / range : 0
  const progressColor = progress > 0.6 ? '#10B981' : progress > 0.3 ? '#F59E0B' : '#EF4444'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {story.video_url ? (
          <Image
            source={{ uri: story.video_url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1A1A1A' }]} />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={styles.gradientTop}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.gradientBottom}
        />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.sellerRow}>
            <View style={styles.avatarWrap}>
              {story.video_url ? (
                <Image source={{ uri: story.video_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#2A2A2A' }]} />
              )}
            </View>
            <View style={{ marginLeft: 10 }}>
              <View style={styles.nameRow}>
                <Text style={styles.sellerName}>{story.seller?.username ?? ''}</Text>
                {story.seller?.is_verified && (
                  <Ionicons name="checkmark-circle" size={16} color="#00D2B8" style={{ marginLeft: 4 }} />
                )}
              </View>
              <Text style={styles.timeAgo}>il y a 2m</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="share-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Central price */}
        <View style={styles.priceCenter}>
          <Animated.Text style={[styles.priceText, pulseStyle]}>
            CHF {Math.round(currentPrice)}
          </Animated.Text>
          <View style={styles.progressWrap}>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%` as any, backgroundColor: progressColor },
                ]}
              />
            </View>
          </View>
          <Text style={styles.countdownText}>
            PROCHAIN DROP DANS {countdown}S
          </Text>
        </View>

        {/* Buy button */}
        <View style={[styles.buyWrap, { paddingBottom: insets.bottom + 20 }]}>
          {purchaseError && (
            <Text style={styles.errorText}>{purchaseError}</Text>
          )}

          {purchased ? (
            <View style={styles.successBtn}>
              <Text style={styles.buyBtnText}>✓ Achat confirmé !</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.buyBtn, purchasing && styles.buyBtnDisabled]}
              activeOpacity={0.85}
              onPress={() => handlePurchase(story.id, currentPrice, onClose)}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator color="#0F0F0F" />
              ) : (
                <Text style={styles.buyBtnText}>
                  J'achète ! — CHF {Math.round(currentPrice)}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <Text style={styles.branding}>clickk  »»</Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sellerRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatarWrap: {
    borderWidth: 2,
    borderColor: '#00D2B8',
    borderRadius: 24,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  sellerName: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#FFFFFF' },
  timeAgo: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 8,
  },
  priceCenter: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  priceText: {
    fontFamily: fontFamily.bold,
    fontSize: 80,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -2,
  },
  progressWrap: { marginTop: 16, width: 280, alignSelf: 'center' },
  progressBg: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  countdownText: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontFamily: fontFamily.medium,
  },
  buyWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#EF4444',
    marginBottom: 8,
  },
  buyBtn: {
    backgroundColor: '#00D2B8',
    borderRadius: 16,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnDisabled: { opacity: 0.7 },
  successBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnText: { fontFamily: fontFamily.bold, fontSize: 18, color: '#0F0F0F' },
  branding: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 10,
  },
})