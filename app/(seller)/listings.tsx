import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Modal,
  TextInput,
  Linking,
  Platform,
  Pressable,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SellerStory {
  id: string
  title: string | null
  video_url: string | null
  current_price_chf: number
  start_price_chf: number
  floor_price_chf: number
  status: string
  expires_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  tracking_number: string | null
  created_at: string
}

interface ShopListing {
  id: string
  title: string
  images: string[]
  price_chf: number
  stock: number
  is_active: boolean
  category: string | null
  created_at: string
}

type Tab = 'stories' | 'listings'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '—'
  const d = new Date(expiresAt)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(msg)
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      timer.current = setTimeout(() => setMessage(null), 50)
    })
  }, [opacity])

  const ToastView = message ? (
    <Animated.View style={[toastStyles.toast, { opacity }]}>
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  ) : null

  return { show, ToastView }
}

const toastStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
  },
})

// ─── Ship Modal ───────────────────────────────────────────────────────────────

function ShipModal({
  visible,
  storyId,
  storyTitle,
  onClose,
  onSuccess,
}: {
  visible: boolean
  storyId: string
  storyTitle: string | null
  onClose: () => void
  onSuccess: (shippedAt: string, tracking: string | null) => void
}) {
  const [trackingInput, setTrackingInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (loading) return
    setTrackingInput('')
    setError(null)
    onClose()
  }

  const handleOpenPostApp = async () => {
    const canOpen = await Linking.canOpenURL('postapp://')
    if (canOpen) {
      Linking.openURL('postapp://')
    } else {
      Linking.openURL('https://www.post.ch/en/pages/post-app-for-smartphones')
    }
  }

  const handleConfirm = async () => {
    setError(null)
    setLoading(true)
    const trimmed = trackingInput.trim()
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('mark-shipped', {
        body: {
          story_id: storyId,
          ...(trimmed.length > 0 ? { tracking_number: trimmed } : {}),
        },
      })

      if (fnErr) {
        setError(fnErr.message ?? 'Une erreur est survenue')
        setLoading(false)
        return
      }
      if (!data?.success) {
        setError(data?.error ?? 'Une erreur est survenue')
        setLoading(false)
        return
      }

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }

      setTrackingInput('')
      setError(null)
      onSuccess(data.shipped_at, data.tracking_number ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue')
      setLoading(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={modalStyles.overlay} onPress={handleClose}>
        <Pressable style={modalStyles.sheet} onPress={e => e.stopPropagation()}>
          <Text style={modalStyles.title}>Confirmer l'expédition</Text>
          {storyTitle ? (
            <Text style={modalStyles.subtitle} numberOfLines={1}>{storyTitle}</Text>
          ) : null}
          <Text style={modalStyles.helper}>
            Une fois marqué comme expédié, l'acheteur sera notifié. Pensez à utiliser la Post-App pour générer votre étiquette.
          </Text>

          <TouchableOpacity style={modalStyles.postBtn} onPress={handleOpenPostApp} activeOpacity={0.8}>
            <Ionicons name="mail-outline" size={16} color={colors.primary} />
            <Text style={modalStyles.postBtnText}>Ouvrir la Post-App</Text>
          </TouchableOpacity>

          <Text style={modalStyles.inputLabel}>Numéro de suivi (optionnel)</Text>
          <TextInput
            style={modalStyles.input}
            value={trackingInput}
            onChangeText={setTrackingInput}
            placeholder="99.00.123456.78901234"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            maxLength={30}
            editable={!loading}
          />

          {error ? (
            <Text style={modalStyles.errorText}>{error}</Text>
          ) : null}

          <View style={modalStyles.btnRow}>
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={handleClose}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={modalStyles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.confirmBtn, loading && modalStyles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0F0F0F" />
              ) : (
                <Text style={modalStyles.confirmBtnText}>Confirmer</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 36,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.10)',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: 4,
  },
  postBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.primary,
  },
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.text,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.text,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.error,
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: colors.primary,
    minHeight: 48,
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
})

// ─── Story card ───────────────────────────────────────────────────────────────

function StoryCard({
  story,
  onStop,
  onShipped,
  onCopyTracking,
}: {
  story: SellerStory
  onStop: (id: string) => void
  onShipped: (id: string, shippedAt: string, tracking: string | null) => void
  onCopyTracking: (text: string) => void
}) {
  const [stopping, setStopping] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)

  const handleStop = async () => {
    setStopping(true)
    onStop(story.id)
    const { error } = await supabase
      .from('stories')
      .update({ status: 'expired' })
      .eq('id', story.id)
    if (error) setStopping(false)
  }

  const handleShipSuccess = (shippedAt: string, tracking: string | null) => {
    setModalVisible(false)
    onShipped(story.id, shippedAt, tracking)
  }

  // ── Status badge ──
  let badgeStyle = styles.badgeGray
  let badgeLabel = 'Expiré'
  let badgeTextColor = colors.textSecondary
  if (story.status === 'active') {
    badgeStyle = styles.badgeTeal
    badgeLabel = 'Actif'
    badgeTextColor = colors.primary
  } else if (story.status === 'sold') {
    badgeStyle = styles.badgeOrange
    badgeLabel = 'Vendu'
    badgeTextColor = '#F59E0B'
  } else if (story.status === 'shipped') {
    badgeStyle = styles.badgeGreen
    badgeLabel = 'Expédié'
    badgeTextColor = colors.success
  } else if (story.status === 'delivered') {
    badgeStyle = styles.badgeGreen
    badgeLabel = 'Livré — fonds virés'
    badgeTextColor = colors.success
  }

  return (
    <>
      <View style={styles.card}>
        <View style={styles.cardRow}>
          {/* Thumbnail */}
          <View style={styles.thumb}>
            {story.video_url ? (
              <Image source={{ uri: story.video_url }} style={styles.thumbImg} resizeMode="cover" />
            ) : (
              <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
                <Ionicons name="videocam-outline" size={22} color={colors.border} />
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.cardInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {story.title ?? 'Sans titre'}
              </Text>
              <View style={[styles.badge, badgeStyle]}>
                <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeLabel}</Text>
              </View>
            </View>
            <Text style={styles.priceText}>CHF {story.current_price_chf.toFixed(2)}</Text>
            {story.status === 'active' && (
              <Text style={styles.metaText}>Expire: {formatExpiry(story.expires_at)}</Text>
            )}
            {story.status === 'shipped' && story.shipped_at && (
              <Text style={styles.metaText}>Expédié le {formatDate(story.shipped_at)}</Text>
            )}
            {story.status === 'delivered' && story.delivered_at && (
              <Text style={styles.metaText}>Livré le {formatDate(story.delivered_at)}</Text>
            )}
          </View>
        </View>

        {/* Shipped: tracking + waiting message */}
        {story.status === 'shipped' && (
          <View style={styles.shippedInfo}>
            {story.tracking_number ? (
              <View style={styles.trackingRow}>
                <Ionicons name="barcode-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.trackingText} numberOfLines={1}>
                  {story.tracking_number}
                </Text>
                <TouchableOpacity
                  hitSlop={8}
                  activeOpacity={0.7}
                  onPress={() => onCopyTracking(story.tracking_number!)}
                >
                  <Ionicons name="copy-outline" size={15} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.awaitingText}>
              En attente de confirmation de réception par l'acheteur
            </Text>
          </View>
        )}

        {/* Actions */}
        {story.status === 'active' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={handleStop}
              disabled={stopping}
              activeOpacity={0.8}
            >
              {stopping ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={styles.stopBtnText}>Arrêter</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {story.status === 'sold' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.shipBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="send-outline" size={15} color="#0F0F0F" />
              <Text style={styles.shipBtnText}>Marquer comme expédié</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ShipModal
        visible={modalVisible}
        storyId={story.id}
        storyTitle={story.title}
        onClose={() => setModalVisible(false)}
        onSuccess={handleShipSuccess}
      />
    </>
  )
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({
  listing,
  onToggle,
  onDelete,
}: {
  listing: ShopListing
  onToggle: (id: string, next: boolean) => void
  onDelete: (id: string) => void
}) {
  const [toggling, setToggling] = useState(false)
  const thumb = listing.images?.[0] ?? null

  const handleToggle = async (val: boolean) => {
    setToggling(true)
    onToggle(listing.id, val)
    await supabase.from('shop_listings').update({ is_active: val }).eq('id', listing.id)
    setToggling(false)
  }

  const handleDelete = () => {
    Alert.alert(
      'Supprimer cette annonce ?',
      listing.title,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            onDelete(listing.id)
            await supabase.from('shop_listings').delete().eq('id', listing.id)
          },
        },
      ]
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        {/* Thumbnail */}
        <View style={styles.thumb}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
              <Ionicons name="image-outline" size={22} color={colors.border} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {listing.title}
            </Text>
            <View style={[styles.badge, listing.is_active ? styles.badgeTeal : styles.badgeGray]}>
              <Text style={[styles.badgeText, { color: listing.is_active ? colors.primary : colors.textSecondary }]}>
                {listing.is_active ? 'Actif' : 'Inactif'}
              </Text>
            </View>
          </View>
          <Text style={styles.priceText}>CHF {listing.price_chf.toFixed(2)}</Text>
          <Text style={styles.metaText}>Stock: {listing.stock}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{listing.is_active ? 'Actif' : 'Inactif'}</Text>
          <Switch
            value={listing.is_active}
            onValueChange={handleToggle}
            disabled={toggling}
            trackColor={{ false: colors.surfaceHigh, true: colors.primary }}
            thumbColor={listing.is_active ? '#0F0F0F' : colors.textSecondary}
          />
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
          <Text style={styles.deleteBtnText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellerListingsScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const { show: showToast, ToastView } = useToast()

  const [tab, setTab] = useState<Tab>('stories')
  const [stories, setStories] = useState<SellerStory[]>([])
  const [listings, setListings] = useState<ShopListing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!currentUserId) return

    const [storiesRes, listingsRes] = await Promise.all([
      supabase
        .from('stories')
        .select('id, title, video_url, current_price_chf, start_price_chf, floor_price_chf, status, expires_at, shipped_at, delivered_at, tracking_number, created_at')
        .eq('seller_id', currentUserId)
        .order('created_at', { ascending: false }),

      supabase
        .from('shop_listings')
        .select('id, title, images, price_chf, stock, is_active, category, created_at')
        .eq('seller_id', currentUserId)
        .order('created_at', { ascending: false }),
    ])

    setStories((storiesRes.data ?? []) as SellerStory[])
    setListings((listingsRes.data ?? []) as ShopListing[])
  }, [currentUserId])

  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [fetchAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  // Optimistic handlers
  const handleStopStory = useCallback((id: string) => {
    setStories(prev => prev.map(s => s.id === id ? { ...s, status: 'expired' } : s))
  }, [])

  const handleShipped = useCallback((id: string, shippedAt: string, tracking: string | null) => {
    setStories(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, status: 'shipped', shipped_at: shippedAt, tracking_number: tracking }
          : s
      )
    )
  }, [])

  const handleCopyTracking = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text)
    showToast('Copié')
  }, [showToast])

  const handleToggleListing = useCallback((id: string, next: boolean) => {
    setListings(prev => prev.map(l => l.id === id ? { ...l, is_active: next } : l))
  }, [])

  const handleDeleteListing = useCallback((id: string) => {
    setListings(prev => prev.filter(l => l.id !== id))
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes annonces</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab toggle */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'stories' && styles.tabBtnActive]}
          onPress={() => setTab('stories')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'stories' && styles.tabTextActive]}>
            Stories
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'listings' && styles.tabBtnActive]}
          onPress={() => setTab('listings')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'listings' && styles.tabTextActive]}>
            Articles
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tab === 'stories' ? (
        <FlatList
          data={stories}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <StoryCard
              story={item}
              onStop={handleStopStory}
              onShipped={handleShipped}
              onCopyTracking={handleCopyTracking}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="videocam-outline" size={44} color={colors.border} />
              <Text style={styles.emptyText}>Aucune story pour l'instant</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onToggle={handleToggleListing}
              onDelete={handleDeleteListing}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="pricetag-outline" size={44} color={colors.border} />
              <Text style={styles.emptyText}>Aucun article pour l'instant</Text>
            </View>
          }
        />
      )}

      {ToastView}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.text,
  },

  tabs: {
    flexDirection: 'row',
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#0F0F0F',
  },

  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImg: {
    width: 72,
    height: 72,
  },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.text,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeTeal:   { backgroundColor: 'rgba(0,210,184,0.12)' },
  badgeGreen:  { backgroundColor: 'rgba(16,185,129,0.12)' },
  badgeOrange: { backgroundColor: 'rgba(245,158,11,0.12)' },
  badgeGray:   { backgroundColor: colors.surfaceHigh },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  priceText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: colors.primary,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },

  shippedInfo: {
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackingText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
    flex: 1,
  },
  awaitingText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  stopBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    minWidth: 90,
    alignItems: 'center',
  },
  stopBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.error,
  },
  shipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 12,
  },
  shipBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  switchLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  deleteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    minWidth: 100,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.error,
  },

  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
})
