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
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Video, ResizeMode } from 'expo-av'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useStoryPurchase } from '../../lib/stripe'
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
  status: string
  buyer_id: string | null
  video_duration_seconds: number | null
}

interface SellerProfile {
  username: string
  avatar_url: string | null
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatHHMMSS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function StoryViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()

  const [story, setStory] = useState<StoryData | null>(null)
  const [seller, setSeller] = useState<SellerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const [dropRemaining, setDropRemaining] = useState(0)
  const [expiresRemaining, setExpiresRemaining] = useState(0)

  const [modalVisible, setModalVisible] = useState(false)
  const [snapshotPrice, setSnapshotPrice] = useState(0)
  const { handlePurchase, purchasing } = useStoryPurchase()

  const progressAnim = useRef(new Animated.Value(0)).current
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      setStory(storyFields as StoryData)
      setSeller(profiles as SellerProfile)
      setLoading(false)
    })()
  }, [id])

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`story-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stories', filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new as Partial<StoryData>
          setStory(prev => prev ? {
            ...prev,
            current_price_chf: updated.current_price_chf ?? prev.current_price_chf,
            last_drop_at: updated.last_drop_at ?? prev.last_drop_at,
            buyer_id: updated.buyer_id !== undefined ? updated.buyer_id : prev.buyer_id,
            status: updated.status ?? prev.status,
          } : prev)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  // ── Timers ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!story) return

    const tick = () => {
      const now = Date.now()
      const sinceDrop = (now - new Date(story.last_drop_at).getTime()) / 1000
      setDropRemaining(Math.max(0, story.price_drop_seconds - sinceDrop))

      const untilExpiry = (new Date(story.expires_at).getTime() - now) / 1000
      setExpiresRemaining(Math.max(0, untilExpiry))
    }

    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [story?.last_drop_at, story?.expires_at, story?.price_drop_seconds])

  // ── Progress animation ─────────────────────────────────────────────────────

  const onPlaybackStatusUpdate = useCallback((status: any) => {
    if (!status.isLoaded) return
    if (status.durationMillis && status.durationMillis > 0) {
      const p = status.positionMillis / status.durationMillis
      Animated.timing(progressAnim, {
        toValue: p,
        duration: 250,
        useNativeDriver: false,
      }).start()
    }
    if (status.didJustFinish) {
      router.back()
    }
  }, [progressAnim])

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  // ── Derived ────────────────────────────────────────────────────────────────

  const isSold = !!(
    story && (
      story.status === 'sold' ||
      story.status === 'expired' ||
      story.buyer_id !== null
    )
  )

  // ── Purchase ───────────────────────────────────────────────────────────────

  const onConfirmPurchase = async () => {
    if (!story) return
    const { data: { user } } = await supabase.auth.getUser()
    const buyerName = (user?.user_metadata?.full_name as string | undefined) ?? ''
    await handlePurchase(story.id, snapshotPrice, buyerName, () => {
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

  const currentFmt = story.current_price_chf.toLocaleString('fr-CH')
  const startFmt = story.start_price_chf.toLocaleString('fr-CH')
  const floorFmt = story.floor_price_chf.toLocaleString('fr-CH')
  const initials = seller.username.charAt(0).toUpperCase()

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Video ── */}
      <Video
        source={{ uri: story.video_url }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay={!modalVisible}
        isLooping={false}
        isMuted={false}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />

      {/* ── Tap zones ── */}
      {!modalVisible && (
        <>
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={() => router.back()}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={() => router.back()}
            activeOpacity={1}
          />
        </>
      )}

      {/* ── Top overlay ── */}
      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'transparent']}
        style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

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
            <Text style={styles.priceLabel}>{i18n.t('story.viewer.current_price')}</Text>
            <Text style={styles.priceValuePrimary}>CHF {currentFmt}</Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>{i18n.t('story.viewer.started_at')}</Text>
            <Text style={styles.priceValueStrike}>CHF {startFmt}</Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceLabel}>{i18n.t('story.viewer.floor')}</Text>
            <Text style={styles.priceValueMuted}>CHF {floorFmt}</Text>
          </View>
        </View>

        {/* Timers */}
        <View style={styles.timersRow}>
          {story.price_drop_seconds > 0 && !isSold && (
            <View style={styles.timerItem}>
              <Ionicons
                name="trending-down-outline"
                size={13}
                color={dropRemaining < 30 ? C.warn : C.muted}
              />
              <Text style={[styles.timerText, dropRemaining < 30 && { color: C.warn }]}>
                {i18n.t('story.viewer.drop_in')} {formatMMSS(dropRemaining)}
              </Text>
            </View>
          )}
          <View style={styles.timerItem}>
            <Ionicons
              name="time-outline"
              size={13}
              color={expiresRemaining < 3600 ? C.danger : C.text}
            />
            <Text style={[styles.timerText, { color: expiresRemaining < 3600 ? C.danger : C.text }]}>
              {i18n.t('story.viewer.expires_in')} {formatHHMMSS(expiresRemaining)}
            </Text>
          </View>
        </View>

        {/* CTA */}
        {isSold ? (
          <View style={[styles.ctaBtn, styles.ctaBtnSold]}>
            <Text style={styles.ctaBtnSoldText}>{i18n.t('story.viewer.sold')}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => {
              setSnapshotPrice(story.current_price_chf)
              setModalVisible(true)
            }}
          >
            <Text style={styles.ctaBtnText}>
              {i18n.t('story.viewer.buy_now')} — CHF {currentFmt}
            </Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

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
              {snapshotPrice.toLocaleString('fr-CH')}
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
            {purchasing ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={styles.confirmBtnText}>
                CHF {snapshotPrice.toLocaleString('fr-CH')} — {i18n.t('story.viewer.confirm_purchase')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
            <Text style={styles.cancelBtnText}>{i18n.t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  // Tap zones
  tapLeft: { position: 'absolute', top: 0, left: 0, width: '35%', height: '100%', zIndex: 1 },
  tapRight: { position: 'absolute', top: 0, right: 0, width: '65%', height: '100%', zIndex: 1 },

  // Top overlay
  topOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 110,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.text, borderRadius: 2 },
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

  // Timers
  timersRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  timerItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { color: C.muted, fontSize: 12 },

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
  cancelBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { color: C.muted, fontSize: 14 },
})
