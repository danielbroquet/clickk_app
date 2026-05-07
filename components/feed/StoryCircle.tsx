import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Story } from '../../types'
import { fontFamily } from '../../lib/theme'
import { toCdnUrl } from '../../lib/cdn'

interface StoryCircleProps {
  story: Story
  onPress: () => void
}

export default function StoryCircle({ story, onPress }: StoryCircleProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.outer}>
        <LinearGradient
          colors={['#00D2B8', '#A9F7E1', '#00D2B8']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <View style={styles.inner}>
            {story.video_url ? (
              <Image source={{ uri: toCdnUrl(story.video_url) ?? '' }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.placeholder]} />
            )}
          </View>
        </LinearGradient>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>CHF {Math.round(story.current_price_chf)}</Text>
        </View>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        @{story.seller?.username ?? ''}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { width: 80, alignItems: 'center' },
  outer: { width: 68, height: 68, position: 'relative' },
  gradient: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: 58, height: 58, borderRadius: 29 },
  placeholder: { backgroundColor: '#2A2A2A' },
  priceBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,210,184,0.92)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  priceText: { fontFamily: fontFamily.bold, fontSize: 9, color: '#0F0F0F' },
  label: {
    marginTop: 5,
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#A0A0A0',
    maxWidth: 78,
    textAlign: 'center',
  },
})
