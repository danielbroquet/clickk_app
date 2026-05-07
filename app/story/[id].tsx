import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

export default function StoryRedirect() {
  const { id, fromProfile } = useLocalSearchParams<{ id: string; fromProfile?: string }>()

  useEffect(() => {
    if (!id) {
      router.replace('/(tabs)')
      return
    }
    const params: Record<string, string> = { initialStoryId: id }
    if (fromProfile) params.fromProfile = fromProfile
    router.push({ pathname: '/(tabs)', params })
  }, [id, fromProfile])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00D2B8" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', justifyContent: 'center', alignItems: 'center' },
})
