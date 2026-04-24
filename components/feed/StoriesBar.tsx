import React from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import StoryCircle from './StoryCircle'
import { Story } from '../../types'
import { fontFamily } from '../../lib/theme'

interface StoriesBarProps {
  stories: Story[]
  onStoryPress: (story: Story) => void
}

function Skeleton() {
  return (
    <View style={styles.skeleton} />
  )
}

export default function StoriesBar({ stories, onStoryPress }: StoriesBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Stories</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {stories.length === 0
          ? [1, 2, 3, 4, 5].map(i => <Skeleton key={i} />)
          : stories.map(story => (
              <StoryCircle key={story.id} story={story} onPress={() => onStoryPress(story)} />
            ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#0F0F0F', paddingVertical: 12 },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  row: { paddingHorizontal: 16, gap: 14 },
  skeleton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1A1A1A',
  },
})
