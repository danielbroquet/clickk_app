import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { router } from 'expo-router'
import { useAuth } from '../../lib/auth'

export default function SellerLayout() {
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && profile && profile.role !== 'seller') {
      router.replace('/become-seller')
    }
  }, [profile, loading])

  return (
    <Stack screenOptions={{ headerShown: false }} />
  )
}
