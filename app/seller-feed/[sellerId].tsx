import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  ListRenderItem,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { DropItem, STORY_SELECT, type FeedStory } from '../(tabs)/index'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const keyExtractor = (item: FeedStory) => item.id

export default function SellerFeedScreen() {
  const { sellerId, initialStoryId, showAll } = useLocalSearchParams<{
    sellerId: string
    initialStoryId?: string
    showAll?: string
  }>()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const insets = useSafeAreaInsets()

  const [stories, setStories] = useState<FeedStory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [sellerUsername, setSellerUsername] = useState<string>('')

  const flatListRef = useRef<FlatList<FeedStory>>(null)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 })
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index ?? 0)
      }
    }
  ).current

  const headerOpacity = useSharedValue(1)
  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.value }))

  useEffect(() => {
    headerOpacity.value = withDelay(3000, withTiming(0, { duration: 400 }))
  }, [])

  useEffect(() => {
    if (!sellerId) return
    let mounted = true
    ;(async () => {
      let storiesQuery = supabase
        .from('stories')
        .select(STORY_SELECT)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })

      if (showAll === 'true') {
        storiesQuery = storiesQuery.in('status', ['active', 'sold', 'shipped', 'delivered'])
      } else {
        storiesQuery = storiesQuery
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
      }

      const [storiesRes, profileRes] = await Promise.all([
        storiesQuery,
        supabase
          .from('profiles')
          .select('username')
          .eq('id', sellerId)
          .maybeSingle(),
      ])
      if (!mounted) return
      const rows = (storiesRes.data ?? []) as unknown as FeedStory[]
      setStories(rows)
      setSellerUsername(profileRes.data?.username ?? '')

      if (initialStoryId) {
        const idx = rows.findIndex((s) => s.id === initialStoryId)
        if (idx > 0) {
          setActiveIndex(idx)
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: idx, animated: false })
          }, 0)
        }
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [sellerId, initialStoryId])

  const handleSwipeDown = useCallback(() => {
    if (router.canGoBack()) router.back()
  }, [])

  const renderItem: ListRenderItem<FeedStory> = useCallback(
    ({ item, index }) => (
      <DropItem
        story={item}
        active={index === activeIndex}
        isPreload={index === activeIndex + 1}
        shouldUnload={Math.abs(index - activeIndex) > 1}
        tabFocused={true}
        onSwipeDown={handleSwipeDown}
        currentUserId={currentUserId}
      />
    ),
    [activeIndex, currentUserId, handleSwipeDown]
  )

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index }),
    []
  )

  const backBtn = (
    <TouchableOpacity
      style={[styles.backBtn, { top: insets.top + 12 }]}
      onPress={() => router.back()}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#00D2B8" />
        </View>
        {backBtn}
      </View>
    )
  }

  if (stories.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Ionicons name="flash-outline" size={48} color="#555" />
          <Text style={styles.emptyText}>Aucun drop actif</Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.backLinkText}>Retour</Text>
          </TouchableOpacity>
        </View>
        {backBtn}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={flatListRef}
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
        initialScrollIndex={
          initialStoryId
            ? Math.max(0, stories.findIndex((s) => s.id === initialStoryId))
            : 0
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({
              offset: info.index * SCREEN_HEIGHT,
              animated: false,
            })
          }, 100)
        }}
      />

      {backBtn}

      {sellerUsername ? (
        <Animated.View
          style={[styles.headerPill, { top: insets.top + 14 }, headerStyle]}
          pointerEvents="none"
        >
          <Text style={styles.headerPillText}>@{sellerUsername}</Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#000',
  },
  emptyText: { color: '#999', fontSize: 15, fontWeight: '600' },
  backBtn: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  headerPill: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
  headerPillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  backLink: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#00D2B8',
  },
  backLinkText: { color: '#0F0F0F', fontWeight: '700', fontSize: 14 },
})
