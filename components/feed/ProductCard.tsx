import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../ui/Avatar'
import { colors, fontFamily } from '../../lib/theme'

interface FeedEntry {
  id: string
  type: 'listing' | 'auction'
  username: string
  price: number
  title: string
  condition: string
  image: string
}

interface ProductCardProps {
  item: FeedEntry
  onBuyPress: () => void
}

export default function ProductCard({ item, onBuyPress }: ProductCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar name={item.username} size={34} />
        <View style={styles.userInfo}>
          <Text style={styles.username}>@{item.username}</Text>
          <Text style={styles.time}>il y a 2h</Text>
        </View>
        {item.type === 'auction' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ENCHÈRE</Text>
          </View>
        )}
      </View>

      <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />

      <View style={styles.actionsRow}>
        <Ionicons name="heart-outline" size={26} color={colors.text} style={styles.actionIcon} />
        <Ionicons name="chatbubble-outline" size={24} color={colors.text} style={styles.actionIcon} />
        <Ionicons name="arrow-redo-outline" size={24} color={colors.text} />
        <View style={styles.flex} />
        <Ionicons name="bookmark-outline" size={24} color={colors.text} />
      </View>

      <View style={styles.infoBlock}>
        <Text style={styles.price}>CHF {item.price}</Text>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.condition}>{item.condition}</Text>
        <TouchableOpacity style={styles.buyBtn} onPress={onBuyPress} activeOpacity={0.8}>
          <Text style={styles.buyBtnText}>
            {item.type === 'auction' ? 'Enchérir →' : 'Acheter →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, marginBottom: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  userInfo: { flex: 1, marginLeft: 10 },
  username: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text },
  time: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  badge: {
    backgroundColor: colors.warning,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, color: '#0F0F0F' },
  image: { width: '100%', aspectRatio: 1 },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionIcon: { marginRight: 18 },
  flex: { flex: 1 },
  infoBlock: { paddingHorizontal: 14, paddingBottom: 14 },
  price: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text },
  title: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text, marginTop: 3 },
  condition: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  buyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  buyBtnText: { fontFamily: fontFamily.bold, fontSize: 13, color: '#0F0F0F' },
})
