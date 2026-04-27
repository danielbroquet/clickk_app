import React, { useCallback, useEffect, useState } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
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

// ─── Story card ───────────────────────────────────────────────────────────────

function StoryCard({
  story,
  onStop,
}: {
  story: SellerStory
  onStop: (id: string) => void
}) {
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    setStopping(true)
    onStop(story.id)
    const { error } = await supabase
      .from('stories')
      .update({ status: 'expired' })
      .eq('id', story.id)
    if (error) setStopping(false)
  }

  const statusStyle =
    story.status === 'active'
      ? styles.badgeTeal
      : story.status === 'sold'
      ? styles.badgeGreen
      : styles.badgeGray

  const statusLabel =
    story.status === 'active' ? 'Actif' : story.status === 'sold' ? 'Vendu' : 'Expiré'

  return (
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
            <View style={[styles.badge, statusStyle]}>
              <Text style={styles.badgeText}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.priceText}>CHF {story.current_price_chf.toFixed(2)}</Text>
          <Text style={styles.metaText}>Expire: {formatExpiry(story.expires_at)}</Text>
        </View>
      </View>

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
    </View>
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
              <Text style={styles.badgeText}>{listing.is_active ? 'Actif' : 'Inactif'}</Text>
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
        .select('id, title, video_url, current_price_chf, start_price_chf, floor_price_chf, status, expires_at, created_at')
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
            <StoryCard story={item} onStop={handleStopStory} />
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
  badgeTeal: { backgroundColor: 'rgba(0,210,184,0.15)' },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
  badgeGray:  { backgroundColor: colors.surfaceHigh },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
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
