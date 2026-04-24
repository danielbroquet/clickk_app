import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useActiveStories } from '../../hooks/useActiveStories'
import i18n from '../../lib/i18n'
import { SpeedPreset, Story } from '../../types'

const PRESET_COLOR: Record<SpeedPreset, string> = {
  FLASH: '#FF6B6B',
  STANDARD: '#00D2B8',
  RELAX: '#A9F7E1',
}

function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '--:--'
  const t = new Date(expiresAt).getTime()
  if (isNaN(t)) return '--:--'
  const diff = t - Date.now()
  if (diff <= 0) return '00:00'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1_000)
  return hours > 0
    ? `${hours}h${String(minutes).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function StoryCard({ story }: { story: Story }) {
  const [label, setLabel] = useState(() => formatExpiry(story.expires_at))

  useEffect(() => {
    setLabel(formatExpiry(story.expires_at))
    const id = setInterval(() => setLabel(formatExpiry(story.expires_at)), 1000)
    return () => clearInterval(id)
  }, [story.expires_at])

  const isUrgent = label !== '--:--' && !label.includes('h') && parseInt(label) < 1
  const accentColor = PRESET_COLOR[story.speed_preset] ?? '#00D2B8'
  const initial = (story.seller?.username ?? '?').charAt(0).toUpperCase()

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
        overflow: 'hidden',
      }}
    >
      {/* Thumbnail bubble */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 2,
          borderColor: accentColor,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={[accentColor, '#0F0F0F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#0F0F0F', fontWeight: '800', fontSize: 18 }}>
            {initial}
          </Text>
        </LinearGradient>
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
        {label}
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
        {[0, 1, 2, 3].map((k) => <SkeletonCard key={k} />)}
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

  )
}