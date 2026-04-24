import React from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import { colors, fontFamily } from '../../lib/theme'

interface AvatarProps {
  uri?: string | null
  name: string
  size?: number
}

export default function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase()
  const fontSize = size * 0.4

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    )
  }

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
})
