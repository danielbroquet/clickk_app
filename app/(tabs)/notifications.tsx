import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'
import { formatRelativeTime } from '../../lib/utils'
import type { Notification } from '../../types'

type NotifType = Notification['type']

const ICON_CONFIG: Record<NotifType, { name: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  sale:        { name: 'cash-outline',         color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  price_drop:  { name: 'trending-down-outline', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  follow:      { name: 'person-add-outline',    color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  like:        { name: 'heart-outline',         color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  purchase:    { name: 'bag-check-outline',     color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  story_sold:  { name: 'flash-outline',         color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  // legacy types from Notification union — fallback
  outbid:         { name: 'arrow-up-circle-outline', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  auction_won:    { name: 'trophy-outline',          color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  top_up:         { name: 'wallet-outline',          color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  auction_ending: { name: 'time-outline',            color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  new_follower:   { name: 'person-add-outline',      color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
}

const UNREAD_BG = 'rgba(0,210,184,0.08)'

function NotifItem({ item }: { item: Notification }) {
  const cfg = ICON_CONFIG[item.type] ?? ICON_CONFIG.sale

  return (
    <View style={[styles.item, !item.is_read && styles.itemUnread]}>
      <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.name} size={22} color={cfg.color} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        {!!item.message && <Text style={styles.itemMsg} numberOfLines={2}>{item.message}</Text>}
        <Text style={styles.itemTime}>{formatRelativeTime(item.created_at)}</Text>
      </View>
      {!item.is_read && <View style={styles.dot} />}
    </View>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Ionicons name="notifications-outline" size={52} color={colors.border} />
      <Text style={styles.emptyText}>Aucune notification</Text>
    </View>
  )
}

const keyExtractor = (item: Notification) => item.id
const renderItem: ListRenderItem<Notification> = ({ item }) => <NotifItem item={item} />

export default function NotificationsScreen() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const markAllRead = useCallback(async (userId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      const userId = session?.user?.id
      if (!userId) {
        setLoading(false)
        return
      }

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

        // Mark unread as read after fetching so the UI shows the tint first
        await markAllRead(userId!)
        if (!cancelled) {
          setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        }
      }

      load()
      return () => { cancelled = true }
    }, [session?.user?.id, markAllRead])
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={notifications.length === 0 && styles.emptyFlex}
          ListEmptyComponent={<EmptyState />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  heading: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.text },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  itemUnread: { backgroundColor: UNREAD_BG },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: { flex: 1, marginLeft: 12 },
  itemTitle: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text },
  itemMsg: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  itemTime: { fontSize: 12, color: '#707070', marginTop: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyFlex: { flex: 1 },
  emptyText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
})
