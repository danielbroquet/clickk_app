import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Story, SpeedPreset } from '../../types'
import StoryCarousel from '../../components/feed/StoryCarousel'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily } from '../../lib/theme'
import i18n from '../../lib/i18n'

const PAGE_SIZE = 8

interface RawStory {
  id: string
  seller_id: string
  title: string
  description: string | null
  video_url: string
  start_price_chf: number
  floor_price_chf: number
  current_price_chf: number
  price_drop_seconds: number
  speed_preset: SpeedPreset
  status: 'active' | 'sold' | 'expired'
  buyer_id: string | null
  final_price_chf: number | null
  expires_at: string
  last_drop_at: string
  video_duration_seconds: number | null
  duration_hours: 24 | 72 | 168 | null
  created_at: string
  updated_at: string
  profiles: { id: string; username: string; avatar_url: string | null } | null
}

function rawToStory(r: RawStory): Story {
  return {
    id: r.id,
    seller_id: r.seller_id,
    title: r.title,
    description: r.description,
    video_url: r.video_url,
    start_price_chf: r.start_price_chf,
    floor_price_chf: r.floor_price_chf,
    current_price_chf: r.current_price_chf,
    price_drop_seconds: r.price_drop_seconds,
    speed_preset: r.speed_preset,
    status: r.status,
    buyer_id: r.buyer_id,
    final_price_chf: r.final_price_chf,
    expires_at: r.expires_at,
    last_drop_at: r.last_drop_at,
    video_duration_seconds: r.video_duration_seconds ?? undefined,
    duration_hours: r.duration_hours ?? undefined,
    created_at: r.created_at,
    seller: r.profiles
      ? {
          id: r.profiles.id,
          username: r.profiles.username,
          display_name: null,
          role: 'seller',
          avatar_url: r.profiles.avatar_url,
          bio: null,
          preferred_language: 'fr',
          followers_count: 0,
          following_count: 0,
          stripe_customer_id: null,
          is_verified: false,
          created_at: '',
        }
      : undefined,
  }
}

const STORY_SELECT = `
  id, seller_id, title, description,
  video_url, start_price_chf, floor_price_chf,
  current_price_chf, price_drop_seconds,
  status, expires_at, speed_preset,
  buyer_id, final_price_chf, last_drop_at,
  video_duration_seconds, duration_hours,
  created_at, updated_at,
  profiles:seller_id (id, username, avatar_url)
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
          <TouchableOpacity>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity>
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

function FeedCard({ story }: { story: Story }) {
  const seller = story.seller?.username ?? 'vendeur'
  return (
    <TouchableOpacity style={styles.feedCard} activeOpacity={0.85}>
      <View style={styles.feedCardHeader}>
        <View style={styles.feedAvatar}>
          <Text style={styles.feedAvatarText}>{seller.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.feedUsername}>@{seller}</Text>
      </View>
      <View style={styles.feedBody}>
        <Text style={styles.feedTitle} numberOfLines={2}>{story.title}</Text>
        <Text style={styles.feedPrice}>CHF {story.current_price_chf.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  )
}

const renderItem: ListRenderItem<Story> = ({ item }) => <FeedCard story={item} />
const keyExtractor = (item: Story) => item.id

export default function FeedScreen() {
  const [stories, setStories] = useState<Story[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)

  const fetchPage = useCallback(async (page: number, replace: boolean) => {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return
    const rows = (data as unknown as RawStory[]).map(rawToStory)
    setHasMore(rows.length === PAGE_SIZE)
    if (replace) {
      setStories(rows)
    } else {
      setStories(prev => [...prev, ...rows])
    }
  }, [])

  // Initial load
  useEffect(() => {
    pageRef.current = 0
    fetchPage(0, true)
  }, [fetchPage])

  // Realtime INSERT subscription
  useEffect(() => {
    const channel = supabase
      .channel('feed-stories-insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories', filter: 'status=eq.active' },
        (payload) => {
          const r = payload.new as RawStory
          const story = rawToStory(r)
          setStories(prev => [story, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleEndReached = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    pageRef.current = nextPage
    await fetchPage(nextPage, false)
    setLoadingMore(false)
  }, [loadingMore, hasMore, fetchPage])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={stories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={<FeedHeader />}
        ListFooterComponent={loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
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
  carouselSection: { paddingTop: 16, paddingBottom: 16 },
  carouselTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  feedCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
    padding: 14,
  },
  feedCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  feedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  feedAvatarText: { fontFamily: fontFamily.bold, fontSize: 14, color: '#0F0F0F' },
  feedUsername: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.textSecondary },
  feedBody: {},
  feedTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text, marginBottom: 4 },
  feedPrice: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.primary },
  footer: { paddingVertical: 16, alignItems: 'center' },
})
