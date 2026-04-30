import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av'
import { Ionicons } from '@expo/vector-icons'
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { useGroupedStories, markStoryViewed } from '../hooks/useGroupedStories'
import { Story } from '../types'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

function formatAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'maintenant'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}j`
}

export default function StoryViewerScreen() {
  const { sellerId } = useLocalSearchParams<{ sellerId: string }>()
  const { sellerGroups, loading } = useGroupedStories()

  const initialSellerIndex = useMemo(() => {
    if (!sellerId || sellerGroups.length === 0) return 0
    const idx = sellerGroups.findIndex((g) => g.sellerId === sellerId)
    return idx >= 0 ? idx : 0
  }, [sellerId, sellerGroups])

  const [currentSellerIndex, setCurrentSellerIndex] = useState(0)
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)

  const videoRef = useRef<Video>(null)
  const detailAnim = useRef(new Animated.Value(0)).current
  const didInit = useRef(false)

  // Initialize current seller from param once loaded
  useEffect(() => {
    if (!didInit.current && sellerGroups.length > 0) {
      setCurrentSellerIndex(initialSellerIndex)
      setCurrentStoryIndex(0)
      didInit.current = true
    }
  }, [sellerGroups, initialSellerIndex])

  const currentSeller = sellerGroups[currentSellerIndex]
  const currentStory: Story | undefined = currentSeller?.stories[currentStoryIndex]

  // Mark viewed when story starts
  useEffect(() => {
    if (currentStory?.id) {
      markStoryViewed(currentStory.id)
    }
    setProgress(0)
    setVideoDuration(null)
  }, [currentStory?.id])

  // Detail overlay animation
  useEffect(() => {
    Animated.spring(detailAnim, {
      toValue: showDetail ? 1 : 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start()
    if (showDetail) setIsPaused(true)
    else setIsPaused(false)
  }, [showDetail])

  const close = useCallback(() => {
    router.back()
  }, [])

  const goNext = useCallback(() => {
    const seller = sellerGroups[currentSellerIndex]
    if (!seller) return close()
    if (currentStoryIndex < seller.stories.length - 1) {
      setCurrentStoryIndex((i) => i + 1)
    } else if (currentSellerIndex < sellerGroups.length - 1) {
      setCurrentSellerIndex((i) => i + 1)
      setCurrentStoryIndex(0)
    } else {
      close()
    }
  }, [currentSellerIndex, currentStoryIndex, sellerGroups, close])

  const goPrev = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((i) => i - 1)
    } else if (currentSellerIndex > 0) {
      const prevIdx = currentSellerIndex - 1
      setCurrentSellerIndex(prevIdx)
      setCurrentStoryIndex(0)
    }
  }, [currentSellerIndex, currentStoryIndex])

  const goNextSeller = useCallback(() => {
    if (currentSellerIndex < sellerGroups.length - 1) {
      setCurrentSellerIndex((i) => i + 1)
      setCurrentStoryIndex(0)
    } else {
      close()
    }
  }, [currentSellerIndex, sellerGroups.length, close])

  const goPrevSeller = useCallback(() => {
    if (currentSellerIndex > 0) {
      setCurrentSellerIndex((i) => i - 1)
      setCurrentStoryIndex(0)
    }
  }, [currentSellerIndex])

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return
      if (status.durationMillis && !videoDuration) {
        setVideoDuration(status.durationMillis)
      }
      if (status.durationMillis && status.durationMillis > 0) {
        setProgress(Math.min(1, status.positionMillis / status.durationMillis))
      }
      if (status.didJustFinish) {
        goNext()
      }
    },
    [goNext, videoDuration]
  )

  // Gestures
  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      const x = e.x
      if (x < SCREEN_WIDTH / 3) {
        runOnJS(goPrev)()
      } else if (x > (SCREEN_WIDTH * 2) / 3) {
        runOnJS(goNext)()
      } else {
        runOnJS(goNext)()
      }
    })

  const longPress = Gesture.LongPress()
    .minDuration(250)
    .onStart(() => {
      runOnJS(setIsPaused)(true)
    })
    .onFinalize(() => {
      runOnJS(setIsPaused)(false)
    })

  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onEnd((e) => {
      const { translationX, translationY } = e
      if (Math.abs(translationX) > Math.abs(translationY)) {
        if (translationX < -50) {
          runOnJS(goNextSeller)()
        } else if (translationX > 50) {
          runOnJS(goPrevSeller)()
        }
      } else {
        if (translationY < -80) {
          runOnJS(setShowDetail)(true)
        } else if (translationY > 80) {
          runOnJS(close)()
        }
      }
    })

  const composed = Gesture.Simultaneous(
    longPress,
    Gesture.Exclusive(panGesture, tapGesture)
  )

  if (loading && sellerGroups.length === 0) {
    return (
      <View style={styles.loading}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color="#00D2B8" />
      </View>
    )
  }

  if (!currentSeller || !currentStory) {
    return (
      <View style={styles.loading}>
        <StatusBar hidden />
        <Text style={styles.emptyText}>Aucune story disponible</Text>
        <TouchableOpacity style={styles.closeBtn2} onPress={close}>
          <Text style={styles.closeBtn2Text}>Fermer</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const detailTranslateY = detailAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  })

  const initial = currentSeller.username.charAt(0).toUpperCase()

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar hidden />

      <GestureDetector gesture={composed}>
        <View style={styles.container}>
          {/* Video */}
          <Video
            ref={videoRef}
            key={currentStory.id}
            source={{ uri: currentStory.video_url }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay={!isPaused && !showDetail}
            isLooping={false}
            isMuted={isMuted}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          />

          {/* Top bar */}
          <View style={styles.topBar} pointerEvents="box-none">
            {/* Progress segments */}
            <View style={styles.progressRow}>
              {currentSeller.stories.map((s, i) => {
                const fill =
                  i < currentStoryIndex ? 1 : i === currentStoryIndex ? progress : 0
                return (
                  <View key={s.id} style={styles.progressSegment}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${fill * 100}%` },
                      ]}
                    />
                  </View>
                )
              })}
            </View>

            {/* Seller row */}
            <View style={styles.sellerRow}>
              <View style={styles.sellerLeft}>
                {currentSeller.avatarUrl ? (
                  <Image
                    source={{ uri: currentSeller.avatarUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  </View>
                )}
                <Text style={styles.username}>{currentSeller.username}</Text>
                <Text style={styles.age}>{formatAge(currentStory.created_at)}</Text>
              </View>
              <View style={styles.topActions}>
                <TouchableOpacity
                  onPress={() => setIsMuted((m) => !m)}
                  hitSlop={10}
                  style={styles.topIconBtn}
                >
                  <Ionicons
                    name={isMuted ? 'volume-mute' : 'volume-high'}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={close} hitSlop={10} style={styles.topIconBtn}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Swipe-up hint */}
          {!showDetail && (
            <View style={styles.swipeHint} pointerEvents="none">
              <Ionicons name="chevron-up" size={22} color="rgba(255,255,255,0.85)" />
              <Text style={styles.swipeHintText}>Voir l'article</Text>
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Detail overlay */}
      <Animated.View
        style={[
          styles.detailOverlay,
          { transform: [{ translateY: detailTranslateY }] },
        ]}
        pointerEvents={showDetail ? 'auto' : 'none'}
      >
        <View style={styles.detailHandle} />
        <TouchableOpacity
          style={styles.detailClose}
          onPress={() => setShowDetail(false)}
          hitSlop={10}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.detailContent}>
          <Text style={styles.detailTitle}>{currentStory.title}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.speedBadge}>
              <Text style={styles.speedBadgeText}>{currentStory.speed_preset}</Text>
            </View>
          </View>

          {currentStory.description ? (
            <Text style={styles.detailDesc}>{currentStory.description}</Text>
          ) : null}

          <View style={styles.priceWrap}>
            <Text style={styles.priceChf}>CHF</Text>
            <Text style={styles.priceValue}>
              {currentStory.current_price_chf.toLocaleString('fr-CH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.buyBtn}
            activeOpacity={0.85}
            onPress={() => {
              setShowDetail(false)
              router.push(`/story/${currentStory.id}`)
            }}
          >
            <Text style={styles.buyBtnText}>Acheter</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loading: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { color: '#fff', fontSize: 15 },
  closeBtn2: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#00D2B8',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  closeBtn2Text: { color: '#00D2B8', fontSize: 14, fontWeight: '600' },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 44,
    paddingHorizontal: 8,
    zIndex: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 12,
  },
  progressSegment: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#fff',
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sellerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatar: { width: 24, height: 24, borderRadius: 12 },
  avatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 11, fontWeight: '700' },
  username: { color: '#fff', fontSize: 13, fontWeight: '600' },
  age: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topIconBtn: { padding: 6 },

  swipeHint: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 2,
  },
  swipeHintText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },

  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  detailHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginBottom: 20,
  },
  detailClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    padding: 8,
    zIndex: 3,
  },
  detailContent: { flex: 1, justifyContent: 'flex-end' },
  detailTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  speedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.15)',
    borderWidth: 1,
    borderColor: '#00D2B8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  speedBadgeText: {
    color: '#00D2B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  detailDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 24,
  },
  priceChf: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  priceValue: {
    color: '#00D2B8',
    fontSize: 40,
    fontWeight: '800',
  },
  buyBtn: {
    backgroundColor: '#00D2B8',
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnText: {
    color: '#0F0F0F',
    fontSize: 16,
    fontWeight: '700',
  },
})
