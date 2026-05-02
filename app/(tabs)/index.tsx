import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Video, ResizeMode } from 'expo-av'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ListRenderItem,
  Dimensions,
  Platform,
  ActionSheetIOS,
  Modal,
  Pressable,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useStoryPurchase } from '../../lib/stripe'
import ReportModal from '../../components/ui/ReportModal'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface FeedStory {
  id: string
  seller_id: string
  title: string
  start_price_chf: number
  floor_price_chf: number
  current_price_chf: number
  video_url: string
  thumbnail_url: string | null
  status: string
  buyer_id: string | null
  created_at: string
  expires_at: string
  price_drop_seconds: number | null
  seller: { id: string; username: string; avatar_url: string | null } | null
}

const STORY_SELECT = `
  id, seller_id, title, start_price_chf, floor_price_chf, current_price_chf,
  video_url, thumbnail_url, status, buyer_id, created_at, expires_at, price_drop_seconds,
  seller:seller_id ( id, username, avatar_url )
`

function computePrice(s: FeedStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  const elapsed = Date.now() - new Date(s.created_at).getTime()
  if (total <= 0) return s.floor_price_chf
  const r = Math.min(Math.max(elapsed / total, 0), 1)
  return Math.max(s.start_price_chf - (s.start_price_chf - s.floor_price_chf) * r, s.floor_price_chf)
}

function computeProgress(s: FeedStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  const elapsed = Date.now() - new Date(s.created_at).getTime()
  if (total <= 0) return 1
  return Math.min(Math.max(elapsed / total, 0), 1)
}

function dropPerMinute(s: FeedStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  if (total <= 0) return 0
  const span = s.start_price_chf - s.floor_price_chf
  return span / (total / 60000)
}

function LivePill() {
  const dot = useSharedValue(1)
  useEffect(() => {
    dot.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    )
  }, [dot])
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value }))
  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveDot, dotStyle]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  )
}

function DropItem({
  story,
  active,
  tabFocused,
  onSwipeDown,
  currentUserId,
}: {
  story: FeedStory
  active: boolean
  tabFocused: boolean
  onSwipeDown: () => void
  currentUserId: string
}) {
  const videoRef = useRef<Video>(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(() => Math.floor(Math.random() * 200) + 10)
  const [watching] = useState(() => Math.floor(Math.random() * 80) + 5)
  const [menuVisible, setMenuVisible] = useState(false)
  const [reportVisible, setReportVisible] = useState(false)
  const [buyVisible, setBuyVisible] = useState(false)
  const [snapshotPrice, setSnapshotPrice] = useState(0)

  const [price, setPrice] = useState(() => computePrice(story))
  const [progress, setProgress] = useState(() => computeProgress(story))
  const [localSold, setLocalSold] = useState(false)

  const { handlePurchase, purchasing, instantLoading } = useStoryPurchase()

  const isSeller = currentUserId === story.seller_id
  const isSold = localSold || story.status === 'sold' || story.buyer_id !== null
  const disabled = isSeller || story.status !== 'active' || isSold

  useEffect(() => {
    if (!active) return
    const tick = () => {
      setPrice(computePrice(story))
      setProgress(computeProgress(story))
    }
    tick()
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [active, story])

  useEffect(() => {
    if (!videoRef.current) return
    if (active && tabFocused && !paused && !buyVisible) {
      videoRef.current.playAsync().catch(() => {})
    } else {
      videoRef.current.pauseAsync().catch(() => {})
    }
  }, [active, tabFocused, paused, buyVisible])

  const pulse = useSharedValue(1)
  useEffect(() => {
    if (disabled) return
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    )
  }, [disabled, pulse])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  const touchStartY = useRef(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onTouchStart = (e: any) => {
    touchStartY.current = e.nativeEvent.pageY
    longPressTimer.current = setTimeout(() => {
      setPaused(true)
    }, 300)
  }

  const onTouchEnd = (e: any) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    const dy = e.nativeEvent.pageY - touchStartY.current
    if (paused) setPaused(false)
    if (dy > 120) onSwipeDown()
  }

  const onTouchMove = (e: any) => {
    const dy = Math.abs(e.nativeEvent.pageY - touchStartY.current)
    if (dy > 8 && longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const toggleLike = () => {
    setLiked((v) => {
      setLikeCount((c) => c + (v ? -1 : 1))
      return !v
    })
  }

  const openMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Signaler', 'Bloquer le vendeur'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (i) => {
          if (i === 1) setReportVisible(true)
          if (i === 2 && story.seller?.id) router.push(`/profile/${story.seller.id}`)
        }
      )
    } else {
      setMenuVisible(true)
    }
  }

  const openBuy = () => {
    if (disabled) return
    setSnapshotPrice(price)
    setBuyVisible(true)
  }

  const confirmBuy = async () => {
    await handlePurchase(story.id, snapshotPrice, () => {
      setBuyVisible(false)
      setLocalSold(true)
      Alert.alert('Achat confirmé !', '', [{ text: 'OK' }])
    })
  }

  const openSellerProfile = () => {
    if (story.seller?.id && story.seller.id !== currentUserId) {
      router.push(`/profile/${story.seller.id}`)
    }
  }

  const username = story.seller?.username ?? 'vendeur'
  const avatar = story.seller?.avatar_url
  const perMin = dropPerMinute(story)
  const ctaLabel = isSold
    ? 'Vendu'
    : isSeller
    ? 'Votre drop'
    : story.status !== 'active'
    ? 'Enchère terminée'
    : `Acheter maintenant — CHF ${price.toFixed(2)}`

  return (
    <View
      style={styles.drop}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <Video
        ref={videoRef}
        source={{ uri: story.video_url }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted={muted}
        shouldPlay={active && tabFocused && !paused && !buyVisible}
        posterSource={story.thumbnail_url ? { uri: story.thumbnail_url } : undefined}
        usePoster={!!story.thumbnail_url}
      />

      {paused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="pause" size={60} color="rgba(255,255,255,0.9)" />
        </View>
      )}

      <View style={styles.topRow} pointerEvents="box-none">
        {story.status === 'active' ? <LivePill /> : <View />}
        <View style={styles.watchingPill}>
          <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
          <Text style={styles.watchingText}>{watching} watching</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => setMuted((m) => !m)}
        style={styles.muteBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.actionsCol}>
        <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} activeOpacity={0.7}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={26}
            color={liked ? '#FF4757' : '#FFFFFF'}
          />
        </TouchableOpacity>
        <Text style={styles.actionCount}>{likeCount}</Text>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-redo-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.actionCount}>Share</Text>

        <TouchableOpacity style={styles.actionBtn} onPress={openMenu} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.bottomGradient}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={styles.sellerRow} onPress={openSellerProfile} activeOpacity={0.8}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.sellerAvatar} />
          ) : (
            <View style={styles.sellerAvatarFallback}>
              <Text style={styles.sellerAvatarInitial}>{username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.sellerUsername}>@{username}</Text>
        </TouchableOpacity>

        <Text style={styles.productTitle} numberOfLines={2}>
          {story.title}
        </Text>

        <View style={styles.priceBlock}>
          <Text style={styles.priceBig}>CHF {price.toFixed(2)}</Text>
          <View style={styles.priceMeta}>
            <Text style={styles.priceDrop}>↓ -CHF {perMin.toFixed(2)}/min</Text>
            <Text style={styles.priceMin}>Min: CHF {story.floor_price_chf.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <LinearGradient
            colors={['#00D2B8', '#FFA502']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>

        <Animated.View style={!disabled ? pulseStyle : undefined}>
          <TouchableOpacity
            style={[styles.buyBtn, disabled && styles.buyBtnDisabled]}
            activeOpacity={0.85}
            disabled={disabled}
            onPress={openBuy}
          >
            <Text style={[styles.buyBtnText, disabled && styles.buyBtnTextDisabled]}>
              {ctaLabel}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>

      {Platform.OS !== 'ios' && (
        <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
            <View style={styles.menuSheet}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false)
                  setTimeout(() => setReportVisible(true), 200)
                }}
              >
                <Ionicons name="flag-outline" size={18} color="#FFFFFF" />
                <Text style={styles.menuText}>Signaler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false)
                  if (story.seller?.id) router.push(`/profile/${story.seller.id}`)
                }}
              >
                <Ionicons name="person-remove-outline" size={18} color="#FF4757" />
                <Text style={[styles.menuText, { color: '#FF4757' }]}>Bloquer le vendeur</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
                <Text style={styles.menuCancelText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetType="story"
        targetId={story.id}
      />

      <Modal
        visible={buyVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setBuyVisible(false)}
      >
        <Pressable style={styles.buyBackdrop} onPress={() => setBuyVisible(false)} />
        <View style={styles.buySheet}>
          <View style={styles.buyHandle} />
          <Text style={styles.buySheetTitle}>Confirmer l'achat</Text>
          <View style={styles.buyPriceWrap}>
            <Text style={styles.buyChf}>CHF</Text>
            <Text style={styles.buyPriceValue}>{snapshotPrice.toFixed(2)}</Text>
          </View>
          <Text style={styles.buySubtitle}>Enchère hollandaise · Premier arrivé, premier servi</Text>
          <View style={styles.buyWarn}>
            <Ionicons name="information-circle-outline" size={18} color="#FFA502" />
            <Text style={styles.buyWarnText}>
              Ce prix n'est valable que quelques secondes. Le montant débité sera celui au moment de la confirmation.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.buyConfirm, (purchasing || instantLoading) && { opacity: 0.6 }]}
            onPress={confirmBuy}
            disabled={purchasing || instantLoading}
          >
            {purchasing || instantLoading ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={styles.buyConfirmText}>
                CHF {snapshotPrice.toFixed(2)} — Confirmer
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.buyCancel} onPress={() => setBuyVisible(false)}>
            <Text style={styles.buyCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const keyExtractor = (item: FeedStory) => item.id

export default function FeedScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const [stories, setStories] = useState<FeedStory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [tabFocused, setTabFocused] = useState(true)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 })

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true)
      return () => setTabFocused(false)
    }, [])
  )

  const fetchStories = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) {
      setLoading(false)
      return
    }
    setStories((data as unknown as FeedStory[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStories()
  }, [fetchStories])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0)
    }
  }).current

  const handleSwipeDown = useCallback(() => {
    console.log('[feed] swipe down -> main menu (TBD)')
  }, [])

  const preloadStories = useMemo(
    () => stories.slice(activeIndex + 1, activeIndex + 3),
    [stories, activeIndex]
  )

  const renderItem: ListRenderItem<FeedStory> = useCallback(
    ({ item, index }) => (
      <DropItem
        story={item}
        active={index === activeIndex}
        tabFocused={tabFocused}
        onSwipeDown={handleSwipeDown}
        currentUserId={currentUserId}
      />
    ),
    [activeIndex, tabFocused, currentUserId, handleSwipeDown]
  )

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index }),
    []
  )

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color="#00D2B8" />
      </View>
    )
  }

  if (stories.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="flash-outline" size={48} color="#555" />
        <Text style={styles.emptyText}>Aucun drop actif</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={stories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        getItemLayout={getItemLayout}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
      />

      <View style={styles.preloadHidden} pointerEvents="none">
        {preloadStories.map((s) => (
          <Video
            key={`pre-${s.id}`}
            source={{ uri: s.video_url }}
            style={styles.preloadVideo}
            shouldPlay={false}
            isMuted
            resizeMode={ResizeMode.COVER}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  empty: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { color: '#999', fontSize: 15, fontWeight: '600' },

  drop: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    overflow: 'hidden',
  },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },

  topRow: {
    position: 'absolute',
    top: 58,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  liveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  watchingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  watchingText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  muteBtn: {
    position: 'absolute',
    top: 100,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  actionsCol: {
    position: 'absolute',
    right: 12,
    bottom: 260,
    alignItems: 'center',
    gap: 4,
    zIndex: 5,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCount: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },

  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 100,
    zIndex: 4,
  },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sellerAvatar: { width: 28, height: 28, borderRadius: 14 },
  sellerAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarInitial: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  sellerUsername: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  productTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 12,
  },

  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priceBig: { color: '#00D2B8', fontSize: 36, fontWeight: '500', letterSpacing: -1 },
  priceMeta: { alignItems: 'flex-end', marginBottom: 6 },
  priceDrop: { color: '#FFA502', fontSize: 12, fontWeight: '600' },
  priceMin: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },

  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: { height: '100%', borderRadius: 2 },

  buyBtn: {
    height: 48,
    backgroundColor: '#00D2B8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnDisabled: { backgroundColor: '#2A2A2A' },
  buyBtnText: { color: '#0F0F0F', fontSize: 15, fontWeight: '700' },
  buyBtnTextDisabled: { color: '#777' },

  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  menuCancel: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  menuCancelText: { color: '#999', fontSize: 14 },

  buyBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  buySheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 36,
  },
  buyHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 18,
  },
  buySheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  buyPriceWrap: {
    alignItems: 'center',
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  buyChf: { color: '#717976', fontSize: 16 },
  buyPriceValue: { color: '#00D2B8', fontSize: 40, fontWeight: '700' },
  buySubtitle: { color: '#717976', fontSize: 12, textAlign: 'center', marginTop: 4 },
  buyWarn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#0F0F0F',
    padding: 14,
    borderRadius: 12,
    marginTop: 18,
    alignItems: 'flex-start',
  },
  buyWarnText: { color: '#717976', fontSize: 12, flex: 1, lineHeight: 17 },
  buyConfirm: {
    height: 54,
    backgroundColor: '#00D2B8',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  buyConfirmText: { color: '#0F0F0F', fontSize: 16, fontWeight: '700' },
  buyCancel: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
  buyCancelText: { color: '#717976', fontSize: 14 },

  preloadHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    bottom: -100,
    right: -100,
  },
  preloadVideo: { width: 1, height: 1 },
})
