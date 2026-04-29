import React, { useState } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import Avatar from '../ui/Avatar'
import { colors, fontFamily } from '../../lib/theme'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

interface FeedEntry {
  id: string
  type: 'listing'
  username: string
  price: number
  title: string
  condition: string
  image: string
}

interface StoryRef {
  id: string
  seller_id: string
}

interface ProductCardProps {
  item: FeedEntry
  onBuyPress: () => void
  story?: StoryRef
}

export default function ProductCard({ item, onBuyPress, story }: ProductCardProps) {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const [chatLoading, setChatLoading] = useState(false)

  const handleChatPress = async () => {
    if (!story) return
    if (currentUserId === story.seller_id) return
    if (chatLoading) return
    setChatLoading(true)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .upsert(
          { buyer_id: currentUserId, seller_id: story.seller_id, story_id: story.id },
          { onConflict: 'buyer_id,seller_id,story_id', ignoreDuplicates: false }
        )
        .select('id')
        .single()
      if (!error && data) {
        router.push(`/conversation/${data.id}`)
      }
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar name={item.username} size={34} />
        <View style={styles.userInfo}>
          <Text style={styles.username}>@{item.username}</Text>
          <Text style={styles.time}>il y a 2h</Text>
        </View>
      </View>

      <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />

      <View style={styles.actionsRow}>
        <Ionicons name="heart-outline" size={26} color={colors.text} style={styles.actionIcon} />
        <TouchableOpacity
          style={styles.actionIcon}
          onPress={handleChatPress}
          disabled={!story || currentUserId === story?.seller_id || chatLoading}
          activeOpacity={0.7}
        >
          {chatLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name="chatbubble-outline"
              size={24}
              color={story && currentUserId !== story.seller_id ? colors.text : colors.textSecondary}
            />
          )}
        </TouchableOpacity>
        <Ionicons name="arrow-redo-outline" size={24} color={colors.text} />
        <View style={styles.flex} />
        <Ionicons name="bookmark-outline" size={24} color={colors.text} />
      </View>

      <View style={styles.infoBlock}>
        <Text style={styles.price}>CHF {item.price}</Text>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.condition}>{item.condition}</Text>
        <TouchableOpacity style={styles.buyBtn} onPress={onBuyPress} activeOpacity={0.8}>
          <Text style={styles.buyBtnText}>Acheter →</Text>
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
