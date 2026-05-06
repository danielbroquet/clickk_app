import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Modal,
  Platform,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useFollow } from '../../hooks/useFollow'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'
import { getOrCreateConversation } from '../../lib/utils'
import ReportModal from '../../components/ui/ReportModal'

const SCREEN_WIDTH = Dimensions.get('window').width
const CELL_SIZE = (SCREEN_WIDTH - 4) / 2

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
  rating_avg: number
  rating_count: number
  created_at: string
}

interface Drop {
  id: string
  title: string | null
  video_url: string | null
  thumbnail_url: string | null
  current_price_chf: number
  status: string
  expires_at: string | null
}

// ─── useBlock hook ────────────────────────────────────────────────────────────

const useBlock = (currentUserId: string, targetUserId: string) => {
  const [isBlocked, setIsBlocked] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!currentUserId || !targetUserId) return
    supabase
      .from('user_blocks')
      .select('id')
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', targetUserId)
      .maybeSingle()
      .then(({ data }) => setIsBlocked(!!data))
  }, [currentUserId, targetUserId])

  const toggleBlock = async () => {
    setLoading(true)
    if (isBlocked) {
      await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', targetUserId)
      setIsBlocked(false)
    } else {
      await supabase
        .from('user_blocks')
        .insert({ blocker_id: currentUserId, blocked_id: targetUserId })
      setIsBlocked(true)
    }
    setLoading(false)
  }

  return { isBlocked, toggleBlock, loading }
}

// ─── StarRating ───────────────────────────────────────────────────────────────

function StarRating({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return null
  const stars = Math.round(avg)
  return (
    <TouchableOpacity
      style={starStyles.row}
      activeOpacity={0.8}
    >
      <View style={starStyles.stars}>
        {[1,2,3,4,5].map(i => (
          <Ionicons
            key={i}
            name={i <= stars ? 'star' : 'star-outline'}
            size={16}
            color="#FFC107"
          />
        ))}
      </View>
      <Text style={starStyles.avg}>{avg.toFixed(1)}</Text>
      <Text style={starStyles.count}>({count} avis)</Text>
    </TouchableOpacity>
  )
}

const starStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
    marginBottom: 4,
  },
  stars: { flexDirection: 'row', gap: 2 },
  avg: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginLeft: 4,
  },
  count: {
    fontSize: 13,
    color: colors.textSecondary,
  },
})

// ─── Grid cell ────────────────────────────────────────────────────────────────

function DropGridCell({ drop }: { drop: Drop }) {
  const thumb = drop.thumbnail_url ?? drop.video_url
  const status = drop.status

  return (
    <TouchableOpacity
      style={gridStyles.cell}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/(tabs)', params: { initialStoryId: drop.id } })}
    >
      {thumb ? (
        <Image source={{ uri: thumb }} style={gridStyles.thumb} resizeMode="cover" />
      ) : (
        <View style={[gridStyles.thumb, gridStyles.placeholder]}>
          <Ionicons name="videocam-outline" size={28} color={colors.border} />
        </View>
      )}

      <View style={gridStyles.priceBadge}>
        <Text style={gridStyles.priceBadgeText}>CHF {Number(drop.current_price_chf).toFixed(0)}</Text>
      </View>

      {status === 'sold' && (
        <View style={[gridStyles.statusBadge, gridStyles.statusSold]}>
          <Text style={gridStyles.statusSoldText}>Vendu ✓</Text>
        </View>
      )}
      {status === 'expired' && (
        <View style={[gridStyles.statusBadge, gridStyles.statusExpired]}>
          <Text style={gridStyles.statusExpiredText}>Expiré</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const gridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  cell: {
    width: CELL_SIZE,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  priceBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  priceBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
  statusBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  statusSold: { backgroundColor: 'rgba(0,210,184,0.2)' },
  statusSoldText: {
    color: colors.primary,
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  statusExpired: { backgroundColor: 'rgba(255,255,255,0.1)' },
  statusExpiredText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
})

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [profile, setProfile] = useState<Profile | null>(null)
  const [drops, setDrops] = useState<Drop[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const [reportUserVisible, setReportUserVisible] = useState(false)
  const [dropsCount, setDropsCount] = useState<number>(0)
  const [ventesCount, setVentesCount] = useState<number>(0)

  const { isFollowing, followersCount, toggleFollow, loading: followLoading } = useFollow(id ?? '')
  const { isBlocked, toggleBlock, loading: blockLoading } = useBlock(currentUserId, id ?? '')

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
        .select('id, username, display_name, avatar_url, bio, role, followers_count, following_count, rating_avg, rating_count, created_at')
        .eq('id', id)
        .maybeSingle(),

      supabase
        .from('stories')
        .select('id, title, video_url, thumbnail_url, current_price_chf, status, expires_at, created_at')
        .eq('seller_id', id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),

      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', id)
        .eq('status', 'active'),

      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', id)
        .eq('status', 'sold'),
    ]).then(async ([profileRes, activeRes, dropsCountRes, ventesRes]) => {
      if (profileRes.error || !profileRes.data) {
        setFetchError('Profil introuvable')
        setLoading(false)
        return
      }
      setProfile(profileRes.data as Profile)
      setDropsCount(dropsCountRes.count ?? 0)
      setVentesCount(ventesRes.count ?? 0)

      setDrops((activeRes.data ?? []) as Drop[])
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
      // silently ignore
    } finally {
      setChatLoading(false)
    }
  }, [id, currentUserId])

  const handleMenuPress = () => {
    if (Platform.OS === 'ios') {
      if (isBlocked) {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Débloquer cet utilisateur', 'Annuler'],
            cancelButtonIndex: 1,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) toggleBlock()
          }
        )
      } else {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Signaler cet utilisateur', 'Bloquer cet utilisateur', 'Annuler'],
            cancelButtonIndex: 2,
            destructiveButtonIndex: 1,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) {
              setReportUserVisible(true)
            } else if (buttonIndex === 1) {
              Alert.alert(
                'Bloquer cet utilisateur ?',
                'Il ne pourra plus voir votre profil ni vous envoyer de messages. Vous ne verrez plus son contenu dans le feed.',
                [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Bloquer', style: 'destructive', onPress: toggleBlock },
                ]
              )
            }
          }
        )
      }
    } else {
      setMenuVisible(true)
    }
  }

  // ── Header bar (reused across states) ───────────────────────────────────────
  const headerBar = (usernameLabel: string) => (
    <View style={styles.topHeader}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.topHeaderUsername} numberOfLines={1}>@{usernameLabel}</Text>
      <TouchableOpacity
        style={styles.menuBtn}
        onPress={handleMenuPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
      </TouchableOpacity>
    </View>
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {headerBar('')}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (fetchError || !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {headerBar('')}
        <View style={styles.centered}>
          <Text style={styles.errorText}>{fetchError ?? 'Profil introuvable'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const displayName = profile.display_name ?? profile.username
  const initial = displayName.charAt(0).toUpperCase()

  if (isBlocked) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {headerBar(profile.username)}
        <View style={styles.centered}>
          <Ionicons name="ban-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.blockedUsername}>@{profile.username}</Text>
          <Text style={styles.blockedMessage}>Vous avez bloqué cet utilisateur</Text>
          <TouchableOpacity
            onPress={toggleBlock}
            disabled={blockLoading}
            style={styles.unblockLink}
          >
            {blockLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.unblockLinkText}>Débloquer</Text>
            )}
          </TouchableOpacity>
        </View>

        <ReportModal
          visible={reportUserVisible}
          onClose={() => setReportUserVisible(false)}
          targetType="user"
          targetId={id ?? ''}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {headerBar(profile.username)}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile info */}
        <View style={styles.profileInfo}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>{initial}</Text>
            )}
          </View>

          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.username}>@{profile.username}</Text>

          {profile.bio ? <Text style={styles.bio} numberOfLines={3}>{profile.bio}</Text> : null}

          {profile.role === 'seller' && (
            <StarRating avg={profile.rating_avg ?? 0} count={profile.rating_count ?? 0} />
          )}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{dropsCount}</Text>
              <Text style={styles.statLabel}>Drops</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{followLoading ? '--' : followersCount}</Text>
              <Text style={styles.statLabel}>Abonnés</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{ventesCount}</Text>
              <Text style={styles.statLabel}>Ventes</Text>
            </View>
          </View>

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
                  {isFollowing ? 'Abonné' : 'Suivre'}
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
                <>
                  <Ionicons name="chatbubble-outline" size={16} color={colors.text} />
                  <Text style={styles.messageBtnText}>Message</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Drops grid */}
        {drops.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="videocam-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Ce vendeur n'a pas encore publié de drop</Text>
          </View>
        ) : (
          <View style={gridStyles.grid}>
            {drops.map(drop => (
              <DropGridCell key={drop.id} drop={drop} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Android/web action sheet fallback */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        />
        <View style={styles.actionSheet}>
          <View style={styles.sheetHandle} />
          {!isBlocked && (
            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => {
                setMenuVisible(false)
                setReportUserVisible(true)
              }}
            >
              <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.sheetOptionText}>Signaler cet utilisateur</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.sheetOption}
            onPress={() => {
              setMenuVisible(false)
              if (isBlocked) {
                toggleBlock()
              } else {
                Alert.alert(
                  'Bloquer cet utilisateur ?',
                  'Il ne pourra plus voir votre profil ni vous envoyer de messages. Vous ne verrez plus son contenu dans le feed.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Bloquer', style: 'destructive', onPress: toggleBlock },
                  ]
                )
              }
            }}
          >
            <Ionicons
              name={isBlocked ? 'checkmark-circle-outline' : 'ban-outline'}
              size={20}
              color={isBlocked ? colors.primary : colors.error}
            />
            <Text style={[styles.sheetOptionText, !isBlocked && { color: colors.error }]}>
              {isBlocked ? 'Débloquer cet utilisateur' : 'Bloquer cet utilisateur'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sheetOption, styles.sheetCancel]}
            onPress={() => setMenuVisible(false)}
          >
            <Text style={styles.sheetCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <ReportModal
        visible={reportUserVisible}
        onClose={() => setReportUserVisible(false)}
        targetType="user"
        targetId={id ?? ''}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },

  // Header
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    position: 'relative',
  },
  topHeaderUsername: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  backBtn: {
    position: 'absolute',
    left: 12,
    top: 8,
    padding: 4,
  },
  menuBtn: {
    position: 'absolute',
    right: 12,
    top: 10,
    padding: 4,
  },

  // Blocked
  blockedUsername: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  blockedMessage: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  unblockLink: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  unblockLinkText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.primary,
  },

  // Profile info
  profileInfo: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarImg: { width: 80, height: 80 },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.primary },

  displayName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    lineHeight: 22,
  },
  username: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bio: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginTop: 18,
    marginBottom: 18,
  },
  stat: { alignItems: 'center' },
  statNum: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
  followBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#0F0F0F',
  },
  followBtnTextActive: {
    color: colors.primary,
  },
  messageBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  messageBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.text,
  },

  // Empty
  emptySection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },

  // Action sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  actionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetOptionText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.text,
  },
  sheetCancel: {
    borderBottomWidth: 0,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  sheetCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
