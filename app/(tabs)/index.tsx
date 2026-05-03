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
  RefreshControl,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { useWatchlist } from '../../hooks/useWatchlist'
import { useDropPresence } from '../../hooks/useDropPresence'
import ReportModal from '../../components/ui/ReportModal'
import { SaleToast, SaleToastPayload } from '../../components/ui/SaleToast'

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

function RecentViewersPill({ count }: { count: number }) {
  if (count < 2) return null
  let label: string
  if (count >= 51) label = 'Populaire'
  else if (count >= 11) label = '+10 personnes regardent'
  else label = `${count} personnes regardent`
  const icon = count >= 51 ? '🔥' : '👁'
  return (
    <View style={styles.recentViewersPill}>
      <Text style={styles.recentViewersText}>{icon} {label}</Text>
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
  const viewerCount = useDropPresence(story.id, active && tabFocused)
  const { isWatchlisted, watchlistCount, toggleWatchlist } = useWatchlist(story.id)
  const [menuVisible, setMenuVisible] = useState(false)
  const [reportVisible, setReportVisible] = useState(false)
  const [buyVisible, setBuyVisible] = useState(false)
  const [snapshotPrice, setSnapshotPrice] = useState(0)

  const [price, setPrice] = useState(() => computePrice(story))
  const [progress, setProgress] = useState(() => computeProgress(story))
  const [localSold, setLocalSold] = useState(false)
  const [recentViewers, setRecentViewers] = useState<number>(0)

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
    if (!active || !currentUserId) return
    supabase
      .from('story_views')
      .insert({ story_id: story.id, user_id: currentUserId })
      .then(() => {})
    ;(async () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('story_views')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', story.id)
        .gte('viewed_at', tenMinAgo)
      setRecentViewers(count ?? 0)
    })()
  }, [active, currentUserId, story.id])

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
        <RecentViewersPill count={recentViewers} />
        {viewerCount > 1 ? (
          <View style={styles.watchingPill}>
            <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
            <Text style={styles.watchingText}>{viewerCount} watching</Text>
          </View>
        ) : (
          <View />
        )}
      </View>

      <TouchableOpacity
        onPress={() => setMuted((m) => !m)}
        style={styles.muteBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.actionsCol}>
        <TouchableOpacity style={styles.actionBtn} onPress={toggleWatchlist} activeOpacity={0.7}>
          <Ionicons
            name={isWatchlisted ? 'heart' : 'heart-outline'}
            size={26}
            color={isWatchlisted ? '#FF4757' : '#FFFFFF'}
          />
        </TouchableOpacity>
        <Text style={styles.actionCount}>{watchlistCount > 0 ? watchlistCount : ''}</Text>

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

type FeedTab = 'foryou' | 'following'

const keyExtractor = (item: FeedStory) => item.id

export default function FeedScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ initialStoryId?: string }>()

  const [activeTab, setActiveTab] = useState<FeedTab>('foryou')

  // Per-tab state
  const [forYouStories, setForYouStories] = useState<FeedStory[]>([])
  const [forYouLoading, setForYouLoading] = useState(true)
  const [forYouLoaded, setForYouLoaded] = useState(false)
  const [forYouRefreshing, setForYouRefreshing] = useState(false)

  const [followingStories, setFollowingStories] = useState<FeedStory[]>([])
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followingLoaded, setFollowingLoaded] = useState(false)
  const [followingRefreshing, setFollowingRefreshing] = useState(false)

  const [activeIndex, setActiveIndex] = useState(0)
  const [tabFocused, setTabFocused] = useState(true)
  const [toast, setToast] = useState<SaleToastPayload | null>(null)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 })
  const flatListRef = useRef<FlatList<FeedStory>>(null)

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true)
      return () => setTabFocused(false)
    }, [])
  )

  // ── Fetch "Pour toi" ────────────────────────────────────────────────────────
  const fetchForYou = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(30)
    if (!error) setForYouStories((data as unknown as FeedStory[]) ?? [])
    setForYouLoading(false)
    setForYouLoaded(true)
    setForYouRefreshing(false)
  }, [])

  // ── Fetch "Abonnements" ─────────────────────────────────────────────────────
  const fetchFollowing = useCallback(async () => {
    if (!currentUserId) {
      setFollowingLoading(false)
      setFollowingLoaded(true)
      setFollowingRefreshing(false)
      return
    }
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)

    const ids = (follows ?? []).map((f: { following_id: string }) => f.following_id)

    if (ids.length === 0) {
      setFollowingStories([])
      setFollowingLoading(false)
      setFollowingLoaded(true)
      setFollowingRefreshing(false)
      return
    }

    const { data, error } = await supabase
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .in('seller_id', ids)
      .order('created_at', { ascending: false })
      .limit(30)

    if (!error) setFollowingStories((data as unknown as FeedStory[]) ?? [])
    setFollowingLoading(false)
    setFollowingLoaded(true)
    setFollowingRefreshing(false)
  }, [currentUserId])

  // Initial load
  useEffect(() => { fetchForYou() }, [fetchForYou])

  // ── Handle initialStoryId from navigation params ────────────────────────────
  useEffect(() => {
    const targetId = params.initialStoryId
    if (!targetId || forYouLoading) return
    setActiveTab('foryou')

    const idx = forYouStories.findIndex((s) => s.id === targetId)
    if (idx !== -1) {
      setActiveIndex(idx)
      flatListRef.current?.scrollToIndex({ index: idx, animated: false })
      router.setParams({ initialStoryId: undefined })
      return
    }

    // Story not in current list — fetch it and prepend
    ;(async () => {
      const { data } = await supabase
        .from('stories')
        .select(STORY_SELECT)
        .eq('id', targetId)
        .maybeSingle()
      if (data) {
        setForYouStories((prev) => {
          if (prev.find((s) => s.id === targetId)) return prev
          return [data as unknown as FeedStory, ...prev]
        })
        setActiveIndex(0)
        flatListRef.current?.scrollToIndex({ index: 0, animated: false })
      }
      router.setParams({ initialStoryId: undefined })
    })()
  }, [params.initialStoryId, forYouLoading, forYouStories])

  // Load following tab on first switch to it
  useEffect(() => {
    if (activeTab === 'following' && !followingLoaded && !followingLoading) {
      setFollowingLoading(true)
      fetchFollowing()
    }
  }, [activeTab, followingLoaded, followingLoading, fetchFollowing])

  // Reset active index when switching tabs
  const handleTabSwitch = useCallback((tab: FeedTab) => {
    setActiveTab(tab)
    setActiveIndex(0)
  }, [])

  // ── Realtime sale toast ─────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('drop_sales')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stories' },
        async (payload) => {
          const next = payload.new as FeedStory
          const prev = payload.old as Partial<FeedStory>
          if (next.status !== 'sold' || prev.status === 'sold') return
          if (!next.buyer_id || next.buyer_id === currentUserId) return

          const { data: buyer } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', next.buyer_id)
            .maybeSingle()

          setToast({
            id: `${next.id}-${Date.now()}`,
            username: buyer?.username ?? 'someone',
            priceChf: next.current_price_chf ?? 0,
          })
        }
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [currentUserId])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0)
    }
  }).current

  const handleSwipeDown = useCallback(() => {
    console.log('[feed] swipe down -> main menu (TBD)')
  }, [])

  const activeStories = activeTab === 'foryou' ? forYouStories : followingStories
  const isLoading = activeTab === 'foryou' ? forYouLoading : followingLoading

  const preloadStories = useMemo(
    () => activeStories.slice(activeIndex + 1, activeIndex + 3),
    [activeStories, activeIndex]
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

  // ── Tab header overlay ──────────────────────────────────────────────────────
  const tabHeader = (
    <View style={[styles.tabHeaderWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.tabRow} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => handleTabSwitch('following')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, activeTab !== 'following' && styles.tabLabelInactive]}>
            Abonnements
          </Text>
          {activeTab === 'following' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => handleTabSwitch('foryou')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, activeTab !== 'foryou' && styles.tabLabelInactive]}>
            Pour toi
          </Text>
          {activeTab === 'foryou' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>
    </View>
  )

  // ── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#00D2B8" />
        </View>
        {tabHeader}
      </View>
    )
  }

  // ── Following empty state ───────────────────────────────────────────────────
  if (activeTab === 'following' && activeStories.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color="#555" />
          <Text style={styles.emptyText}>Tu ne suis encore personne.</Text>
          <TouchableOpacity
            style={styles.discoverBtn}
            onPress={() => handleTabSwitch('foryou')}
            activeOpacity={0.85}
          >
            <Text style={styles.discoverBtnText}>Découvrir des vendeurs</Text>
          </TouchableOpacity>
        </View>
        {tabHeader}
      </View>
    )
  }

  // ── For You empty state ─────────────────────────────────────────────────────
  if (activeTab === 'foryou' && activeStories.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Ionicons name="flash-outline" size={48} color="#555" />
          <Text style={styles.emptyText}>Aucun drop actif</Text>
        </View>
        {tabHeader}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={flatListRef}
        key={activeTab}
        data={activeStories}
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
        refreshControl={
          <RefreshControl
            refreshing={activeTab === 'foryou' ? forYouRefreshing : followingRefreshing}
            onRefresh={() => {
              if (activeTab === 'foryou') {
                setForYouRefreshing(true)
                fetchForYou()
              } else {
                setFollowingRefreshing(true)
                fetchFollowing()
              }
            }}
            tintColor="#00D2B8"
          />
        }
      />

      {tabHeader}

      {toast && <SaleToast key={toast.id} payload={toast} onDismiss={() => setToast(null)} />}

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
    top: 96,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  recentViewersPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  recentViewersText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
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

  // ── Feed tabs ───────────────────────────────────────────────────────────────
  tabHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingBottom: 10,
  },
  tabBtn: {
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  tabLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabLabelInactive: {
    opacity: 0.5,
    fontWeight: '500',
  },
  tabUnderline: {
    marginTop: 3,
    height: 2,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },

  discoverBtn: {
    marginTop: 16,
    backgroundColor: '#00D2B8',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  discoverBtnText: {
    color: '#0F0F0F',
    fontSize: 14,
    fontWeight: '700',
  },
})
