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
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily, spacing, fontSize } from '../../lib/theme'
import type { Story, Profile, ShopListing } from '../../types'
import i18n from '../../lib/i18n'

const PAGE_SIZE = 12

type Tab = 'stories' | 'listings'

const CATEGORIES = [
  { labelKey: 'discover.category_all', value: '' },
  { labelKey: 'discover.category_electronics', value: 'electronics' },
  { labelKey: 'discover.category_fashion', value: 'fashion' },
  { labelKey: 'discover.category_home', value: 'home' },
  { labelKey: 'discover.category_sports', value: 'sports' },
  { labelKey: 'discover.category_books', value: 'books' },
  { labelKey: 'discover.category_gaming', value: 'gaming' },
  { labelKey: 'discover.category_other', value: 'other' },
]

type StoryWithSeller = Story & { seller?: Pick<Profile, 'id' | 'username' | 'avatar_url'> }
type ListingWithSeller = ShopListing & { seller?: Pick<Profile, 'id' | 'username' | 'avatar_url'> }

function StoryCard({ item }: { item: StoryWithSeller }) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/story/${item.id}`)}
    >
      <Image source={{ uri: item.video_url }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardPrice}>CHF {item.current_price_chf.toFixed(2)}</Text>
        <Text style={styles.cardSeller} numberOfLines={1}>@{item.seller?.username ?? 'vendeur'}</Text>
      </View>
    </TouchableOpacity>
  )
}

function ListingCard({ item }: { item: ListingWithSeller }) {
  const thumb = item.images?.[0] ?? null
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => router.push(`/listing/${item.id}`)}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="image-outline" size={28} color={colors.border} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardPrice}>CHF {item.price_chf.toFixed(2)}</Text>
        <Text style={styles.cardSeller} numberOfLines={1}>@{item.seller?.username ?? 'vendeur'}</Text>
      </View>
    </TouchableOpacity>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>{i18n.t('discover.no_results')}</Text>
      <Text style={styles.emptySubtitle}>
        {tab === 'stories' ? i18n.t('discover.empty_stories') : i18n.t('discover.empty_listings')}
      </Text>
    </View>
  )
}

export default function DiscoverScreen() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('stories')
  const [category, setCategory] = useState('')

  const [stories, setStories] = useState<StoryWithSeller[]>([])
  const [listings, setListings] = useState<ListingWithSeller[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)
  const activeQueryRef = useRef('')
  const activeCategoryRef = useRef('')

  const fetchStories = useCallback(async (page: number, search: string, replace: boolean) => {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase
      .from('stories')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, to)
    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)

    const { data, error } = await q
    if (error) return

    const rows = (data ?? []) as Story[]
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

  const fetchListings = useCallback(async (page: number, search: string, cat: string, replace: boolean) => {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase
      .from('shop_listings')
      .select('id, seller_id, title, description, price_chf, images, category, condition, stock, is_active, created_at')
      .eq('is_active', true)
      .gt('stock', 0)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`)
    if (cat) q = q.eq('category', cat)

    const { data, error } = await q
    if (error) return

    const rows = (data ?? []) as ShopListing[]
    let rowsWithSellers: ListingWithSeller[] = rows
    if (rows.length > 0) {
      const sellerIds = [...new Set(rows.map(r => r.seller_id))]
      const { data: profiles } = await supabase
        .from('profiles').select('id, username, avatar_url').in('id', sellerIds)
      const map = new Map<string, Pick<Profile, 'id' | 'username' | 'avatar_url'>>()
      for (const p of profiles ?? []) map.set(p.id, p)
      rowsWithSellers = rows.map(r => ({ ...r, seller: map.get(r.seller_id) }))
    }

    setHasMore(rows.length === PAGE_SIZE)
    if (replace) setListings(rowsWithSellers)
    else setListings(prev => [...prev, ...rowsWithSellers])
  }, [])

  useEffect(() => {
    let cancelled = false
    activeQueryRef.current = query
    activeCategoryRef.current = category
    pageRef.current = 0
    setLoading(true)
    setHasMore(true)

    const fetch = activeTab === 'stories'
      ? fetchStories(0, query, true)
      : fetchListings(0, query, category, true)

    fetch.then(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, activeTab, category, fetchStories, fetchListings])

  const handleEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    pageRef.current = nextPage
    if (activeTab === 'stories') {
      await fetchStories(nextPage, activeQueryRef.current, false)
    } else {
      await fetchListings(nextPage, activeQueryRef.current, activeCategoryRef.current, false)
    }
    setLoadingMore(false)
  }, [loadingMore, hasMore, loading, activeTab, fetchStories, fetchListings])

  const data = activeTab === 'stories' ? stories : listings

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{i18n.t('discover.title')}</Text>

      {/* Search bar */}
      <View style={[styles.searchBar, focused && styles.searchFocus]}>
        <Ionicons name="search" size={18} color={colors.primary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.t('discover.search_placeholder')}
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

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {(['stories', 'listings'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => { setActiveTab(tab); setCategory('') }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
              {tab === 'stories' ? i18n.t('discover.tab_stories') : i18n.t('discover.tab_listings')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category chips — only for listings */}
      {activeTab === 'listings' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, category === c.value && styles.chipActive]}
              onPress={() => setCategory(c.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>
                {i18n.t(c.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          key={activeTab}
          data={data as any[]}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.listContent,
            data.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState tab={activeTab} />}
          ListFooterComponent={loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
          renderItem={({ item }) =>
            activeTab === 'stories'
              ? <StoryCard item={item as StoryWithSeller} />
              : <ListingCard item={item as ListingWithSeller} />
          }
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
    padding: spacing.md,
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
    marginBottom: spacing.sm,
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

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: '#0F0F0F',
  },

  chipsScroll: { marginBottom: spacing.sm },
  chipsRow: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#0F0F0F',
  },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  listContentEmpty: { flex: 1 },
  row: { gap: 8, marginBottom: 8 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImage: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceHigh },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardBody: { padding: spacing.sm },
  cardTitle: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text },
  cardPrice: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary, marginTop: 2 },
  cardSeller: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.sm,
  },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 17, color: colors.text },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
  footer: { paddingVertical: spacing.md, alignItems: 'center' },
})
