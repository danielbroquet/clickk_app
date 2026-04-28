import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

type DisplayStatus = 'paid' | 'sold' | 'shipped' | 'delivered' | 'refunded'

interface SellerInfo {
  username: string
  avatar_url: string | null
}

interface OrderItem {
  id: string
  type: 'story' | 'listing'
  // raw story id (without the "story-" prefix) — only set for story type
  story_id: string | null
  title: string
  thumbnail: string | null
  seller: SellerInfo | null
  price: number
  displayStatus: DisplayStatus
  shipped_at: string | null
  delivered_at: string | null
  tracking_number: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function resolveListingStatus(
  status: string | null,
  deliveryStatus: string | null,
): DisplayStatus {
  if (deliveryStatus === 'delivered') return 'delivered'
  if (deliveryStatus === 'shipped')   return 'shipped'
  if (status === 'refunded')          return 'refunded'
  if (status === 'paid')              return 'paid'
  return 'paid'
}

function relativeTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return "À l'instant"
  if (mins  < 60) return `Il y a ${mins} min`
  if (hours < 24) return `Il y a ${hours} h`
  if (days  < 30) return `Il y a ${days} j`
  return new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DisplayStatus, { label: string; color: string; bg: string }> = {
  sold:      { label: "En attente d'expédition", color: '#FFA755', bg: 'rgba(255,167,85,0.12)'   },
  paid:      { label: "En attente d'expédition", color: '#FFA755', bg: 'rgba(255,167,85,0.12)'   },
  shipped:   { label: 'Expédié',                 color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'   },
  delivered: { label: 'Reçu',                    color: '#10B981', bg: 'rgba(16,185,129,0.12)'   },
  refunded:  { label: 'Remboursé',               color: '#EF4444', bg: 'rgba(239,68,68,0.12)'    },
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.paid
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  item,
  onDelivered,
}: {
  item: OrderItem
  onDelivered: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const sellerInitial = (item.seller?.username ?? 'V').charAt(0).toUpperCase()

  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const handleConfirmDelivery = async () => {
    setAwaitingConfirm(false)
    setConfirming(true)
    try {
      if (item.type === 'listing') {
        const orderId = item.id.replace('order-', '')
        const { error } = await supabase
          .from('shop_orders')
          .update({
            delivery_status: 'delivered',
            delivered_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .eq('buyer_id', currentUserId)

        if (error) {
          setConfirming(false)
          return
        }
      } else {
        const { data, error } = await supabase.functions.invoke('confirm-delivery', {
          body: { story_id: item.story_id },
        })

        if (error) {
          setConfirming(false)
          return
        }

        // already_delivered counts as success
        if (!data?.success && !data?.already_delivered) {
          setConfirming(false)
          return
        }
      }

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
      onDelivered(item.id)
    } catch {
      setConfirming(false)
    }
  }

  const handleTrackParcel = () => {
    if (!item.tracking_number) return
    Linking.openURL(
      'https://service.post.ch/EasyTrack/submitParcelData.do?formattedParcelCodes=' +
        encodeURIComponent(item.tracking_number),
    )
  }

  return (
    <View style={styles.card}>
      {/* Top row: thumbnail + body */}
      <View style={styles.cardRow}>
        <View style={styles.thumb}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="image-outline" size={24} color={colors.border} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

          <View style={styles.sellerRow}>
            {item.seller?.avatar_url ? (
              <Image source={{ uri: item.seller.avatar_url }} style={styles.sellerAvatar} />
            ) : (
              <View style={styles.sellerAvatarFallback}>
                <Text style={styles.sellerAvatarText}>{sellerInitial}</Text>
              </View>
            )}
            <Text style={styles.sellerName}>@{item.seller?.username ?? 'vendeur'}</Text>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.badgeGroup}>
              <StatusBadge status={item.displayStatus} />
              {item.displayStatus === 'shipped' && item.shipped_at && (
                <Text style={styles.statusDate}>{formatDate(item.shipped_at)}</Text>
              )}
              {item.displayStatus === 'delivered' && item.delivered_at && (
                <Text style={styles.statusDate}>{formatDate(item.delivered_at)}</Text>
              )}
            </View>
            <Text style={styles.price}>CHF {item.price.toFixed(2)}</Text>
          </View>

          <Text style={styles.date}>{relativeTime(item.created_at)}</Text>
        </View>
      </View>

      {/* sold: helper text */}
      {(item.displayStatus === 'sold' || item.displayStatus === 'paid') && (
        <View style={styles.helperRow}>
          <Ionicons name="time-outline" size={13} color="#FFA755" />
          <Text style={styles.helperText}>Le vendeur prépare votre colis</Text>
        </View>
      )}

      {/* shipped: tracking + CTA */}
      {item.displayStatus === 'shipped' && (
        <View style={styles.shippedSection}>
          {item.tracking_number ? (
            <View style={styles.trackingRow}>
              <Ionicons name="barcode-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.trackingText} numberOfLines={1}>
                Numéro de suivi: {item.tracking_number}
              </Text>
            </View>
          ) : null}

          {item.tracking_number ? (
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={handleTrackParcel}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate-outline" size={14} color={colors.primary} />
              <Text style={styles.trackBtnText}>Suivre le colis</Text>
            </TouchableOpacity>
          ) : null}

          {awaitingConfirm ? (
            <View style={styles.confirmRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setAwaitingConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDestructiveBtn, confirming && styles.receivedBtnDisabled]}
                onPress={handleConfirmDelivery}
                disabled={confirming}
                activeOpacity={0.8}
              >
                {confirming ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDestructiveText}>Confirmer ✓</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.receivedBtn, confirming && styles.receivedBtnDisabled]}
              onPress={() => setAwaitingConfirm(true)}
              disabled={confirming}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#0F0F0F" />
              <Text style={styles.receivedBtnText}>J'ai bien reçu</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const { session } = useAuth()
  const [orders, setOrders]         = useState<OrderItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrders = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return

    const [storiesRes, ordersRes] = await Promise.all([
      supabase
        .from('stories')
        .select('id, created_at, final_price_chf, status, title, video_url, shipped_at, delivered_at, tracking_number, seller:profiles!seller_id(username, avatar_url)')
        .eq('buyer_id', userId)
        .order('created_at', { ascending: false }),

      supabase
        .from('shop_orders')
        .select('id, created_at, total_chf, status, delivery_status, tracking_number, delivered_at, listing:shop_listings!listing_id(id, title, images, seller:profiles!seller_id(username, avatar_url))')
        .eq('buyer_id', userId)
        .order('created_at', { ascending: false }),
    ])

    if (storiesRes.error) {
      console.error('[fetchOrders] stories query failed:', storiesRes.error)
    }
    if (ordersRes.error) {
      console.error('[fetchOrders] shop_orders query failed:', ordersRes.error)
    }

    const storyOrders: OrderItem[] = (storiesRes.data ?? []).map((s: any) => ({
      id:             `story-${s.id}`,
      type:           'story' as const,
      story_id:       s.id,
      title:          s.title ?? 'Story',
      thumbnail:      s.video_url ?? null,
      seller:         s.seller as SellerInfo | null,
      price:          s.final_price_chf ?? 0,
      displayStatus:  (s.status as DisplayStatus) ?? 'sold',
      shipped_at:     s.shipped_at ?? null,
      delivered_at:   s.delivered_at ?? null,
      tracking_number: s.tracking_number ?? null,
      created_at:     s.created_at,
    }))

    const listingOrders: OrderItem[] = (ordersRes.data ?? []).map((o: any) => ({
      id:             `order-${o.id}`,
      type:           'listing' as const,
      story_id:       null,
      title:          o.listing?.title ?? 'Article',
      thumbnail:      o.listing?.images?.[0] ?? null,
      seller:         o.listing?.seller as SellerInfo | null,
      price:          o.total_chf ?? 0,
      displayStatus:  resolveListingStatus(o.status, o.delivery_status),
      shipped_at:     null,
      delivered_at:   o.delivered_at ?? null,
      tracking_number: o.tracking_number ?? null,
      created_at:     o.created_at,
    }))

    const merged = [...storyOrders, ...listingOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )

    setOrders(merged)
  }, [session?.user?.id])

  useEffect(() => {
    setLoading(true)
    fetchOrders().finally(() => setLoading(false))
  }, [fetchOrders])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }, [fetchOrders])

  // Optimistic: mark a story order as delivered locally
  const handleDelivered = useCallback((orderId: string) => {
    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, displayStatus: 'delivered', delivered_at: new Date().toISOString() }
          : o,
      ),
    )
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes commandes</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="bag-outline" size={52} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Aucune commande</Text>
              <Text style={styles.emptySubtext}>Vos achats apparaîtront ici.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <OrderCard item={item} onDelivered={handleDelivered} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  headerRight: { width: 36 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  listContent:    { padding: spacing.md },
  emptyContainer: { flexGrow: 1, padding: spacing.md },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  separator: { height: spacing.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImg: { width: 72, height: 72 },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardBody: { flex: 1, gap: 6 },

  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },

  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerAvatar: { width: 18, height: 18, borderRadius: 9 },
  sellerAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarText: { fontSize: 9, color: colors.textSecondary, fontFamily: fontFamily.bold },
  sellerName: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },

  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  statusDate: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },

  price: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },

  date: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },

  // sold/paid helper
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  helperText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: '#FFA755',
    fontStyle: 'italic',
  },

  // shipped section
  shippedSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trackingText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
    flex: 1,
  },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.10)',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  trackBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.primary,
  },
  receivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 13,
    minHeight: 46,
  },
  receivedBtnDisabled: {
    opacity: 0.6,
  },
  receivedBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  confirmDestructiveBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    minHeight: 46,
  },
  confirmDestructiveText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#fff',
  },
})
