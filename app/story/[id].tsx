import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
} from 'react-native'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing as ReaEasing,
  runOnJS,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Video, ResizeMode } from 'expo-av'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { Platform, Dimensions } from 'react-native'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useStoryPurchase } from '../../lib/stripe'
import { getSellerStories } from '../../hooks/useGroupedStories'
import i18n from '../../lib/i18n'

const C = {
  bg: '#0F0F0F',
  primary: '#00D2B8',
  surface: '#1A1A1A',
  text: '#FFFFFF',
  muted: '#717976',
  danger: '#FF4757',
  warn: '#FFA502',
  border: '#2A2A2A',
}

interface StoryData {
  id: string
  seller_id: string
  title: string
  description: string | null
  video_url: string
  start_price_chf: number
  floor_price_chf: number
  current_price_chf: number
  final_price_chf: number | null
  price_drop_seconds: number
  last_drop_at: string
  speed_preset: 'SLOW' | 'STANDARD' | 'FAST'
  expires_at: string
  created_at: string
  status: string
  buyer_id: string | null
  video_duration_seconds: number | null
  thumbnail_url: string | null
}

interface SellerProfile {
  username: string
  avatar_url: string | null
}

function formatHHMMSS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function computePrice(story: StoryData): number {
  const totalMs = new Date(story.expires_at).getTime() - new Date(story.created_at).getTime()
  const elapsedMs = Date.now() - new Date(story.created_at).getTime()
  const ratio = Math.min(Math.max(elapsedMs / totalMs, 0), 1)
  return Math.max(
    story.start_price_chf - (story.start_price_chf - story.floor_price_chf) * ratio,
    story.floor_price_chf
  )
}

function computeRatio(story: StoryData): number {
  const totalMs = new Date(story.expires_at).getTime() - new Date(story.created_at).getTime()
  const elapsedMs = Date.now() - new Date(story.created_at).getTime()
  return Math.min(Math.max(elapsedMs / totalMs, 0), 1)
}

function computeExpiry(story: StoryData): number {
  return Math.max(0, (new Date(story.expires_at).getTime() - Date.now()) / 1000)
}

function formatPriceFR(n: number) {
  return n.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const THROTTLE_MS = 250

// Subscribe React state to a SharedValue, rate-limited to THROTTLE_MS.
function useThrottledSharedValue<T>(
  sv: SharedValue<T>,
  map: (v: T) => T = (v) => v,
): T {
  const [value, setValue] = useState<T>(() => map(sv.value))
  const lastAtRef = useRef<number>(0)
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useAnimatedReaction(
    () => sv.value,
    (curr, prev) => {
      if (curr === prev) return
      runOnJS(scheduleUpdate)(curr)
    },
    [],
  )

  function scheduleUpdate(curr: T) {
    const now = Date.now()
    const elapsed = now - lastAtRef.current
    const mapped = map(curr)
    if (elapsed >= THROTTLE_MS) {
      lastAtRef.current = now
      setValue(mapped)
      if (pendingRef.current) {
        clearTimeout(pendingRef.current)
        pendingRef.current = null
      }
    } else if (!pendingRef.current) {
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null
        lastAtRef.current = Date.now()
        setValue(map(sv.value))
      }, THROTTLE_MS - elapsed)
    }
  }

  useEffect(() => {
    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current)
    }
  }, [])

  return value
}

// ── Price display driven by shared values via throttled React state ────────

interface PriceDisplayProps {
  priceSV: SharedValue<number>
  priceRatioSV: SharedValue<number>
}

const PriceDisplay = memo(function PriceDisplay({ priceSV, priceRatioSV }: PriceDisplayProps) {
  const price = useThrottledSharedValue(priceSV)
  const priceRatio = useThrottledSharedValue(priceRatioSV)
  const color = priceRatio > 0.6 ? '#00D2B8' : priceRatio > 0.3 ? '#F59E0B' : '#EF4444'
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.priceChfLabel}>CHF</Text>
      <Text style={[styles.priceBig, { color }]}>{formatPriceFR(price)}</Text>
    </View>
  )
})

const SavingsRow = memo(function SavingsRow({
  priceSV,
  startPrice,
}: {
  priceSV: SharedValue<number>
  startPrice: number
}) {
  const price = useThrottledSharedValue(priceSV)
  const pct = Math.round((1 - price / startPrice) * 100)
  if (pct <= 0) return null
  return (
    <View style={styles.savingsRow}>
      <Text style={styles.savingsStrike}>CHF {startPrice.toLocaleString('fr-CH')}</Text>
      <View style={styles.savingsBadge}>
        <Text style={styles.savingsBadgeText}>-{pct}%</Text>
      </View>
    </View>
  )
})

const ProgressBarFill = memo(function ProgressBarFill({
  progressSV,
}: {
  progressSV: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => {
    const r = progressSV.value
    const color = r > 0.6 ? '#EF4444' : r > 0.3 ? '#F59E0B' : '#00D2B8'
    return {
      width: `${Math.min(100, Math.max(0, r * 100))}%`,
      backgroundColor: color,
    }
  })
  return <Reanimated.View style={[styles.priceProgressFill, style]} />
})

const ExpiryRow = memo(function ExpiryRow({
  expiresRemainingSV,
}: {
  expiresRemainingSV: SharedValue<number>
}) {
  const expiresRemaining = useThrottledSharedValue(expiresRemainingSV)
  const color = expiresRemaining < 3600 ? C.danger : C.muted
  return (
    <View style={styles.expiryRow}>
      <Ionicons name="time-outline" size={12} color={color} />
      <Text style={[styles.expiryText, { color }]}>
        {i18n.t('story.viewer.expires_in')} {formatHHMMSS(expiresRemaining)}
      </Text>
    </View>
  )
})

const CtaLabel = memo(function CtaLabel({
  priceSV,
  prefix,
  style,
}: {
  priceSV: SharedValue<number>
  prefix: string
  style: any
}) {
  const price = useThrottledSharedValue(priceSV)
  return <Text style={style}>{`${prefix}${formatPriceFR(price)}`}</Text>
})

const DetailTimeRemaining = memo(function DetailTimeRemaining({
  expiresRemainingSV,
  style,
}: {
  expiresRemainingSV: SharedValue<number>
  style: any
}) {
  const s = useThrottledSharedValue(expiresRemainingSV)
  const text = s > 0
    ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s restantes`
    : 'Expiré'
  return <Text style={style}>{text}</Text>
})

const NeighbourPreview = memo(function NeighbourPreview({
  preview,
}: {
  preview: { thumbnail_url: string | null; video_url: string | null } | null
}) {
  const uri = preview?.thumbnail_url ?? null
  if (!uri) {
    return <View style={styles.neighbourPlaceholder} />
  }
  return (
    <Image
      source={{ uri }}
      style={styles.neighbourPreviewImage}
      resizeMode="cover"
    />
  )
})

export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{
    id: string
    sellerStoryIds?: string
    allSellerIds?: string
  }>()
  const initialId = params.id
  const initialSellerStoryIds: string[] = useMemo(() => {
    if (!params.sellerStoryIds) return initialId ? [initialId] : []
    try {
      const parsed = JSON.parse(params.sellerStoryIds)
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : initialId ? [initialId] : []
    } catch {
      return initialId ? [initialId] : []
    }
    // initial-only: only derived once, never recomputed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const allSellerIds: string[] = useMemo(() => {
    if (!params.allSellerIds) return []
    try {
      const parsed = JSON.parse(params.allSellerIds)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Internal state — navigation between sellers/stories mutates these
  // instead of calling router.replace(), so StoryViewerScreen never remounts.
  const [sellerStoryIds, setSellerStoryIds] = useState<string[]>(initialSellerStoryIds)
  const [currentIndex, setCurrentIndex] = useState<number>(() =>
    Math.max(0, initialSellerStoryIds.indexOf(initialId)),
  )
  const id = sellerStoryIds[currentIndex] ?? initialId

  const insets = useSafeAreaInsets()
  const { session } = useAuth()

  // Cache full story lists per seller so seller-to-seller nav is instant.
  const sellerStoriesCacheRef = useRef<Map<string, string[]>>(new Map())

  const goToStoryAt = useCallback((nextIdx: number) => {
    setSellerStoryIds((prev) => {
      if (nextIdx < 0 || nextIdx >= prev.length) return prev
      setCurrentIndex(nextIdx)
      router.setParams({ id: prev[nextIdx] })
      return prev
    })
  }, [])

  const goToSellerAt = useCallback(async (nextSellerIdx: number) => {
    if (nextSellerIdx < 0 || nextSellerIdx >= allSellerIds.length) return
    const nextSellerId = allSellerIds[nextSellerIdx]
    let ids = sellerStoriesCacheRef.current.get(nextSellerId)
    if (!ids) {
      const stories = await getSellerStories(nextSellerId)
      if (stories.length === 0) return
      ids = stories.map((s) => s.id)
      sellerStoriesCacheRef.current.set(nextSellerId, ids)
    }
    setSellerStoryIds(ids)
    setCurrentIndex(0)
    router.setParams({ id: ids[0] })
  }, [allSellerIds])

  const [story, setStory] = useState<StoryData | null>(null)
  const [seller, setSeller] = useState<SellerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  // UI-thread driven price/time state — no React re-render per tick
  const currentPriceSV = useSharedValue(0)
  const expiresRemainingSV = useSharedValue(0)
  // timeRatio: 0 = just started (full price), 1 = expired (floor)
  const timeRatioSV = useSharedValue(0)
  // priceRatio: 1 = at start price, 0 = at floor
  const priceRatioSV = useSharedValue(1)
  const nearFloorSV = useSharedValue(0) // 0 | 1, as number for worklet use
  // Mirror a few values to React state only when they actually matter
  // for re-rendering (e.g. gating CTA label / showing the floor banner).
  const [nearFloor, setNearFloor] = useState(false)

  const storyRef = useRef<StoryData | null>(null)
  const allSellerIdsRef = useRef<string[]>(allSellerIds)
  allSellerIdsRef.current = allSellerIds

  const [isPaused, setIsPaused] = useState(false)

  const [showDetail, setShowDetail] = useState(false)
  const detailAnim = useRef(new Animated.Value(0)).current

  const openDetail = () => {
    setShowDetail(true)
    setIsPaused(true)
    Animated.spring(detailAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 12 }).start()
  }
  const closeDetail = () => {
    Animated.spring(detailAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 14 }).start(() => {
      setShowDetail(false)
      setIsPaused(false)
    })
  }

  const goToSellerAtRef = useRef(goToSellerAt)
  goToSellerAtRef.current = goToSellerAt

  const openDetailRef = useRef(openDetail)
  openDetailRef.current = openDetail

  const [modalVisible, setModalVisible] = useState(false)
  const [snapshotPrice, setSnapshotPrice] = useState(0)

  // Funnel buy-modal visibility through the single isPaused state so the
  // story progress bar pauses in sync with the video.
  useEffect(() => {
    if (modalVisible) setIsPaused(true)
    else setIsPaused(false)
  }, [modalVisible])
  const { handlePurchase, purchasing, instantLoading } = useStoryPurchase()

  const [confirmDelivering, setConfirmDelivering] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const pulseAnim = useRef(new Animated.Value(1)).current
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null)
  // Progress bar animated on UI thread
  const progressBarSV = useSharedValue(0)

  // Story segment progress — fully UI-thread driven via Reanimated
  const storyProgress = useSharedValue(0)
  // Duration (ms) of the current story. Updated once the video metadata is
  // known; we start with a reasonable default so animation can begin.
  const storyDurationRef = useRef<number>(15000)
  const storyProgressStartedAt = useRef<number>(0)
  const storyProgressElapsed = useRef<number>(0)

  const handleStoryFinished = useCallback(() => {
    if (currentIndex < sellerStoryIds.length - 1) {
      goToStoryAt(currentIndex + 1)
    }
  }, [currentIndex, sellerStoryIds, goToStoryAt])

  const startStoryProgress = useCallback((fromElapsedMs: number) => {
    const total = storyDurationRef.current
    const remaining = Math.max(0, total - fromElapsedMs)
    const startRatio = total > 0 ? fromElapsedMs / total : 0
    cancelAnimation(storyProgress)
    storyProgress.value = startRatio
    storyProgressStartedAt.current = Date.now() - fromElapsedMs
    storyProgress.value = withTiming(
      1,
      { duration: remaining, easing: ReaEasing.linear },
      (finished) => {
        if (finished) runOnJS(handleStoryFinished)()
      }
    )
  }, [handleStoryFinished, storyProgress])

  const pauseStoryProgress = useCallback(() => {
    cancelAnimation(storyProgress)
    storyProgressElapsed.current = Date.now() - storyProgressStartedAt.current
  }, [storyProgress])

  const resumeStoryProgress = useCallback(() => {
    startStoryProgress(storyProgressElapsed.current)
  }, [startStoryProgress])

  // Reset + start on story change
  useEffect(() => {
    storyProgressElapsed.current = 0
    startStoryProgress(0)
    return () => { cancelAnimation(storyProgress) }
  }, [id, startStoryProgress, storyProgress])

  // Handle pause/resume for long press, modal, and detail sheet
  useEffect(() => {
    console.log('[story] isPaused ->', isPaused)
    if (isPaused) pauseStoryProgress()
    else if (storyProgressElapsed.current > 0) resumeStoryProgress()
  }, [isPaused, pauseStoryProgress, resumeStoryProgress])

  const storyProgressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, storyProgress.value * 100))}%`,
  }))

  // ── Horizontal swipe between sellers (Instagram cube fold) ─────────────────
  const { width: SCREEN_WIDTH } = Dimensions.get('window')
  const translateX = useSharedValue(0)
  const panActive = useSharedValue(0)
  const currentSellerId = story?.seller_id ?? null
  const currentSellerIdx = useMemo(() => {
    if (!currentSellerId) return -1
    return allSellerIds.indexOf(currentSellerId)
  }, [currentSellerId, allSellerIds])

  // Prefetch neighbour seller story previews for the cube-fold
  const neighbourCacheRef = useRef<Map<string, { thumbnail_url: string | null; video_url: string | null }>>(new Map())
  const [leftNeighbourPreview, setLeftNeighbourPreview] = useState<{ thumbnail_url: string | null; video_url: string | null } | null>(null)
  const [rightNeighbourPreview, setRightNeighbourPreview] = useState<{ thumbnail_url: string | null; video_url: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadNeighbour(sellerId: string | undefined, setter: (p: { thumbnail_url: string | null; video_url: string | null } | null) => void) {
      if (!sellerId) {
        setter(null)
        return
      }
      const cached = neighbourCacheRef.current.get(sellerId)
      if (cached) {
        setter(cached)
        return
      }
      const stories = await getSellerStories(sellerId)
      if (cancelled) return
      const first = stories[0]
      const preview = first
        ? { thumbnail_url: first.thumbnail_url ?? null, video_url: first.video_url ?? null }
        : { thumbnail_url: null, video_url: null }
      neighbourCacheRef.current.set(sellerId, preview)
      setter(preview)
    }
    const leftId = currentSellerIdx > 0 ? allSellerIds[currentSellerIdx - 1] : undefined
    const rightId = currentSellerIdx >= 0 && currentSellerIdx < allSellerIds.length - 1
      ? allSellerIds[currentSellerIdx + 1]
      : undefined
    loadNeighbour(leftId, setLeftNeighbourPreview)
    loadNeighbour(rightId, setRightNeighbourPreview)
    return () => { cancelled = true }
  }, [currentSellerIdx, allSellerIds])

  const navigateToSellerJS = useCallback((nextSellerIdx: number) => {
    goToSellerAtRef.current(nextSellerIdx)
  }, [])

  const resetTranslateJS = useCallback(() => {
    translateX.value = 0
  }, [translateX])

  const setIsPausedJS = useCallback((v: boolean) => setIsPaused(v), [])
  const routerBackJS = useCallback(() => router.back(), [])
  const openDetailJS = useCallback(() => openDetailRef.current(), [])

  const horizontalPan = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-18, 18])
      .onBegin(() => {
        'worklet'
        panActive.value = 1
      })
      .onUpdate((e) => {
        'worklet'
        const maxLeft = currentSellerIdx < allSellerIds.length - 1 ? -SCREEN_WIDTH : 0
        const maxRight = currentSellerIdx > 0 ? SCREEN_WIDTH : 0
        let tx = e.translationX
        if (tx < maxLeft) tx = maxLeft + (tx - maxLeft) * 0.25
        if (tx > maxRight) tx = maxRight + (tx - maxRight) * 0.25
        translateX.value = tx
      })
      .onEnd((e) => {
        'worklet'
        const DIST_THRESHOLD = SCREEN_WIDTH * 0.28
        const VEL_THRESHOLD = 800
        const goingLeft = e.translationX < 0
        const passedDistance = Math.abs(e.translationX) > DIST_THRESHOLD
        const passedVelocity = Math.abs(e.velocityX) > VEL_THRESHOLD
        const shouldChange = passedDistance || passedVelocity

        if (shouldChange && goingLeft && currentSellerIdx < allSellerIds.length - 1) {
          translateX.value = withSpring(
            -SCREEN_WIDTH,
            { damping: 18, stiffness: 180, mass: 0.8, velocity: e.velocityX },
            (finished) => {
              if (finished) {
                runOnJS(resetTranslateJS)()
                runOnJS(navigateToSellerJS)(currentSellerIdx + 1)
              }
            }
          )
        } else if (shouldChange && !goingLeft && currentSellerIdx > 0) {
          translateX.value = withSpring(
            SCREEN_WIDTH,
            { damping: 18, stiffness: 180, mass: 0.8, velocity: e.velocityX },
            (finished) => {
              if (finished) {
                runOnJS(navigateToSellerJS)(currentSellerIdx - 1)
                runOnJS(resetTranslateJS)()
              }
            }
          )
        } else {
          translateX.value = withSpring(0, {
            damping: 18,
            stiffness: 180,
            mass: 0.8,
            velocity: e.velocityX,
          })
        }
        panActive.value = 0
      })
  }, [SCREEN_WIDTH, currentSellerIdx, allSellerIds.length, navigateToSellerJS, resetTranslateJS, panActive, translateX])

  const verticalPan = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetY([-12, 12])
      .failOffsetX([-18, 18])
      .onEnd((e) => {
        'worklet'
        if (e.translationY > 80) {
          runOnJS(routerBackJS)()
        } else if (e.translationY < -80) {
          runOnJS(openDetailJS)()
        }
      })
  }, [routerBackJS, openDetailJS])

  const longPress = useMemo(() => {
    return Gesture.LongPress()
      .minDuration(200)
      .onStart(() => {
        'worklet'
        runOnJS(setIsPausedJS)(true)
      })
      .onFinalize(() => {
        'worklet'
        runOnJS(setIsPausedJS)(false)
      })
  }, [setIsPausedJS])

  const pan = useMemo(
    () => Gesture.Race(horizontalPan, verticalPan, longPress),
    [horizontalPan, verticalPan, longPress]
  )

  // Cube fold transforms: rotate around the seam shared with the neighbour,
  // not around the panel centre. We emulate transform-origin by sandwiching
  // the rotation between two translateX's equal to half the panel width.
  const HALF = SCREEN_WIDTH / 2

  const currentCubeStyle = useAnimatedStyle(() => {
    const progress = translateX.value / SCREEN_WIDTH
    const rotateY = interpolate(progress, [-1, 0, 1], [-90, 0, 90], Extrapolation.CLAMP)
    // Pivot on the edge that is leaving the screen:
    //   swiping left  (translateX < 0) -> pivot on LEFT edge  -> pre -HALF / post +HALF
    //   swiping right (translateX > 0) -> pivot on RIGHT edge -> pre +HALF / post -HALF
    const pivot = translateX.value >= 0 ? HALF : -HALF
    return {
      transform: [
        { perspective: 1000 },
        { translateX: translateX.value + pivot },
        { rotateY: `${rotateY}deg` },
        { translateX: -pivot },
      ],
    }
  })

  const leftCubeStyle = useAnimatedStyle(() => {
    const progress = translateX.value / SCREEN_WIDTH
    const rotateY = interpolate(progress, [0, 1], [90, 0], Extrapolation.CLAMP)
    // Left neighbour pivots on its RIGHT edge (the seam with the current panel).
    return {
      transform: [
        { perspective: 1000 },
        { translateX: translateX.value - SCREEN_WIDTH + HALF },
        { rotateY: `${rotateY}deg` },
        { translateX: -HALF },
      ],
      opacity: translateX.value > 0 ? 1 : 0,
    }
  })

  const rightCubeStyle = useAnimatedStyle(() => {
    const progress = translateX.value / SCREEN_WIDTH
    const rotateY = interpolate(progress, [-1, 0], [0, -90], Extrapolation.CLAMP)
    // Right neighbour pivots on its LEFT edge (the seam with the current panel).
    return {
      transform: [
        { perspective: 1000 },
        { translateX: translateX.value + SCREEN_WIDTH - HALF },
        { rotateY: `${rotateY}deg` },
        { translateX: HALF },
      ],
      opacity: translateX.value < 0 ? 1 : 0,
    }
  })

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('*, profiles:seller_id(username, avatar_url)')
        .eq('id', id)
        .single()

      if (error || !data) {
        setFetchError(true)
        setLoading(false)
        return
      }

      const { profiles, ...storyFields } = data as any
      const s = storyFields as StoryData
      storyRef.current = s
      setStory(s)
      const initPrice = computePrice(s)
      const initRatio = computeRatio(s)
      const initExpiry = computeExpiry(s)
      const initNear = initPrice <= s.floor_price_chf * 1.15
      const priceSpan = s.start_price_chf - s.floor_price_chf
      const initPriceRatio = priceSpan > 0
        ? Math.max(0, Math.min(1, (initPrice - s.floor_price_chf) / priceSpan))
        : 1
      currentPriceSV.value = initPrice
      timeRatioSV.value = initRatio
      priceRatioSV.value = initPriceRatio
      expiresRemainingSV.value = initExpiry
      nearFloorSV.value = initNear ? 1 : 0
      progressBarSV.value = initRatio
      currentPriceRef.current = initPrice
      expiresRemainingRef.current = initExpiry
      setNearFloor(initNear)
      setSeller(profiles as SellerProfile)
      setLoading(false)
    })()
  }, [id])

  // ── Realtime: status/sold changes only ────────────────────────────────────

  useEffect(() => {
    if (!story?.id) return
    const channel = supabase
      .channel(`story-viewer-${story.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stories', filter: `id=eq.${story.id}` },
        (payload) => {
          const updated = payload.new as Partial<StoryData>
          setStory(prev => {
            if (!prev) return prev
            const next = {
              ...prev,
              buyer_id: updated.buyer_id !== undefined ? updated.buyer_id : prev.buyer_id,
              status: updated.status ?? prev.status,
            }
            storyRef.current = next
            return next
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [story?.id])

  // ── Price ticker ───────────────────────────────────────────────────────────

  const prevIntPriceRef = useRef<number | null>(null)

  const prevNearFloorRef = useRef<boolean>(false)
  // Latest values for imperative reads (CTA onPress, snapshot price, etc.)
  const currentPriceRef = useRef<number>(0)
  const expiresRemainingRef = useRef<number>(0)

  useEffect(() => {
    const tick = () => {
      const s = storyRef.current
      if (!s || s.status !== 'active') return

      const price = computePrice(s)
      const ratio = computeRatio(s)
      const expiry = computeExpiry(s)
      const priceSpan = s.start_price_chf - s.floor_price_chf
      const pRatio = priceSpan > 0
        ? Math.max(0, Math.min(1, (price - s.floor_price_chf) / priceSpan))
        : 1
      const near = price <= s.floor_price_chf * 1.15

      currentPriceSV.value = price
      timeRatioSV.value = ratio
      priceRatioSV.value = pRatio
      expiresRemainingSV.value = expiry
      nearFloorSV.value = near ? 1 : 0
      currentPriceRef.current = price
      expiresRemainingRef.current = expiry

      // Progress bar: animate on UI thread, no layout churn
      progressBarSV.value = withTiming(ratio, {
        duration: 800,
        easing: ReaEasing.linear,
      })

      // Only re-render when the gating flag actually flips
      if (near !== prevNearFloorRef.current) {
        prevNearFloorRef.current = near
        setNearFloor(near)
      }

      // Haptic only when integer part changes
      const intPrice = Math.floor(price)
      if (prevIntPriceRef.current !== null && prevIntPriceRef.current !== intPrice) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
      }
      prevIntPriceRef.current = intPrice
    }

    tick()
    const handle = setInterval(tick, 1000)
    return () => clearInterval(handle)
  }, [])

  // ── Video duration sync ────────────────────────────────────────────────────
  // We drive the progress bar ourselves on the UI thread via Reanimated.
  // We only use the video status to learn the true duration once, then
  // restart the timer with the correct duration (preserving elapsed time).

  const videoDurationSynced = useRef(false)
  const [videoFirstFrameReady, setVideoFirstFrameReady] = useState(false)

  // Reset the thumbnail-bridge state whenever the story changes so the
  // thumbnail masks the black buffer gap on the new video.
  useEffect(() => {
    setVideoFirstFrameReady(false)
  }, [story?.id])

  const thumbnailOpacity = useSharedValue(1)
  useEffect(() => {
    if (videoFirstFrameReady) {
      thumbnailOpacity.value = withTiming(0, { duration: 200 })
    } else {
      thumbnailOpacity.value = 1
    }
  }, [videoFirstFrameReady, thumbnailOpacity])

  const thumbnailBridgeStyle = useAnimatedStyle(() => ({
    opacity: thumbnailOpacity.value,
  }))

  // Prefetch neighbour thumbnails so they show instantly after navigation.
  useEffect(() => {
    const left = leftNeighbourPreview?.thumbnail_url
    const right = rightNeighbourPreview?.thumbnail_url
    if (left && Platform.OS !== 'web') Image.prefetch(left).catch(() => {})
    if (right && Platform.OS !== 'web') Image.prefetch(right).catch(() => {})
  }, [leftNeighbourPreview?.thumbnail_url, rightNeighbourPreview?.thumbnail_url])

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (!status.isLoaded) return
    if (status.positionMillis > 0) {
      setVideoFirstFrameReady((prev) => (prev ? prev : true))
    }
    if (
      !videoDurationSynced.current &&
      status.durationMillis &&
      status.durationMillis > 0
    ) {
      videoDurationSynced.current = true
      const newDuration = status.durationMillis
      if (Math.abs(newDuration - storyDurationRef.current) > 50) {
        const elapsed = Date.now() - storyProgressStartedAt.current
        storyDurationRef.current = newDuration
        startStoryProgress(Math.min(elapsed, newDuration))
      } else {
        storyDurationRef.current = newDuration
      }
    }
  }, [startStoryProgress])

  // Reset video-duration sync flag when story changes
  useEffect(() => {
    videoDurationSynced.current = false
  }, [id])

  // ── Derived ────────────────────────────────────────────────────────────────

  const isSold = !!(
    story && (
      story.status === 'sold' ||
      story.status === 'expired' ||
      story.buyer_id !== null
    )
  )

  const currentUserId = session?.user?.id ?? null
  const isSeller = !!(story && currentUserId && story.seller_id === currentUserId)
  const showConfirmDelivery = !!(
    story &&
    story.status === 'sold' &&
    currentUserId &&
    story.buyer_id === currentUserId
  )

  // ── Pulse when near floor ──────────────────────────────────────────────────

  useEffect(() => {
    if (nearFloor && !isSold) {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      )
      pulseLoopRef.current.start()
    } else {
      pulseLoopRef.current?.stop()
      pulseAnim.setValue(1)
    }
    return () => { pulseLoopRef.current?.stop() }
  }, [nearFloor, isSold])

  // ── Confirm delivery ───────────────────────────────────────────────────────

  const handleConfirmDelivery = () => {
    Alert.alert(
      'Confirmer la réception',
      'Confirmez-vous avoir bien reçu cet article ? Les fonds seront transférés au vendeur.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            setConfirmDelivering(true)
            setDeliveryError(null)
            try {
              const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
              const token = session?.access_token
              const res = await fetch(`${supabaseUrl}/functions/v1/confirm-delivery`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ story_id: id }),
              })
              const json = await res.json()
              if (!res.ok) {
                throw new Error(json?.error ?? 'Erreur inconnue')
              }
              setStory(prev => prev ? { ...prev, status: 'delivered' } : prev)
              Alert.alert('Fonds transférés au vendeur avec succès')
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Erreur inconnue'
              setDeliveryError(msg)
            } finally {
              setConfirmDelivering(false)
            }
          },
        },
      ]
    )
  }

  // ── Purchase ───────────────────────────────────────────────────────────────

  const onConfirmPurchase = async () => {
    if (!story) return
    await handlePurchase(story.id, snapshotPrice, () => {
      setModalVisible(false)
      Alert.alert(
        i18n.t('story.viewer.purchase_success'),
        '',
        [{ text: 'OK', onPress: () => router.back() }]
      )
    })
  }

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    )
  }

  if (fetchError || !story || !seller) {
    return (
      <View style={styles.centered}>
        <StatusBar hidden />
        <Ionicons name="alert-circle-outline" size={48} color={C.danger} />
        <Text style={styles.errorStateText}>Story introuvable</Text>
        <TouchableOpacity style={styles.backOutlineBtn} onPress={() => router.back()}>
          <Text style={styles.backOutlineBtnText}>← {i18n.t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const startFmt = story.start_price_chf.toLocaleString('fr-CH')
  const floorFmt = story.floor_price_chf.toLocaleString('fr-CH')
  const initials = seller.username.charAt(0).toUpperCase()

  const hasLeftNeighbour = currentSellerIdx > 0
  const hasRightNeighbour = currentSellerIdx >= 0 && currentSellerIdx < allSellerIds.length - 1

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Left neighbour preview (cube fold) */}
      {hasLeftNeighbour && (
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, styles.cubeFace, leftCubeStyle]}
        >
          <NeighbourPreview preview={leftNeighbourPreview} />
        </Reanimated.View>
      )}

      {/* Right neighbour preview (cube fold) */}
      {hasRightNeighbour && (
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, styles.cubeFace, rightCubeStyle]}
        >
          <NeighbourPreview preview={rightNeighbourPreview} />
        </Reanimated.View>
      )}

      <GestureDetector gesture={pan}>
        <Reanimated.View
          style={[styles.cubeFace, currentCubeStyle, { flex: 1 }]}
        >

      {/* ── Video ── */}
      <Video
        source={{ uri: story.video_url }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay={!isPaused}
        isLooping={true}
        isMuted={false}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />

      {/* ── Thumbnail bridge: masks the video buffer delay so there's no
            black flash between stories. Fades out when the first frame lands. */}
      {story.thumbnail_url && (
        <Reanimated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, thumbnailBridgeStyle]}
        >
          <Image
            source={{ uri: story.thumbnail_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        </Reanimated.View>
      )}

      {/* ── Tap zones: left = prev story, right = next story ── */}
      {!modalVisible && (
        <>
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={() => {
              if (currentIndex > 0) {
                goToStoryAt(currentIndex - 1)
              }
            }}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={() => {
              if (currentIndex < sellerStoryIds.length - 1) {
                goToStoryAt(currentIndex + 1)
              }
            }}
            activeOpacity={1}
          />
        </>
      )}

      {/* ── Seller stories progress segments (Instagram-style) ── */}
      <View style={[styles.segmentsRow, { top: 50 }]} pointerEvents="none">
        {sellerStoryIds.map((sid, idx) => {
          const isCompleted = idx < currentIndex
          const isCurrent = idx === currentIndex
          return (
            <View key={sid} style={styles.segmentTrack}>
              {isCompleted ? (
                <View style={styles.segmentFillFull} />
              ) : isCurrent ? (
                <Reanimated.View
                  style={[styles.segmentFillFull, storyProgressStyle]}
                />
              ) : null}
            </View>
          )
        })}
      </View>

      {/* ── Top overlay ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'transparent']}
        style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {/* Seller row */}
        <View style={styles.sellerRow}>
          <View style={styles.sellerLeft}>
            {seller.avatar_url ? (
              <Image source={{ uri: seller.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <Text style={styles.sellerName}>{seller.username}</Text>
            {story.status === 'active' && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Sold overlay ── */}
      {isSold && (
        <View style={styles.soldOverlay}>
          <Ionicons name="checkmark-circle" size={56} color={C.primary} />
          <Text style={styles.soldTitle}>{i18n.t('story.viewer.sold')}</Text>
          <Text style={styles.soldSubtitle}>{i18n.t('story.viewer.auction_ended')}</Text>
          <TouchableOpacity style={styles.soldBackBtn} onPress={() => router.back()}>
            <Text style={styles.soldBackBtnText}>← {i18n.t('common.back')}</Text>
          </TouchableOpacity>

          {showConfirmDelivery && (
            <View style={styles.deliveryWrap}>
              <TouchableOpacity
                style={[styles.deliveryBtn, confirmDelivering && { opacity: 0.6 }]}
                onPress={handleConfirmDelivery}
                disabled={confirmDelivering}
                activeOpacity={0.8}
              >
                {confirmDelivering ? (
                  <ActivityIndicator color="#0F0F0F" />
                ) : (
                  <Text style={styles.deliveryBtnText}>Confirmer la réception</Text>
                )}
              </TouchableOpacity>
              {!!deliveryError && (
                <Text style={styles.deliveryError}>{deliveryError}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Mid-screen price overlay ── */}
      {!isSold && (
        <View style={styles.priceOverlay} pointerEvents="none">
          <PriceDisplay priceSV={currentPriceSV} priceRatioSV={priceRatioSV} />

          {/* Savings row (shared-value driven) */}
          <SavingsRow
            priceSV={currentPriceSV}
            startPrice={story.start_price_chf}
          />

          {/* Progress bar: animated on UI thread */}
          <View style={styles.priceProgressTrack}>
            <ProgressBarFill progressSV={progressBarSV} />
          </View>

          {/* Expiry */}
          <ExpiryRow expiresRemainingSV={expiresRemainingSV} />
        </View>
      )}

      {/* ── Bottom overlay ── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        {/* Title */}
        <Text style={styles.storyTitle} numberOfLines={2}>{story.title}</Text>

        {/* Price row */}
        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>{i18n.t('story.viewer.started_at')}</Text>
            <Text style={styles.priceValueStrike}>CHF {startFmt}</Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>{i18n.t('story.viewer.floor')}</Text>
            <Text style={styles.priceValueMuted}>CHF {floorFmt}</Text>
          </View>
        </View>

        {/* Floor cliff warning */}
        {!isSold && nearFloor && (
          <View style={styles.floorBanner}>
            <View style={styles.floorBannerIcon}>
              <Text style={styles.floorBannerIconText}>!</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.floorBannerTitle}>Dernier palier de prix</Text>
              <Text style={styles.floorBannerSub}>Le prix s'arrête à CHF {floorFmt}</Text>
            </View>
          </View>
        )}

        {/* CTA */}
        {isSold ? (
          <View style={[styles.ctaBtn, styles.ctaBtnSold]}>
            <Text style={styles.ctaBtnSoldText}>{i18n.t('story.viewer.sold')}</Text>
          </View>
        ) : isSeller ? (
          <View style={[styles.ctaBtn, styles.ctaBtnSold]}>
            <Text style={styles.ctaBtnSoldText}>Votre article</Text>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.ctaBtn, nearFloor && { backgroundColor: '#EF4444' }]}
              onPress={() => {
                setSnapshotPrice(currentPriceRef.current)
                setModalVisible(true)
              }}
            >
              <CtaLabel
                priceSV={currentPriceSV}
                prefix={nearFloor
                  ? 'DERNIÈRE BAISSE — CHF '
                  : `${i18n.t('story.viewer.buy_now')} — CHF `}
                style={styles.ctaBtnText}
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </LinearGradient>

      {/* ── Detail overlay ── */}
      {showDetail && (
        <>
          <TouchableOpacity
            style={styles.detailBackdrop}
            activeOpacity={1}
            onPress={closeDetail}
          />
          <Animated.View
            style={[
              styles.detailSheet,
              { paddingBottom: insets.bottom + 24 },
              {
                transform: [{
                  translateY: detailAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                }],
              },
            ]}
          >
            {/* Drag handle */}
            <View style={styles.detailHandle} />

            {/* Header */}
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle} numberOfLines={2}>{story.title}</Text>
              <TouchableOpacity onPress={closeDetail} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Description */}
            <Text style={story.description ? styles.detailDescription : styles.detailDescriptionEmpty}>
              {story.description || 'Aucune description'}
            </Text>

            {/* Price row */}
            <View style={styles.detailPriceRow}>
              <Text style={styles.detailPriceLabel}>CHF</Text>
              <CtaLabel priceSV={currentPriceSV} prefix="" style={styles.detailPriceValue} />
              <View style={[
                styles.detailSpeedBadge,
                story.speed_preset === 'FAST' && { backgroundColor: '#EF4444' },
                story.speed_preset === 'SLOW' && { backgroundColor: '#3B82F6' },
              ]}>
                <Text style={styles.detailSpeedText}>
                  {story.speed_preset === 'FAST' ? 'FLASH' : story.speed_preset === 'SLOW' ? 'RELAX' : 'STANDARD'}
                </Text>
              </View>
            </View>

            {/* Time remaining */}
            <View style={styles.detailTimeRow}>
              <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
              <DetailTimeRemaining expiresRemainingSV={expiresRemainingSV} style={styles.detailTimeText} />
            </View>

            {/* Buy button */}
            {!isSold && !isSeller && (
              <TouchableOpacity
                style={styles.detailBuyBtn}
                onPress={() => {
                  closeDetail()
                  setSnapshotPrice(currentPriceRef.current)
                  setModalVisible(true)
                }}
              >
                <CtaLabel priceSV={currentPriceSV} prefix="Acheter · CHF " style={styles.detailBuyBtnText} />
              </TouchableOpacity>
            )}
          </Animated.View>
        </>
      )}

      {/* ── Buy modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        />
        <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 24 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{i18n.t('story.viewer.confirm_purchase')}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Price */}
          <View style={styles.modalPriceWrap}>
            <Text style={styles.modalChf}>CHF</Text>
            <Text style={styles.modalPriceValue}>
              {snapshotPrice.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Subtitle */}
          <Text style={styles.modalSubtitle}>{i18n.t('story.viewer.dutch_subtitle')}</Text>

          {/* Warning */}
          <View style={styles.warningCard}>
            <Ionicons name="information-circle-outline" size={18} color={C.warn} />
            <Text style={styles.warningText}>{i18n.t('story.viewer.confirm_warning')}</Text>
          </View>

          {/* Confirm */}
          <TouchableOpacity
            style={[styles.confirmBtn, purchasing && { opacity: 0.6 }]}
            onPress={onConfirmPurchase}
            disabled={purchasing}
          >
            {instantLoading ? (
              <View style={styles.confirmBtnInner}>
                <ActivityIndicator color="#0F0F0F" size="small" />
                <Text style={styles.confirmBtnText}>Achat en cours...</Text>
              </View>
            ) : purchasing ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={styles.confirmBtnText}>
                CHF {snapshotPrice.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — {i18n.t('story.viewer.confirm_purchase')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
            <Text style={styles.cancelBtnText}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
        </Reanimated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  cubeFace: {},
  neighbourPlaceholder: {
    flex: 1,
    backgroundColor: '#000',
  },
  neighbourPreviewImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  centered: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  // Tap zones
  tapLeft: { position: 'absolute', top: 0, left: 0, width: '35%', height: '100%', zIndex: 1 },
  tapRight: { position: 'absolute', top: 0, right: 0, width: '65%', height: '100%', zIndex: 1 },

  // Seller stories progress segments (Instagram-style)
  segmentsRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 3,
    zIndex: 15,
  },
  segmentTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  segmentFillFull: {
    height: '100%',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },

  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 110,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  sellerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitials: { color: C.text, fontSize: 14, fontWeight: '700' },
  sellerName: { color: C.text, fontSize: 13, fontWeight: '600', marginLeft: 10 },
  liveBadge: {
    backgroundColor: C.danger,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  liveBadgeText: { color: C.text, fontSize: 10, fontWeight: '700' },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 240,
    paddingHorizontal: 20,
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  storyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  priceRow: { flexDirection: 'row', marginBottom: 12, gap: 12 },
  priceCol: { flex: 1 },
  priceLabel: { color: C.muted, fontSize: 11, marginBottom: 2 },
  priceValuePrimary: { color: C.primary, fontSize: 24, fontWeight: '700' },
  priceValueStrike: { color: C.muted, fontSize: 13, textDecorationLine: 'line-through' },
  priceValueMuted: { color: C.muted, fontSize: 13 },

  // Mid-screen price overlay
  priceOverlay: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    paddingHorizontal: 32,
  },
  priceChfLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 2,
    marginBottom: 2,
  },
  priceBig: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1,
  },
  priceProgressTrack: {
    width: 180,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 14,
  },
  priceProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  expiryText: { fontSize: 12 },

  // CTA
  ctaBtn: {
    backgroundColor: C.primary,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: { color: '#0F0F0F', fontSize: 16, fontWeight: '700' },
  ctaBtnSold: { backgroundColor: C.border, opacity: 0.6 },
  ctaBtnSoldText: { color: C.muted, fontSize: 16, fontWeight: '600' },

  // Sold overlay
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  soldTitle: { color: C.text, fontSize: 22, fontWeight: '700', marginTop: 12 },
  soldSubtitle: { color: C.muted, fontSize: 14, marginTop: 6 },
  soldBackBtn: {
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  soldBackBtnText: { color: C.primary, fontSize: 14, fontWeight: '600' },
  deliveryWrap: { marginTop: 16, width: '80%', alignItems: 'center' },
  deliveryBtn: {
    backgroundColor: C.primary,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  deliveryBtnText: { color: '#0F0F0F', fontSize: 15, fontWeight: '700' },
  deliveryError: { color: C.danger, fontSize: 12, marginTop: 8, textAlign: 'center' },

  // Error state
  errorStateText: { color: C.text, fontSize: 16, marginTop: 12 },
  backOutlineBtn: {
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 20,
  },
  backOutlineBtnText: { color: C.primary, fontSize: 14 },

  // Modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  modalPriceWrap: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 4,
  },
  modalChf: { color: C.muted, fontSize: 16 },
  modalPriceValue: { color: C.primary, fontSize: 40, fontWeight: '700' },
  modalSubtitle: { color: C.muted, fontSize: 12, textAlign: 'center' },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    alignItems: 'flex-start',
  },
  warningText: { color: C.muted, fontSize: 12, flex: 1, marginLeft: 10 },
  purchaseError: {
    color: C.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  confirmBtn: {
    backgroundColor: C.primary,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  confirmBtnText: { color: '#0F0F0F', fontSize: 16, fontWeight: '700' },
  confirmBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancelBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: C.muted, fontSize: 14 },

  // Savings row
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  savingsStrike: {
    fontSize: 13,
    color: '#666666',
    textDecorationLine: 'line-through',
  },
  savingsBadge: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savingsBadgeText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
  },

  // Floor cliff banner
  floorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a0a0a',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.32)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  floorBannerIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floorBannerIconText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  floorBannerTitle: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  floorBannerSub: {
    color: '#666666',
    fontSize: 11,
    marginTop: 1,
  },

  // Detail overlay
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 30,
  },
  detailSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10,10,10,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    zIndex: 31,
  },
  detailHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  detailTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  detailDescription: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  detailDescriptionEmpty: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  detailPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  detailPriceLabel: {
    color: '#00D2B8',
    fontSize: 16,
    fontWeight: '600',
  },
  detailPriceValue: {
    color: '#00D2B8',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  detailSpeedBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 4,
  },
  detailSpeedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  detailTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 20,
  },
  detailTimeText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
  detailBuyBtn: {
    backgroundColor: '#00D2B8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  detailBuyBtnText: {
    color: '#0F0F0F',
    fontSize: 16,
    fontWeight: '700',
  },
})
