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
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing, fontSize } from '../../lib/theme'
import i18n from '../../lib/i18n'

interface WatchlistStory {
  id: string
  title: string
  current_price_chf: number
  start_price_chf: number
  floor_price_chf: number
  thumbnail_url: string | null
  video_url: string
  status: string
  buyer_id: string | null
  created_at: string
  expires_at: string
}

interface WatchlistRow {
  id: string
  story_id: string
  story: WatchlistStory
}

const STORY_SELECT = `
  id, story_id,
  stories!watchlist_story_id_fkey (
    id, title, current_price_chf, start_price_chf, floor_price_chf,
    thumbnail_url, video_url, status, buyer_id, created_at, expires_at
  )
`

function computePrice(s: WatchlistStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  const elapsed = Date.now() - new Date(s.created_at).getTime()
  if (total <= 0) return s.floor_price_chf
  const r = Math.min(Math.max(elapsed / total, 0), 1)
  return Math.max(s.start_price_chf - (s.start_price_chf - s.floor_price_chf) * r, s.floor_price_chf)
}

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expiré'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function WatchlistCard({ row, onRemoved }: { row: WatchlistRow; onRemoved: (id: string) => void }) {
  const story = row.story
  const [price, setPrice] = useState(() => computePrice(story))
  const [timeLeft, setTimeLeft] = useState(() => formatTimeLeft(story.expires_at))

  useEffect(() => {
    const h = setInterval(() => {
      setPrice(computePrice(story))
      setTimeLeft(formatTimeLeft(story.expires_at))
    }, 1000)
    return () => clearInterval(h)
  }, [story])

  const isSold = story.status === 'sold' || story.buyer_id !== null
  const isExpired = new Date(story.expires_at).getTime() <= Date.now()
  const inactive = isSold || isExpired

  const { session } = useAuth()
  const userId = session?.user?.id

  const handleRemove = async () => {
    if (!userId) return
    onRemoved(row.id)
    await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('story_id', story.id)
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardMedia}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/story/[id]', params: { id: story.id } })}
      >
        {story.thumbnail_url ? (
          <Image source={{ uri: story.thumbnail_url }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailFallback]}>
            <Ionicons name="videocam-outline" size={24} color={colors.border} />
          </View>
        )}
        {inactive && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldOverlayText}>{isSold ? 'Vendu' : 'Expiré'}</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{story.title}</Text>

        <View style={styles.priceRow}>
          <Text style={[styles.price, inactive && styles.priceInactive]}>
            CHF {price.toFixed(2)}
          </Text>
          {!inactive && (
            <View style={styles.timePill}>
              <Ionicons name="time-outline" size={11} color={colors.warning} />
              <Text style={styles.timeText}>{timeLeft}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.viewBtn, inactive && styles.viewBtnDisabled]}
            activeOpacity={0.8}
            disabled={inactive}
            onPress={() => router.push({ pathname: '/story/[id]', params: { id: story.id } })}
          >
            <Text style={[styles.viewBtnText, inactive && styles.viewBtnTextDisabled]}>
              {inactive ? (isSold ? 'Vendu' : 'Expiré') : 'Voir le drop'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} activeOpacity={0.7}>
            <Ionicons name="heart" size={18} color="#FF4757" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const keyExtractor = (item: WatchlistRow) => item.id

export default function WatchlistScreen() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const [rows, setRows] = useState<WatchlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchWatchlist = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('watchlist')
      .select(STORY_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.log('[watchlist] fetch error', error)
      setLoading(false)
      setRefreshing(false)
      return
    }

    // Supabase returns the joined table under the FK constraint name ("stories")
    // Normalize it to the expected "story" field
    const normalized = (data ?? []).map((r: any) => ({
      id: r.id,
      story_id: r.story_id,
      story: r.stories ?? r.story ?? null,
    })).filter((r: any) => r.story !== null)

    setRows(normalized as WatchlistRow[])
    setLoading(false)
    setRefreshing(false)
  }, [userId])

  useEffect(() => {
    fetchWatchlist()
  }, [fetchWatchlist])

  // Real-time: subscribe to price changes on watchlisted stories
  useEffect(() => {
    if (rows.length === 0) return

    const storyIds = rows.map((r) => r.story_id)

    channelRef.current?.unsubscribe()
    channelRef.current = supabase
      .channel('watchlist-stories')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories',
          filter: `id=in.(${storyIds.join(',')})`,
        },
        (payload) => {
          const updated = payload.new as WatchlistStory
          setRows((prev) =>
            prev.map((r) =>
              r.story_id === updated.id ? { ...r, story: { ...r.story, ...updated } } : r
            )
          )
        }
      )
      .subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [rows.length])

  const handleRemoved = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId))
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchWatchlist()
  }, [fetchWatchlist])

  const renderItem: ListRenderItem<WatchlistRow> = useCallback(
    ({ item }) => <WatchlistCard row={item} onRemoved={handleRemoved} />,
    [handleRemoved]
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{i18n.t('watchlist.title')}</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{i18n.t('watchlist.title')}</Text>
        {rows.length > 0 && (
          <Text style={styles.headerCount}>{rows.length} drop{rows.length > 1 ? 's' : ''}</Text>
        )}
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={52} color={colors.border} />
          <Text style={styles.emptyTitle}>{i18n.t('watchlist.empty_title')}</Text>
          <Text style={styles.emptyMessage}>{i18n.t('watchlist.empty_message')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
  },
  headerCount: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.text,
    textAlign: 'center',
  },
  emptyMessage: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  list: { padding: spacing.md, gap: 12 },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardMedia: { width: 100 },
  thumbnail: { width: 100, height: 120 },
  thumbnailFallback: {
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldOverlayText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  cardBody: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.primary,
  },
  priceInactive: { color: colors.textSecondary },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.warning,
  },

  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewBtn: {
    flex: 1,
    height: 34,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewBtnDisabled: { backgroundColor: colors.surfaceHigh },
  viewBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: '#0F0F0F',
  },
  viewBtnTextDisabled: { color: colors.textSecondary },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,71,87,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
