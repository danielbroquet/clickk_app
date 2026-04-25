import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { MessageSquare } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  id: string
  display_name: string | null
  avatar_url: string | null
}

interface MessageRow {
  content: string
  created_at: string
  sender_id: string
  read_at: string | null
}

interface Conversation {
  id: string
  story_id: string
  updated_at: string
  buyer: Participant
  seller: Participant
  story: { id: string; title: string; video_url: string } | null
  messages: MessageRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'maintenant'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}j`
  const weeks = Math.floor(days / 7)
  return `${weeks}sem`
}

function lastMessage(messages: MessageRow[]): string {
  if (!messages.length) return ''
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const text = sorted[0].content ?? ''
  return text.length > 40 ? text.slice(0, 40) + '…' : text
}

function unreadCount(messages: MessageRow[], userId: string): number {
  return messages.filter((m) => m.read_at === null && m.sender_id !== userId).length
}

function otherUser(conv: Conversation, userId: string): Participant {
  return conv.buyer.id === userId ? conv.seller : conv.buyer
}

// ── Row component ─────────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  userId,
  onPress,
}: {
  conv: Conversation
  userId: string
  onPress: () => void
}) {
  const other = otherUser(conv, userId)
  const preview = lastMessage(conv.messages)
  const badge = unreadCount(conv.messages, userId)
  const time = relativeTime(conv.updated_at)

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      {other.avatar_url ? (
        <Image source={{ uri: other.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>
            {(other.display_name ?? '?')[0].toUpperCase()}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>
            {other.display_name ?? 'Utilisateur'}
          </Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {conv.story && (
          <Text style={styles.storyTitle} numberOfLines={1}>
            {conv.story.title}
          </Text>
        )}
        <Text
          style={[styles.preview, badge > 0 && styles.previewUnread]}
          numberOfLines={1}
        >
          {preview || 'Aucun message'}
        </Text>
      </View>

      {/* Unread badge */}
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    if (!userId) return
    try {
      const { data, error: err } = await supabase
        .from('conversations')
        .select(`
          id,
          story_id,
          updated_at,
          buyer:buyer_id ( id, display_name, avatar_url ),
          seller:seller_id ( id, display_name, avatar_url ),
          story:story_id ( id, title, video_url ),
          messages ( content, created_at, sender_id, read_at )
        `)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order('updated_at', { ascending: false })

      if (err) throw new Error(err.message)
      setConversations((data as unknown as Conversation[]) ?? [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }, [userId])

  useEffect(() => {
    setLoading(true)
    fetchConversations().finally(() => setLoading(false))
  }, [fetchConversations])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchConversations()
    setRefreshing(false)
  }, [fetchConversations])

  // ── Empty / error / loading ────────────────────────────────────────────────

  const renderEmpty = () => {
    if (loading) return null
    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true)
              setError(null)
              fetchConversations().finally(() => setLoading(false))
            }}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return (
      <View style={styles.centered}>
        <MessageSquare size={48} color={colors.border} strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>Aucun message</Text>
        <Text style={styles.emptySubtitle}>
          Tes conversations apparaîtront ici
        </Text>
      </View>
    )
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.header}>Messages</Text>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonLines}>
              <View style={[styles.skeletonLine, { width: '50%' }]} />
              <View style={[styles.skeletonLine, { width: '75%', marginTop: 6 }]} />
              <View style={[styles.skeletonLine, { width: '40%', marginTop: 4 }]} />
            </View>
          </View>
        ))}
      </SafeAreaView>
    )
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.header}>Messages</Text>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationRow
            conv={item}
            userId={userId}
            onPress={() => router.push(`/conversation/${item.id}`)}
          />
        )}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 52

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md + AVATAR_SIZE + 12,
  },

  // Avatar
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.primary,
  },

  // Content
  rowContent: { flex: 1, marginLeft: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  storyTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  preview: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  previewUnread: {
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },

  // Unread badge
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: colors.bg,
  },

  // Empty / error
  emptyContainer: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
  },

  // Skeleton
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  skeletonAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  skeletonLines: { flex: 1, marginLeft: 12 },
  skeletonLine: {
    height: 12,
    backgroundColor: colors.surface,
    borderRadius: 6,
    opacity: 0.5,
  },
})
