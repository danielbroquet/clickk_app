import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, spacing } from '../../lib/theme'

interface DiscoverItem {
  id: string
  title: string
  price: number
  image: string
}

const MOCK_DISCOVER: DiscoverItem[] = [
  { id: '1', title: 'Air Jordan 1', price: 180, image: 'https://picsum.photos/300/300?random=10' },
  { id: '2', title: 'Vintage Jacket', price: 65, image: 'https://picsum.photos/300/300?random=11' },
  { id: '3', title: 'Canon EOS', price: 320, image: 'https://picsum.photos/300/300?random=12' },
  { id: '4', title: 'Guitar Fender', price: 450, image: 'https://picsum.photos/300/300?random=13' },
  { id: '5', title: 'MacBook Sleeve', price: 35, image: 'https://picsum.photos/300/300?random=14' },
  { id: '6', title: 'Levi\'s 501', price: 55, image: 'https://picsum.photos/300/300?random=15' },
]

function DiscoverCard({ item }: { item: DiscoverItem }) {
  return (
    <TouchableOpacity style={styles.card}>
      <Image source={{ uri: item.image }} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardPrice}>CHF {item.price}</Text>
      </View>
    </TouchableOpacity>
  )
}

const renderItem: ListRenderItem<DiscoverItem> = ({ item }) => <DiscoverCard item={item} />

export default function DiscoverScreen() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const filtered = MOCK_DISCOVER.filter(i =>
    i.title.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Découvrir</Text>

      <View style={[styles.searchBar, focused && styles.searchFocus]}>
        <Ionicons name="search" size={18} color={colors.primary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
    marginBottom: spacing.md,
  },
  searchFocus: { borderColor: colors.primary },
  searchIcon: { marginLeft: 12, marginRight: 8 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  listContent: { paddingHorizontal: spacing.md },
  row: { gap: 2, marginBottom: 2 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardImage: { width: '100%', aspectRatio: 1 },
  cardBody: { padding: spacing.sm },
  cardTitle: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text },
  cardPrice: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primary, marginTop: 2 },
})
