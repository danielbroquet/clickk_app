import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useActiveStories } from '../../hooks/useActiveStories'
import i18n from '../../lib/i18n'
import { SpeedPreset, Story } from '../../types'

const INTERVAL_SECONDS: Record<SpeedPreset, number> = {
  SLOW: 300,
  STANDARD: 180,
  FAST: 60,
}

function getSecondsRemaining(lastDropAt: string, speedPreset: SpeedPreset): number {
  const interval = INTERVAL_SECONDS[speedPreset]
  const lastDrop = new Date(lastDropAt).getTime()
  const nextDrop = lastDrop + interval * 1000
  const remaining = Math.max(0, Math.floor((nextDrop - Date.now()) / 1000))
  return remaining
}

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function StoryCard({ story }: { story: Story }) {
  const [remaining, setRemaining] = useState(() =>
    getSecondsRemaining(story.last_drop_at, story.speed_preset)
  )

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(getSecondsRemaining(story.last_drop_at, story.speed_preset))
    }, 1000)
    return () => clearInterval(id)
  }, [story.last_drop_at, story.speed_preset])

  const isUrgent = remaining < 10
  const username = story.seller?.username ?? ''
  const avatarUrl = story.seller?.avatar_url ?? null
  const initial = username.charAt(0).toUpperCase()

  return (
    <TouchableOpacity
      onPress={() => router.push(`/story/${story.id}`)}
      activeOpacity={0.8}
      style={{
        width: 80,
        height: 110,
        backgroundColor: '#1A1A1A',
        borderRadius: 16,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 6,
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: '#00D2B8',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#00D2B8',
        }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
          />
        ) : (
          <Text
            style={{ color: '#0F0F0F', fontWeight: '700', fontSize: 16 }}
          >
            {initial}
          </Text>
        )}
      </View>

      {/* Price */}
      <Text
        style={{
          color: '#FFFFFF',
          fontWeight: '700',
          fontSize: 13,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {i18n.t('story.chf', { price: story.current_price_chf.toLocaleString('fr-CH') })}
      </Text>

      {/* Countdown */}
      <Text
        style={{
          color: isUrgent ? '#FF4757' : '#717976',
          fontWeight: isUrgent ? '700' : '400',
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        {formatMMSS(remaining)}
      </Text>
    </TouchableOpacity>
  )
}

function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [pulse])

  return (
    <Animated.View
      style={{
        width: 80,
        height: 110,
        backgroundColor: '#1A1A1A',
        borderRadius: 16,
        marginRight: 10,
        opacity: pulse,
      }}
    />
  )
}

export default function StoryCarousel() {
  const { stories, loading } = useActiveStories()

  if (loading) {
    return (
      <View style={{ flexDirection: 'row', paddingHorizontal: 16 }}>
        {[0, 1, 2, 3].map((k) => (
          <SkeletonCard key={k} />
        ))}
      </View>
    )
  }

  if (stories.length === 0) return null

  return (
    <FlatList<Story>
      data={stories}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <StoryCard story={item} />}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    />
  )
}
