import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Image,
  ActivityIndicator,
  ListRenderItem,
  Animated,
  PanResponder,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { MessageSquare } from 'lucide-react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'
import { formatRelativeTime } from '../../lib/utils'
import { useTranslation } from '../../lib/i18n'
import type { Notification } from '../../types'

// ─── Shared types ────────────────────────────────────────────────────────────

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

// ─── Messages helpers ────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'maintenant'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}j`
  return `${Math.floor(days / 7)}sem`
}

function lastMessage(messages: MessageRow[]): string {
  if (!messages.length) return ''
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const text = sorted[0].content ?? ''
  return text.length > 40 ? text.slice(0, 40) + '…' : text
}

function unreadMsgCount(messages: MessageRow[], userId: string): number {
  return messages.filter((m) => m.read_at === null && m.sender_id !== userId).length
}

function otherUser(conv: Conversation, userId: string): Participant {
  return conv.buyer.id === userId ? conv.seller : conv.buyer
}

// ─── Messages sub-screen ─────────────────────────────────────────────────────

const AVATAR_SIZE = 52

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
  const badge = unreadMsgCount(conv.messages, userId)
  const time = relativeTime(conv.updated_at)

  return (
    <TouchableOpacity style={msgStyles.row} onPress={onPress} activeOpacity={0.7}>
      {other.avatar_url ? (
        <Image source={{ uri: other.avatar_url }} style={msgStyles.avatar} />
      ) : (
        <View style={msgStyles.avatarFallback}>
          <Text style={msgStyles.avatarInitial}>
            {(other.display_name ?? '?')[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={msgStyles.rowContent}>
        <View style={msgStyles.rowTop}>
          <Text style={msgStyles.name} numberOfLines={1}>
            {other.display_name ?? 'Utilisateur'}
          </Text>
          <Text style={msgStyles.time}>{time}</Text>
        </View>
        {conv.story && (
          <Text style={msgStyles.storyTitle} numberOfLines={1}>
            {conv.story.title}
          </Text>
        )}
        <Text
          style={[msgStyles.preview, badge > 0 && msgStyles.previewUnread]}
          numberOfLines={1}
        >
          {preview || 'Aucun message'}
        </Text>
      </View>
      {badge > 0 && (
        <View style={msgStyles.badge}>
          <Text style={msgStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

function MessagesTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
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
          id, story_id, updated_at,
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

  if (loading) {
    return (
      <View style={msgStyles.loadingContainer}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={msgStyles.skeletonRow}>
            <View style={msgStyles.skeletonAvatar} />
            <View style={msgStyles.skeletonLines}>
              <View style={[msgStyles.skeletonLine, { width: '50%' }]} />
              <View style={[msgStyles.skeletonLine, { width: '75%', marginTop: 6 }]} />
              <View style={[msgStyles.skeletonLine, { width: '40%', marginTop: 4 }]} />
            </View>
          </View>
        ))}
      </View>
    )
  }

  const renderEmpty = () => {
    if (error) {
      return (
        <View style={msgStyles.centered}>
          <Text style={msgStyles.errorText}>{error}</Text>
          <TouchableOpacity
            style={msgStyles.retryBtn}
            onPress={() => {
              setLoading(true)
              setError(null)
              fetchConversations().finally(() => setLoading(false))
            }}
          >
            <Text style={msgStyles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return (
      <View style={msgStyles.centered}>
        <MessageSquare size={48} color={colors.border} strokeWidth={1.5} />
        <Text style={msgStyles.emptyTitle}>{t('inbox.no_messages')}</Text>
        <Text style={msgStyles.emptySubtitle}>Tes conversations apparaîtront ici</Text>
      </View>
    )
  }

  return (
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
      ItemSeparatorComponent={() => <View style={msgStyles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      contentContainerStyle={conversations.length === 0 ? msgStyles.emptyContainer : undefined}
      showsVerticalScrollIndicator={false}
    />
  )
}

const msgStyles = StyleSheet.create({
  loadingContainer: { flex: 1 },
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
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 20, color: colors.primary },
  rowContent: { flex: 1, marginLeft: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text, flex: 1, marginRight: 8 },
  time: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary },
  storyTitle: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  preview: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, marginTop: 3 },
  previewUnread: { fontFamily: fontFamily.semiBold, color: colors.text },
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
  badgeText: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.bg },
  emptyContainer: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.text, marginTop: spacing.md },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  errorText: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.error, textAlign: 'center', marginBottom: spacing.md },
  retryBtn: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  retryText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12 },
  skeletonAvatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: colors.surface, opacity: 0.5 },
  skeletonLines: { flex: 1, marginLeft: 12 },
  skeletonLine: { height: 12, backgroundColor: colors.surface, borderRadius: 6, opacity: 0.5 },
})

// ─── Notifications sub-screen ─────────────────────────────────────────────────

type NotifType = Notification['type']

const ICON_CONFIG: Record<NotifType, { name: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  sale:           { name: 'cash-outline',              color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  price_drop:     { name: 'trending-down-outline',     color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  follow:         { name: 'person-add-outline',        color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  like:           { name: 'heart-outline',             color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  purchase:       { name: 'bag-check-outline',         color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  story_sold:     { name: 'flash-outline',             color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  outbid:         { name: 'arrow-up-circle-outline',   color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  auction_won:    { name: 'trophy-outline',            color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  top_up:         { name: 'wallet-outline',            color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  auction_ending: { name: 'time-outline',              color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  new_follower:   { name: 'person-add-outline',        color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  delivery_reminder: { name: 'cube-outline',           color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  delivery_confirmed: { name: 'checkmark-circle-outline', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
}

const UNREAD_BG = 'rgba(0,210,184,0.08)'

function NotifItem({ notif, onPress }: { notif: Notification; onPress: () => void }) {
  const cfg = ICON_CONFIG[notif.type] ?? ICON_CONFIG.sale

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
    >
      <View style={[notifStyles.item, !notif.is_read && notifStyles.itemUnread]}>
        <View style={[notifStyles.iconCircle, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.name} size={22} color={cfg.color} />
        </View>
        <View style={notifStyles.textBlock}>
          <Text style={notifStyles.itemTitle}>{notif.title}</Text>
          {!!notif.message && (
            <Text style={notifStyles.itemMsg} numberOfLines={2}>{notif.message}</Text>
          )}
          <Text style={notifStyles.itemTime}>{formatRelativeTime(notif.created_at)}</Text>
        </View>
        {!notif.is_read && <View style={notifStyles.dot} />}
      </View>
    </TouchableOpacity>
  )
}

function SwipeableNotifRow({ notif, onDelete, onPress }: {
  notif: Notification
  onDelete: () => void
  onPress: () => void
}) {
  const translateX = useRef(new Animated.Value(0)).current
  const DELETE_THRESHOLD = -80

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(Math.max(g.dx, -120))
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < DELETE_THRESHOLD) {
          Animated.timing(translateX, {
            toValue: -500,
            duration: 250,
            useNativeDriver: true,
          }).start(onDelete)
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start()
        }
      },
    })
  ).current

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={notifStyles.swipeDeleteBg}>
        <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <NotifItem notif={notif} onPress={onPress} />
      </Animated.View>
    </View>
  )
}

const notifKeyExtractor = (item: Notification) => item.id

function NotificationsTab({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const markAllRead = useCallback(async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      if (!userId) { setLoading(false); return }
      let cancelled = false

      async function load() {
        setLoading(true)
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (!cancelled) {
          if (!error) setNotifications((data ?? []) as Notification[])
          setLoading(false)
        }

        await markAllRead()
        if (!cancelled) {
          setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        }
      }

      load()
      return () => { cancelled = true }
    }, [userId, markAllRead])
  )

  const handleDelete = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const handleClearAll = async () => {
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
    setNotifications([])
  }

  const handleNotifPress = (notif: Notification) => {
    const storyId = (notif as any).story_id as string | null | undefined
    if (storyId) router.push(`/story/${storyId}`)
  }

  if (loading) {
    return (
      <View style={notifStyles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {notifications.length > 0 && (
        <TouchableOpacity
          style={notifStyles.clearAllBtn}
          onPress={handleClearAll}
          activeOpacity={0.7}
        >
          <Text style={notifStyles.clearAllText}>{t('inbox.clear_all')}</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={notifications}
        keyExtractor={notifKeyExtractor}
        renderItem={({ item }) => (
          <SwipeableNotifRow
            notif={item}
            onDelete={() => handleDelete(item.id)}
            onPress={() => handleNotifPress(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={notifications.length === 0 ? notifStyles.emptyFlex : undefined}
        ListEmptyComponent={
          <View style={notifStyles.empty}>
            <Ionicons name="notifications-outline" size={52} color={colors.border} />
            <Text style={notifStyles.emptyText}>{t('inbox.no_notifications')}</Text>
          </View>
        }
      />
    </View>
  )
}

const notifStyles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  itemUnread: { backgroundColor: UNREAD_BG },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  textBlock: { flex: 1, marginLeft: 12 },
  itemTitle: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text },
  itemMsg: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  itemTime: { fontSize: 12, color: '#707070', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyFlex: { flex: 1 },
  emptyText: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.textSecondary, marginTop: spacing.md },
  clearAllBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  clearAllText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.error,
  },
  swipeDeleteBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

// ─── Unread notification count hook ──────────────────────────────────────────

function useUnreadNotifCount(userId: string): number {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!userId) { setCount(0); return }
    const { count: c } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    setCount(c ?? 0)
  }, [userId])

  useEffect(() => {
    fetchCount()
  }, [fetchCount])

  useFocusEffect(
    useCallback(() => {
      fetchCount()
    }, [fetchCount])
  )

  return count
}

// ─── Inbox screen (exported, used as tab) ────────────────────────────────────

export { useUnreadNotifCount }

export default function InboxScreen() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''
  const [activeTab, setActiveTab] = useState<'messages' | 'notifications'>('messages')

  return (
    <SafeAreaView style={inboxStyles.safe} edges={['top']}>
      {/* Header */}
      <View style={inboxStyles.header}>
        <Text style={inboxStyles.title}>Inbox</Text>
      </View>

      {/* Pill switcher */}
      <View style={inboxStyles.pillBar}>
        <TouchableOpacity
          style={[inboxStyles.pill, activeTab === 'messages' && inboxStyles.pillActive]}
          onPress={() => setActiveTab('messages')}
          activeOpacity={0.8}
        >
          <Text style={[inboxStyles.pillText, activeTab === 'messages' && inboxStyles.pillTextActive]}>
            {t('inbox.tab_messages')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[inboxStyles.pill, activeTab === 'notifications' && inboxStyles.pillActive]}
          onPress={() => setActiveTab('notifications')}
          activeOpacity={0.8}
        >
          <Text style={[inboxStyles.pillText, activeTab === 'notifications' && inboxStyles.pillTextActive]}>
            {t('inbox.tab_notifications')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={inboxStyles.content}>
        {activeTab === 'messages' ? (
          <MessagesTab userId={userId} />
        ) : (
          <NotificationsTab userId={userId} />
        )}
      </View>
    </SafeAreaView>
  )
}

const inboxStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text,
  },
  pillBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: 'rgba(0,210,184,0.12)',
    borderColor: colors.primary,
  },
  pillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.primary,
  },
  content: { flex: 1 },
})
