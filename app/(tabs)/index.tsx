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
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily } from '../../lib/theme'
import { useGroupedStories, SellerGroup } from '../../hooks/useGroupedStories'

const PAGE_SIZE = 8
const { width: SCREEN_WIDTH } = Dimensions.get('window')

interface RawStory {
  id: string
  title: string
  current_price_chf: number
  start_price_chf: number
  floor_price_chf: number
  video_url: string
  thumbnail_url: string | null
  status: string
  created_at: string
  seller_id: string
  seller: { id: string; username: string; avatar_url: string | null } | null
}

const STORY_SELECT = `
  id, title, current_price_chf, start_price_chf, floor_price_chf,
  video_url, thumbnail_url, status, created_at, seller_id,
  seller:seller_id ( id, username, avatar_url )
`

function SellerAvatarItem({
  group,
  viewedIds,
  allSellerIds,
}: {
  group: SellerGroup
  viewedIds: Set<string>
  allSellerIds: string[]
}) {
  const displayName = group.username.length > 10 ? group.username.slice(0, 10) : group.username

  const handlePress = () => {
    const firstUnviewed = group.stories.find((s) => !viewedIds.has(s.id))
    const target = firstUnviewed ?? group.stories[0]
    if (target) {
      router.push({
        pathname: '/story/[id]',
        params: {
          id: target.id,
          sellerStoryIds: JSON.stringify(group.stories.map((s) => s.id)),
          allSellerIds: JSON.stringify(allSellerIds),
        },
      })
    }
  }

  return (
    <TouchableOpacity style={sellerAvatarStyles.item} onPress={handlePress} activeOpacity={0.75}>
      <View
        style={[
          sellerAvatarStyles.ring,
          group.hasUnviewed ? sellerAvatarStyles.ringUnviewed : sellerAvatarStyles.ringViewed,
        ]}
      >
        {group.avatarUrl ? (
          <Image source={{ uri: group.avatarUrl }} style={sellerAvatarStyles.avatar} />
        ) : (
          <View style={sellerAvatarStyles.avatarFallback}>
            <Text style={sellerAvatarStyles.avatarInitial}>
              {group.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={sellerAvatarStyles.username} numberOfLines={1}>
        {displayName}
      </Text>
    </TouchableOpacity>
  )
}

function SellerAvatarsRow() {
  const { sellerGroups, viewedIds, loading } = useGroupedStories()

  if (loading) {
    return <View style={{ height: 80, backgroundColor: 'transparent' }} />
  }

  if (sellerGroups.length === 0) return null

  return (
    <View style={sellerAvatarStyles.container}>
      <FlatList
        data={sellerGroups}
        keyExtractor={(item) => item.sellerId}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sellerAvatarStyles.listContent}
        renderItem={({ item }) => (
          <SellerAvatarItem
            group={item}
            viewedIds={viewedIds}
            allSellerIds={sellerGroups.map((g) => g.sellerId)}
          />
        )}
      />
    </View>
  )
}

function FeedHeader() {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Text style={styles.logoBlack}>click</Text>
          <Text style={styles.logoTeal}>«</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/inbox')}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/inbox')}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <SellerAvatarsRow />
    </>
  )
}

function StoryCard({
  story,
  currentUserId,
  isCardVisible,
}: {
  story: RawStory
  currentUserId: string
  isCardVisible: boolean
}) {
  const videoRef = useRef<any>(null)
  const username = story.seller?.username ?? 'vendeur'
  const avatar = story.seller?.avatar_url
  const isSeller = currentUserId === story.seller_id
  const mediaUrl = story.video_url

  const openStory = () => {
    router.push({
      pathname: '/story/[id]',
      params: { id: story.id },
    })
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.92} onPress={openStory}>
        {mediaUrl ? (
          <Video
            ref={videoRef}
            source={{ uri: mediaUrl }}
            style={styles.cardImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isCardVisible}
            isLooping
            isMuted
            useNativeControls={false}
            posterSource={story.thumbnail_url ? { uri: story.thumbnail_url } : undefined}
            usePoster={!!story.thumbnail_url}
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={36} color={colors.border} />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <View style={styles.sellerRow}>
          <TouchableOpacity
            style={styles.sellerLeft}
            activeOpacity={0.7}
            onPress={() => {
              if (story.seller?.id && story.seller.id !== currentUserId) {
                router.push(`/profile/${story.seller.id}`)
              }
            }}
            disabled={!story.seller?.id || story.seller.id === currentUserId}
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
          <View style={styles.dropBadge}>
            <Ionicons name="flash" size={12} color={colors.primary} />
            <Text style={styles.dropBadgeText}>Drop</Text>
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{story.title}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.cardPrice}>CHF {Number(story.current_price_chf).toFixed(2)}</Text>
          {!isSeller && (
            <TouchableOpacity style={styles.viewBtn} onPress={openStory} activeOpacity={0.85}>
              <Text style={styles.viewBtnText}>Voir le drop</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

const keyExtractor = (item: RawStory) => item.id

export default function FeedScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [stories, setStories] = useState<RawStory[]>([])
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
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return
    const rows = (data as unknown as RawStory[]) ?? []
    setHasMore(rows.length === PAGE_SIZE)
    if (replace) setStories(rows)
    else setStories(prev => [...prev, ...rows])
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

  const renderItem: ListRenderItem<RawStory> = useCallback(
    ({ item }) => (
      <StoryCard
        story={item}
        currentUserId={currentUserId}
        isCardVisible={visibleIds.has(item.id)}
      />
    ),
    [currentUserId, visibleIds]
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={stories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={FeedHeader}
        ListEmptyComponent={
          !loadingMore ? (
            <View style={styles.emptyState}>
              <Ionicons name="flash-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>Aucun drop actif</Text>
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
  dropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.surfaceHigh,
  },
  dropBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 6,
    lineHeight: 21,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.primary,
  },
  viewBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  viewBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#0F0F0F',
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

const sellerAvatarStyles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 16,
  },
  item: {
    alignItems: 'center',
    gap: 5,
    width: 72,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringUnviewed: {
    borderColor: '#00D2B8',
  },
  ringViewed: {
    borderColor: '#333',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.primary,
  },
  username: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 72,
  },
})
