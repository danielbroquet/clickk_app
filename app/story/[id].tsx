import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'

export default function StoryRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>()

  useEffect(() => {
    if (!id) {
      router.replace('/(tabs)')
      return
    }
    router.replace({ pathname: '/(tabs)', params: { initialStoryId: id } })
  }, [id])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00D2B8" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F', justifyContent: 'center', alignItems: 'center' },
})
