import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily } from '../../lib/theme'
import { formatRelativeTime } from '../../lib/utils'

interface NotifEntry {
  id: string
  type: 'auction_won' | 'new_follower' | 'sale' | 'outbid'
  title: string
  message: string
  is_read: boolean
  created_at: string
}

const MOCK_NOTIFS: NotifEntry[] = [
  { id: 'n1', type: 'auction_won', title: 'Enchère remportée !', message: 'Swatch Irony — CHF 45.00', is_read: false, created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 'n2', type: 'new_follower', title: 'Nouveau·elle abonné·e', message: '@sofia_ge vous suit maintenant', is_read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'n3', type: 'sale', title: 'Article vendu !', message: 'Nike Air Max 90 — CHF 89.00', is_read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
]

const iconConfig: Record<NotifEntry['type'], { name: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  auction_won: { name: 'trophy', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  new_follower: { name: 'person-add', color: '#00D2B8', bg: 'rgba(0,210,184,0.15)' },
  sale: { name: 'bag-check', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  outbid: { name: 'arrow-up-circle', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
}

function NotifItem({ item }: { item: NotifEntry }) {
  const cfg = iconConfig[item.type]
  return (
    <View style={styles.item}>
      <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.name} size={22} color={cfg.color} />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemMsg}>{item.message}</Text>
        <Text style={styles.itemTime}>{formatRelativeTime(item.created_at)}</Text>
      </View>
      {!item.is_read && <View style={styles.dot} />}
    </View>
  )
}

const renderItem: ListRenderItem<NotifEntry> = ({ item }) => <NotifItem item={item} />

export default function NotificationsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
        <TouchableOpacity>
          <Text style={styles.readAll}>Tout lire</Text>
        </TouchableOpacity>
      </View>

      {MOCK_NOTIFS.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={52} color={colors.border} />
          <Text style={styles.emptyText}>Aucune notification</Text>
        </View>
      ) : (
        <FlatList
          data={MOCK_NOTIFS}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
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
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  heading: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.text },
  readAll: { fontSize: 13, color: colors.primary },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
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
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 16 },
})
