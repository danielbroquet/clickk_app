import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useFollow } from '../../hooks/useFollow'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'
import { getOrCreateConversation } from '../../lib/utils'

const SCREEN_WIDTH = Dimensions.get('window').width
const LISTING_CELL = Math.floor((SCREEN_WIDTH - spacing.md * 2 - spacing.sm) / 2)

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  role: string | null
  followers_count: number
  following_count: number
  created_at: string
}

interface Story {
  id: string
  title: string | null
  video_url: string | null
  current_price_chf: number
  status: string
  expires_at: string | null
}

interface Listing {
  id: string
  title: string
  images: string[]
  price_chf: number
  category: string | null
  condition: string | null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StoryCard({ story }: { story: Story }) {
  return (
    <TouchableOpacity
      style={styles.storyCard}
      activeOpacity={0.85}
      onPress={() => router.push(`/story/${story.id}`)}
    >
      {story.video_url ? (
        <Image source={{ uri: story.video_url }} style={styles.storyThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.storyThumb, styles.thumbPlaceholder]}>
          <Ionicons name="videocam-outline" size={28} color={colors.border} />
        </View>
      )}
      <View style={styles.storyPriceBadge}>
        <Text style={styles.storyPriceText}>CHF {story.current_price_chf.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const thumb = listing.images?.[0] ?? null
  return (
    <TouchableOpacity
      style={styles.listingCard}
      activeOpacity={0.85}
      onPress={() => router.push(`/listing/${listing.id}`)}
    >
      <View style={styles.listingThumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.listingThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.listingThumb, styles.thumbPlaceholder]}>
            <Ionicons name="image-outline" size={24} color={colors.border} />
          </View>
        )}
      </View>
      <View style={styles.listingInfo}>
        <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
        <Text style={styles.listingPrice}>CHF {listing.price_chf.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [profile, setProfile]   = useState<Profile | null>(null)
  const [stories, setStories]   = useState<Story[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading]   = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)

  const { isFollowing, followersCount, toggleFollow, loading: followLoading } = useFollow(id ?? '')

  // Redirect to own profile tab
  useEffect(() => {
    if (id && currentUserId && id === currentUserId) {
      router.replace('/(tabs)/profile')
    }
  }, [id, currentUserId])

  useEffect(() => {
    if (!id) return

    setLoading(true)
    Promise.all([
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, role, followers_count, following_count, created_at')
        .eq('id', id)
        .maybeSingle(),

      supabase
        .from('stories')
        .select('id, title, video_url, current_price_chf, start_price_chf, floor_price_chf, status, expires_at, created_at')
        .eq('seller_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),

      supabase
        .from('shop_listings')
        .select('id, title, images, price_chf, category, condition')
        .eq('seller_id', id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]).then(([profileRes, storiesRes, listingsRes]) => {
      if (profileRes.error || !profileRes.data) {
        setFetchError('Profil introuvable')
      } else {
        setProfile(profileRes.data as Profile)
      }
      setStories((storiesRes.data ?? []) as Story[])
      setListings((listingsRes.data ?? []) as Listing[])
      setLoading(false)
    })
  }, [id])

  const handleMessage = useCallback(async () => {
    if (!id || !currentUserId) return
    setChatLoading(true)
    try {
      const convId = await getOrCreateConversation(supabase, currentUserId, id)
      router.push(`/conversation/${convId}`)
    } catch {
      // silently ignore — user stays on profile
    } finally {
      setChatLoading(false)
    }
  }, [id, currentUserId])

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (fetchError || !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{fetchError ?? 'Profil introuvable'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const displayName = profile.display_name ?? profile.username
  const initial     = displayName.charAt(0).toUpperCase()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Floating back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>{initial}</Text>
            )}
          </View>

          {/* Name + bio */}
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{followersCount}</Text>
              <Text style={styles.statLabel}>Abonnés</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{profile.following_count ?? 0}</Text>
              <Text style={styles.statLabel}>Abonnements</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              onPress={toggleFollow}
              disabled={followLoading}
              activeOpacity={0.8}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? colors.primary : '#0F0F0F'} />
              ) : (
                <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {isFollowing ? 'Abonné' : "S'abonner"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.messageBtn}
              onPress={handleMessage}
              disabled={chatLoading}
              activeOpacity={0.8}
            >
              {chatLoading ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Stories section ─────────────────────────────────────────────── */}
        {stories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stories en cours</Text>
            <FlatList
              data={stories}
              keyExtractor={s => s.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storiesRow}
              renderItem={({ item }) => <StoryCard story={item} />}
            />
          </View>
        )}

        {/* ── Listings section ────────────────────────────────────────────── */}
        {listings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Articles</Text>
            <View style={styles.listingsGrid}>
              {listings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </View>
          </View>
        )}

        {/* Empty state when seller has nothing */}
        {stories.length === 0 && listings.length === 0 && (
          <View style={styles.emptySection}>
            <Ionicons name="storefront-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Aucun contenu pour l'instant</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },

  backBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarImg:     { width: 80, height: 80 },
  avatarInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.primary,
  },

  displayName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
    marginBottom: 2,
  },
  username: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  bio: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.lg,
  },
  stat: { alignItems: 'center' },
  statNum: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  followBtn: {
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
  followBtnTextActive: {
    color: colors.primary,
  },
  messageBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },

  // ── Story cards ───────────────────────────────────────────────────────────
  storiesRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  storyCard: {
    width: 120,
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  storyThumb: {
    width: 120,
    height: 180,
  },
  storyPriceBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,210,184,0.85)',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  storyPriceText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: '#0F0F0F',
  },

  // ── Listing grid ──────────────────────────────────────────────────────────
  listingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  listingCard: {
    width: LISTING_CELL,
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  listingThumbWrap: {
    width: LISTING_CELL,
    height: LISTING_CELL,
  },
  listingThumb: {
    width: LISTING_CELL,
    height: LISTING_CELL,
  },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingInfo: {
    padding: spacing.sm,
  },
  listingTitle: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
    marginBottom: 3,
  },
  listingPrice: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: colors.primary,
  },

  // ── Empty ─────────────────────────────────────────────────────────────────
  emptySection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
})
