import React, { useState, useEffect, useCallback, useRef } from 'react'
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

const isVideo = (url: string) =>
  ['mp4', 'mov', 'avi', 'webm'].includes(url.split('.').pop()?.toLowerCase() ?? '')

function ListingCard({
  listing,
  currentUserId,
  isCardVisible,
}: {
  listing: RawListing
  currentUserId: string
  isCardVisible: boolean
}) {
  const [chatLoading, setChatLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const videoRef = useRef<any>(null)
  const username = listing.seller?.username ?? 'vendeur'
  const avatar = listing.seller?.avatar_url
  const isSeller = currentUserId === listing.seller_id
  const images = listing.images?.length > 0 ? listing.images : []
  const multiImage = images.length > 1

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
    <View style={styles.card}>
      {/* Swipeable image area */}
      {images.length > 0 ? (
        <View>
          <FlatList
            data={images}
            keyExtractor={(url, i) => `${listing.id}-img-${i}`}
            horizontal={true}
            pagingEnabled={true}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={true}
            nestedScrollEnabled={true}
            decelerationRate="fast"
            snapToAlignment="center"
            onMomentumScrollEnd={(e) => {
              const index = Math.round(
                e.nativeEvent.contentOffset.x /
                e.nativeEvent.layoutMeasurement.width
              )
              setActiveIndex(index)
            }}
            renderItem={({ item: url, index: itemIndex }) => (
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => router.push(`/listing/${listing.id}`)}
              >
                {isVideo(url) ? (
                  <Video
                    ref={itemIndex === activeIndex ? videoRef : undefined}
                    source={{ uri: url }}
                    style={styles.cardImage}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={isCardVisible && activeIndex === itemIndex}
                    isLooping={true}
                    isMuted={true}
                    useNativeControls={false}
                  />
                ) : (
                  <Image source={{ uri: url }} style={styles.cardImage} resizeMode="cover" />
                )}
              </TouchableOpacity>
            )}
          />
          {multiImage && (
            <View style={styles.dotsRow}>
              {images.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => router.push(`/listing/${listing.id}`)}
        >
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={36} color={colors.border} />
          </View>
        </TouchableOpacity>
      )}

      {/* Info block */}
      <View style={styles.cardBody}>
        {/* Seller row */}
        <View style={styles.sellerRow}>
          <TouchableOpacity
            style={styles.sellerLeft}
            activeOpacity={0.7}
            onPress={() => {
              if (listing.seller?.id && listing.seller.id !== currentUserId) {
                router.push(`/profile/${listing.seller.id}`)
              }
            }}
            disabled={!listing.seller?.id || listing.seller.id === currentUserId}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.username}>@{username}</Text>
          </TouchableOpacity>
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
    </View>
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
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const pageRef = useRef(0)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 })

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

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const ids = new Set<string>(viewableItems.map((v: any) => v.item.id))
    setVisibleIds(ids)
  }, [])

  const renderItem: ListRenderItem<RawListing> = useCallback(
    ({ item }) => (
      <ListingCard
        listing={item}
        currentUserId={currentUserId}
        isCardVisible={visibleIds.has(item.id)}
      />
    ),
    [currentUserId, visibleIds]
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
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
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
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 12,
    backgroundColor: '#00D2B8',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#555',
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
