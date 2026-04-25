import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface UseFollowResult {
  isFollowing: boolean
  followersCount: number
  toggleFollow: () => Promise<void>
  loading: boolean
}

export function useFollow(targetUserId: string): UseFollowResult {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? null
  const isSelf = !!currentUserId && currentUserId === targetUserId

  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetUserId) return

    let mounted = true
    setLoading(true)

    const checkFollowPromise = currentUserId && !isSelf
      ? supabase
          .from('follows')
          .select('id')
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId)
          .maybeSingle()
      : Promise.resolve({ data: null })

    const countPromise = supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', targetUserId)

    Promise.all([checkFollowPromise, countPromise]).then(([followRes, countRes]) => {
      if (!mounted) return
      setIsFollowing(!!followRes.data)
      setFollowersCount(countRes.count ?? 0)
      setLoading(false)
    })

    return () => { mounted = false }
  }, [targetUserId, currentUserId, isSelf])

  const toggleFollow = useCallback(async () => {
    if (!currentUserId || isSelf) return

    const wasFollowing = isFollowing
    const prevCount = followersCount

    // Optimistic update
    setIsFollowing(!wasFollowing)
    setFollowersCount(wasFollowing ? prevCount - 1 : prevCount + 1)
    setLoading(true)

    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', targetUserId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: currentUserId, following_id: targetUserId })
        if (error) throw error
      }
    } catch {
      // Revert on error
      setIsFollowing(wasFollowing)
      setFollowersCount(prevCount)
    } finally {
      setLoading(false)
    }
  }, [currentUserId, isSelf, isFollowing, followersCount, targetUserId])

  if (isSelf) {
    return { isFollowing: false, followersCount, toggleFollow: async () => {}, loading }
  }

  return { isFollowing, followersCount, toggleFollow, loading }
}
