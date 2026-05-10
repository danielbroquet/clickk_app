import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { toCdnUrl } from '../../lib/cdn'
import { colors, fontFamily, spacing } from '../../lib/theme'
import type { Story, Profile } from '../../types'
import { useTranslation } from '../../lib/i18n'

const PAGE_SIZE = 12

const CATEGORIES = [
  { value: 'sneakers',    label: '👟 Sneakers' },
  { value: 'vetements',   label: '👕 Vêtements' },
  { value: 'accessoires', label: '👜 Accessoires' },
  { value: 'montres',     label: '⌚ Montres' },
  { value: 'tech',        label: '📱 Tech' },
  { value: 'gaming',      label: '🎮 Gaming' },
  { value: 'maison',      label: '🏠 Maison & Déco' },
  { value: 'livres',      label: '📚 Livres & Culture' },
  { value: 'sport',       label: '⚽ Sport & Outdoor' },
  { value: 'art',         label: '🎨 Art & Collection' },
  { value: 'beaute',      label: '🧴 Beauté' },
  { value: 'auto',        label: '🚗 Auto & Moto' },
  { value: 'autre',       label: '🎁 Autre' },
]

type SortOption = 'recent' | 'expiring' | 'deal' | 'price_asc'

type StoryWithSeller = Omit<Story, 'seller'> & { seller?: Pick<Profile, 'id' | 'username' | 'avatar_url'> }

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expiré'
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function StoryCard({ item, showExpiry }: { item: StoryWithSeller; showExpiry: boolean }) {
  const thumb = toCdnUrl(item.thumbnail_url ?? item.video_url)
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/seller-feed/[sellerId]', params: { sellerId: item.seller_id, initialStoryId: item.id } })}
    >
      <View style={styles.cardImageWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={colors.border} />
          </View>
        )}
        {showExpiry && item.expires_at && (
          <View style={styles.expiryBadge}>
            <Text style={styles.expiryText}>⏱ {formatTimeLeft(item.expires_at)}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardPrice}>CHF {Number(item.current_price_chf).toFixed(2)}</Text>
        <Text style={styles.cardSeller} numberOfLines={1}>@{item.seller?.username ?? 'vendeur'}</Text>
      </View>
    </TouchableOpacity>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>{t('discover.no_results')}</Text>
      <Text style={styles.emptySubtitle}>{t('discover.empty_stories')}</Text>
    </View>
  )
}

export default function DiscoverScreen() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [showPriceInput, setShowPriceInput] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>('recent')

  const [stories, setStories] = useState<StoryWithSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)
  const activeQueryRef = useRef('')

  const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'recent',    label: t('discover.sort_recent') },
    { value: 'expiring',  label: t('discover.sort_expiring') },
    { value: 'deal',      label: t('discover.sort_deal') },
    { value: 'price_asc', label: t('discover.sort_price_asc') },
  ]

  const fetchStories = useCallback(async (
    page: number,
    search: string,
    replace: boolean,
    category: string | null,
    price: string,
    sort: SortOption,
  ) => {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('stories')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .range(from, to)

    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)
    if (category) q = q.eq('category', category)
    const maxP = parseFloat(price)
    if (!isNaN(maxP) && maxP > 0) q = q.lte('current_price_chf', maxP)

    if (sort === 'recent') {
      q = q.order('created_at', { ascending: false })
    } else if (sort === 'expiring') {
      const threeHoursLater = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
      q = q.lt('expires_at', threeHoursLater).order('expires_at', { ascending: true })
    } else if (sort === 'price_asc') {
      q = q.order('current_price_chf', { ascending: true })
    } else {
      // 'deal' — fetch recent, sort client-side by discount %
      q = q.order('created_at', { ascending: false })
    }

    const { data, error } = await q
    if (error) return

    let rows = (data ?? []) as Story[]

    if (sort === 'deal') {
      rows = [...rows].sort((a, b) => {
        const discountA = a.start_price_chf > 0
          ? (a.start_price_chf - a.current_price_chf) / a.start_price_chf
          : 0
        const discountB = b.start_price_chf > 0
          ? (b.start_price_chf - b.current_price_chf) / b.start_price_chf
          : 0
        return discountB - discountA
      })
    }

    let rowsWithSellers: StoryWithSeller[] = rows
    if (rows.length > 0) {
      const sellerIds = [...new Set(rows.map(r => r.seller_id))]
      const { data: profiles } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', sellerIds)
      const map = new Map<string, Pick<Profile, 'id' | 'username' | 'avatar_url'>>()
      for (const p of profiles ?? []) map.set(p.id, p)
      rowsWithSellers = rows.map(r => ({ ...r, seller: map.get(r.seller_id) }))
    }

    setHasMore(rows.length === PAGE_SIZE)
    if (replace) setStories(rowsWithSellers)
    else setStories(prev => [...prev, ...rowsWithSellers])
  }, [])

  useEffect(() => {
    let cancelled = false
    activeQueryRef.current = query
    pageRef.current = 0
    setLoading(true)
    setHasMore(true)

    fetchStories(0, query, true, selectedCategory, maxPrice, sortOption).then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [query, fetchStories, selectedCategory, maxPrice, sortOption])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    pageRef.current = 0
    setHasMore(true)
    await fetchStories(0, query, true, selectedCategory, maxPrice, sortOption)
    setRefreshing(false)
  }, [query, fetchStories, selectedCategory, maxPrice, sortOption])

  const handleEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    pageRef.current = nextPage
    await fetchStories(nextPage, activeQueryRef.current, false, selectedCategory, maxPrice, sortOption)
    setLoadingMore(false)
  }, [loadingMore, hasMore, loading, fetchStories, selectedCategory, maxPrice, sortOption])

  const pricePillLabel = maxPrice ? `≤ CHF ${maxPrice}` : 'Prix max'
  const priceActive = maxPrice.length > 0

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{t('discover.title')}</Text>

      <View style={[styles.searchBar, focused && styles.searchFocus]}>
        <Ionicons name="search" size={18} color={colors.primary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('discover.search_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortRow}
        style={styles.sortScroll}
      >
        {SORT_OPTIONS.map(opt => {
          const active = sortOption === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.sortPill, active ? styles.sortPillActive : styles.sortPillInactive]}
              onPress={() => setSortOption(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.sortPillText, active ? styles.sortPillTextActive : styles.sortPillTextInactive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {CATEGORIES.map(cat => {
            const active = selectedCategory === cat.value
            return (
              <TouchableOpacity
                key={cat.value}
                style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
                onPress={() => setSelectedCategory(active ? null : cat.value)}
                activeOpacity={0.75}
              >
                <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <View style={styles.priceRow}>
          <TouchableOpacity
            style={[styles.pill, priceActive ? styles.pillActive : styles.pillInactive, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            onPress={() => setShowPriceInput(v => !v)}
            activeOpacity={0.75}
          >
            <Ionicons
              name="options-outline"
              size={13}
              color={priceActive ? colors.bg : colors.textSecondary}
            />
            <Text style={[styles.pillText, priceActive ? styles.pillTextActive : styles.pillTextInactive]}>
              {pricePillLabel}
            </Text>
            {priceActive && <View style={styles.activeDot} />}
          </TouchableOpacity>
        </View>

        {showPriceInput && (
          <View style={styles.priceInputRow}>
            <TextInput
              style={styles.priceInput}
              placeholder="Prix max CHF"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={maxPrice}
              onChangeText={setMaxPrice}
            />
            <TouchableOpacity
              onPress={() => { setMaxPrice(''); setShowPriceInput(false) }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.priceClear}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.listContent,
            stories.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListFooterComponent={loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
          renderItem={({ item }) => <StoryCard item={item} showExpiry={sortOption === 'expiring'} />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 44,
    marginHorizontal: spacing.md,
    marginBottom: 0,
  },
  searchFocus: { borderColor: colors.primary },
  searchIcon: { marginLeft: 12, marginRight: 8 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  clearBtn: { paddingHorizontal: 10 },

  sortScroll: { marginTop: 8, marginBottom: 8, flexShrink: 0 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  sortPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortPillActive: {
    backgroundColor: colors.primary,
  },
  sortPillInactive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  sortPillTextActive: { color: '#0F0F0F' },
  sortPillTextInactive: { color: colors.textSecondary },

  filtersWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: colors.primary,
  },
  pillInactive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
  },
  pillTextActive: { color: colors.bg },
  pillTextInactive: { color: colors.textSecondary },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg,
    position: 'absolute',
    top: 2,
    right: 2,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginTop: 8,
  },
  priceInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  priceClear: {
    color: colors.textSecondary,
    fontSize: 15,
    paddingLeft: 8,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, flexGrow: 1 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'flex-start', paddingTop: 20 },
  row: { gap: 8, marginBottom: 8 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImageWrap: { position: 'relative' },
  cardImage: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceHigh },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  expiryBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(255,69,0,0.85)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  expiryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
  },
  cardBody: { padding: spacing.sm },
  cardTitle: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text },
  cardPrice: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary, marginTop: 2 },
  cardSeller: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 17, color: colors.text },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
  footer: { paddingVertical: spacing.md, alignItems: 'center' },
})
