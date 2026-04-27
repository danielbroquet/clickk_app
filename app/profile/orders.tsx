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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'

// status comes from shop_orders.status (paid/refunded)
// delivery_status comes from shop_orders.delivery_status (shipped/delivered)
type DisplayStatus = 'paid' | 'sold' | 'shipped' | 'delivered' | 'refunded'

interface SellerInfo {
  username: string
  avatar_url: string | null
}

interface OrderItem {
  id: string
  type: 'story' | 'listing'
  title: string
  thumbnail: string | null
  seller: SellerInfo | null
  price: number
  displayStatus: DisplayStatus
  created_at: string
}

const STATUS_CONFIG: Record<DisplayStatus, { label: string; color: string; bg: string }> = {
  sold:      { label: "En attente d'expédition", color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  paid:      { label: "En attente d'expédition", color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  shipped:   { label: 'Expédié',                 color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  delivered: { label: 'Livré',                   color: '#10B981', bg: 'rgba(16,185,129,0.12)'  },
  refunded:  { label: 'Remboursé',               color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
}

function resolveListingStatus(
  status: string | null,
  deliveryStatus: string | null
): DisplayStatus {
  if (deliveryStatus === 'delivered') return 'delivered'
  if (deliveryStatus === 'shipped')   return 'shipped'
  if (status === 'refunded')          return 'refunded'
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

function StatusBadge({ status }: { status: DisplayStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.paid
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  )
}

function OrderCard({ item }: { item: OrderItem }) {
  const sellerInitial = (item.seller?.username ?? 'V').charAt(0).toUpperCase()

  return (
    <View style={styles.card}>
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
          <StatusBadge status={item.displayStatus} />
          <Text style={styles.price}>CHF {item.price.toFixed(2)}</Text>
        </View>

        <Text style={styles.date}>{relativeTime(item.created_at)}</Text>
      </View>
    </View>
  )
}

export default function OrdersScreen() {
  const { session } = useAuth()
  const [orders, setOrders]     = useState<OrderItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrders = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return

    const [storiesRes, ordersRes] = await Promise.all([
      supabase
        .from('stories')
        .select('id, created_at, final_price_chf, status, title, video_url, seller:profiles!seller_id(username, avatar_url)')
        .eq('buyer_id', userId)
        .order('created_at', { ascending: false }),

      supabase
        .from('shop_orders')
        .select('id, created_at, total_chf, status, delivery_status, listing:shop_listings(id, title, images, seller:profiles!seller_id(username, avatar_url))')
        .eq('buyer_id', userId)
        .order('created_at', { ascending: false }),
    ])

    const storyOrders: OrderItem[] = (storiesRes.data ?? []).map((s: any) => ({
      id:            `story-${s.id}`,
      type:          'story' as const,
      title:         s.title ?? 'Story',
      thumbnail:     s.video_url ?? null,
      seller:        s.seller as SellerInfo | null,
      price:         s.final_price_chf ?? 0,
      displayStatus: (s.status as DisplayStatus) ?? 'sold',
      created_at:    s.created_at,
    }))

    const listingOrders: OrderItem[] = (ordersRes.data ?? []).map((o: any) => ({
      id:            `order-${o.id}`,
      type:          'listing' as const,
      title:         o.listing?.title ?? 'Article',
      thumbnail:     o.listing?.images?.[0] ?? null,
      seller:        o.listing?.seller as SellerInfo | null,
      price:         o.total_chf ?? 0,
      displayStatus: resolveListingStatus(o.status, o.delivery_status),
      created_at:    o.created_at,
    }))

    const merged = [...storyOrders, ...listingOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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
          renderItem={({ item }) => <OrderCard item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  )
}

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
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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
})
