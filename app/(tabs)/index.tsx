import React, { useState } from 'react'
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
import { Story } from '../../types'
import StoriesBar from '../../components/feed/StoriesBar'
import ProductCard from '../../components/feed/ProductCard'
import StoriesViewer from '../../components/stories/StoriesViewer'
import StoryCarousel from '../../components/feed/StoryCarousel'
import { colors, fontFamily } from '../../lib/theme'
import i18n from '../../lib/i18n'

const MOCK_STORIES: Story[] = [
  { id: 's1', title: 'Nike Air Max 90', description: null, thumbnail_url: null, auction_type: 'STANDARD', image_url: 'https://picsum.photos/400/700?random=10', start_price_chf: 150, floor_price_chf: 60, current_price_chf: 112, price_drop_seconds: 10, seller_id: 'u1', status: 'active', buyer_id: null, final_price_chf: null, expires_at: new Date(Date.now() + 600000).toISOString(), last_drop_at: new Date().toISOString(), created_at: new Date().toISOString(), seller: { id: 'u1', username: 'marc_zh', display_name: 'Marc', role: 'seller', avatar_url: null, bio: null, preferred_language: 'fr', followers_count: 234, following_count: 45, stripe_customer_id: null, is_verified: true, created_at: new Date().toISOString() } },
  { id: 's2', title: 'Swatch Irony', description: null, thumbnail_url: null, auction_type: 'FAST', image_url: 'https://picsum.photos/400/700?random=11', start_price_chf: 80, floor_price_chf: 30, current_price_chf: 65, price_drop_seconds: 10, seller_id: 'u2', status: 'active', buyer_id: null, final_price_chf: null, expires_at: new Date(Date.now() + 400000).toISOString(), last_drop_at: new Date().toISOString(), created_at: new Date().toISOString(), seller: { id: 'u2', username: 'sofia_ge', display_name: 'Sofia', role: 'seller', avatar_url: null, bio: null, preferred_language: 'fr', followers_count: 89, following_count: 12, stripe_customer_id: null, is_verified: false, created_at: new Date().toISOString() } },
  { id: 's3', title: 'Zara Coat', description: null, thumbnail_url: null, auction_type: 'SLOW', image_url: 'https://picsum.photos/400/700?random=12', start_price_chf: 120, floor_price_chf: 45, current_price_chf: 90, price_drop_seconds: 10, seller_id: 'u3', status: 'active', buyer_id: null, final_price_chf: null, expires_at: new Date(Date.now() + 800000).toISOString(), last_drop_at: new Date().toISOString(), created_at: new Date().toISOString(), seller: { id: 'u3', username: 'luca_ti', display_name: 'Luca', role: 'seller', avatar_url: null, bio: null, preferred_language: 'it', followers_count: 156, following_count: 78, stripe_customer_id: null, is_verified: true, created_at: new Date().toISOString() } },
]

interface FeedEntry {
  id: string
  type: 'listing' | 'auction'
  username: string
  price: number
  title: string
  condition: string
  image: string
}

const MOCK_FEED: FeedEntry[] = [
  { id: 'f1', type: 'listing', username: 'marc_zh', price: 89, title: 'Nike Air Max 90', condition: 'Comme neuf', image: 'https://picsum.photos/400/400?random=1' },
  { id: 'f2', type: 'auction', username: 'sofia_ge', price: 145, title: 'iPhone 14 Pro Case', condition: 'Neuf', image: 'https://picsum.photos/400/400?random=2' },
  { id: 'f3', type: 'listing', username: 'luca_ti', price: 45, title: 'Swatch Irony Vintage', condition: 'Bon état', image: 'https://picsum.photos/400/400?random=3' },
  { id: 'f4', type: 'listing', username: 'anna_bs', price: 220, title: 'Zara Coat Winter', condition: 'Comme neuf', image: 'https://picsum.photos/400/400?random=4' },
]

function FeedHeader({
  onStoryPress,
}: {
  onStoryPress: (story: Story) => void
}) {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Text style={styles.logoBlack}>click</Text>
          <Text style={styles.logoTeal}>«</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <StoriesBar stories={MOCK_STORIES} onStoryPress={onStoryPress} />
      <View style={styles.divider} />
      <View style={styles.carouselSection}>
        <Text style={styles.carouselTitle}>{i18n.t('feed.activeAuctions')}</Text>
        <StoryCarousel />
      </View>
    </>
  )
}

const renderItem: ListRenderItem<FeedEntry> = ({ item }) => (
  <ProductCard item={item} onBuyPress={() => {}} />
)

export default function FeedScreen() {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [viewerVisible, setViewerVisible] = useState(false)

  const handleStoryPress = (story: Story) => {
    setSelectedStory(story)
    setViewerVisible(true)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={MOCK_FEED}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={<FeedHeader onStoryPress={handleStoryPress} />}
        showsVerticalScrollIndicator={false}
      />
      <StoriesViewer
        visible={viewerVisible}
        story={selectedStory}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logoRow: { flexDirection: 'row', alignItems: 'baseline' },
  logoBlack: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.text },
  logoTeal: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.primary },
  headerIcons: { flexDirection: 'row', gap: 16 },
  divider: { height: 1, backgroundColor: colors.border },
  carouselSection: { paddingTop: 16, paddingBottom: 16 },
  carouselTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
})
