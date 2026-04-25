import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import StoryCarousel from '../../components/feed/StoryCarousel'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily } from '../../lib/theme'
import i18n from '../../lib/i18n'

const PAGE_SIZE = 8
const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface RawListing {
  id: string
  title: string
  price_chf: number
  images: string[]
  category: string | null
  condition: string | null
  stock: number
  created_at: string
  seller_id: string
  seller: { id: string; username: string; avatar_url: string | null } | null
}

const LISTING_SELECT = `
  id, title, price_chf, images, category,
  condition, stock, created_at, seller_id,
  seller:seller_id ( id, username, avatar_url )
`

function FeedHeader() {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Text style={styles.logoBlack}>click</Text>
          <Text style={styles.logoTeal}>«</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/messages')}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/notifications')}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.carouselSection}>
        <Text style={styles.carouselTitle}>{i18n.t('feed.activeAuctions')}</Text>
        <StoryCarousel />
      </View>
    </>
  )
}

function ListingCard({
  listing,
  currentUserId,
}: {
  listing: RawListing
  currentUserId: string
}) {
  const [chatLoading, setChatLoading] = useState(false)
  const username = listing.seller?.username ?? 'vendeur'
  const avatar = listing.seller?.avatar_url
  const isSeller = currentUserId === listing.seller_id
  const image = listing.images?.[0] ?? null

  const handleChat = async () => {
    if (isSeller || chatLoading) return
    setChatLoading(true)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .upsert(
          { buyer_id: currentUserId, seller_id: listing.seller_id, story_id: listing.id },
          { onConflict: 'buyer_id,seller_id,story_id', ignoreDuplicates: false }
        )
        .select('id')
        .single()
      if (!error && data) router.push(`/conversation/${data.id}`)
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
      onPress={() => router.push(`/listing/${listing.id}`)}
    >
      {/* Square image */}
      {image ? (
        <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Ionicons name="image-outline" size={36} color={colors.border} />
        </View>
      )}

      {/* Info block */}
      <View style={styles.cardBody}>
        {/* Seller row */}
        <View style={styles.sellerRow}>
          <View style={styles.sellerLeft}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.username}>@{username}</Text>
          </View>
          <View style={styles.rowRight}>
            {listing.category ? (
              <View style={styles.categoryPill}>
                <Text style={styles.categoryText}>{listing.category}</Text>
              </View>
            ) : null}
            {!isSeller && (
              <TouchableOpacity
                onPress={handleChat}
                disabled={chatLoading}
                hitSlop={8}
                activeOpacity={0.7}
              >
                {chatLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chatbubble-outline" size={22} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Title */}
        <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>

        {/* Price */}
        <Text style={styles.cardPrice}>CHF {listing.price_chf.toFixed(2)}</Text>

        {/* Condition */}
        {listing.condition ? (
          <Text style={styles.cardCondition}>{listing.condition}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const keyExtractor = (item: RawListing) => item.id

export default function FeedScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [listings, setListings] = useState<RawListing[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)

  const fetchPage = useCallback(async (page: number, replace: boolean) => {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('shop_listings')
      .select(LISTING_SELECT)
      .eq('is_active', true)
      .gt('stock', 0)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return
    const rows = (data as unknown as RawListing[]) ?? []
    setHasMore(rows.length === PAGE_SIZE)
    if (replace) setListings(rows)
    else setListings(prev => [...prev, ...rows])
  }, [])

  useEffect(() => {
    pageRef.current = 0
    fetchPage(0, true)
  }, [fetchPage])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    pageRef.current = 0
    await fetchPage(0, true)
    setRefreshing(false)
  }, [fetchPage])

  const handleEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    pageRef.current = nextPage
    await fetchPage(nextPage, false)
    setLoadingMore(false)
  }, [loadingMore, hasMore, fetchPage])

  const renderItem: ListRenderItem<RawListing> = useCallback(
    ({ item }) => <ListingCard listing={item} currentUserId={currentUserId} />,
    [currentUserId]
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={listings}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={<FeedHeader />}
        ListEmptyComponent={
          !loadingMore ? (
            <View style={styles.emptyState}>
              <Ionicons name="bag-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>Aucun article disponible</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoBlack: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.text },
  logoTeal: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.primary },
  headerIcons: { flexDirection: 'row', gap: 16 },
  carouselSection: { paddingTop: 16, paddingBottom: 8 },
  carouselTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface,
    marginBottom: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  cardImagePlaceholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    padding: 14,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sellerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.primary,
  },
  username: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.surfaceHigh,
  },
  categoryText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
    lineHeight: 21,
  },
  cardPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.primary,
    marginBottom: 4,
  },
  cardCondition: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  footer: { paddingVertical: 16, alignItems: 'center' },
})
