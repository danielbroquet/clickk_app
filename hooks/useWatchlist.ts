import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface UseWatchlistResult {
  isWatchlisted: boolean
  watchlistCount: number
  toggleWatchlist: () => Promise<void>
  loading: boolean
}

export function useWatchlist(storyId: string): UseWatchlistResult {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [isWatchlisted, setIsWatchlisted] = useState(false)
  const [watchlistCount, setWatchlistCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!storyId) return
    let mounted = true
    setLoading(true)

    const checkPromise = userId
      ? supabase
          .from('watchlist')
          .select('id')
          .eq('user_id', userId)
          .eq('story_id', storyId)
          .maybeSingle()
      : Promise.resolve({ data: null })

    const countPromise = supabase
      .from('watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyId)

    Promise.all([checkPromise, countPromise]).then(([checkRes, countRes]) => {
      if (!mounted) return
      setIsWatchlisted(!!checkRes.data)
      setWatchlistCount(countRes.count ?? 0)
      setLoading(false)
    })

    return () => { mounted = false }
  }, [storyId, userId])

  const toggleWatchlist = useCallback(async () => {
    if (!userId) return

    const wasWatchlisted = isWatchlisted
    const prevCount = watchlistCount

    setIsWatchlisted(!wasWatchlisted)
    setWatchlistCount(wasWatchlisted ? prevCount - 1 : prevCount + 1)

    try {
      if (wasWatchlisted) {
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', userId)
          .eq('story_id', storyId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('watchlist')
          .insert({ user_id: userId, story_id: storyId })
        if (error) throw error
      }
    } catch {
      setIsWatchlisted(wasWatchlisted)
      setWatchlistCount(prevCount)
    }
  }, [userId, storyId, isWatchlisted, watchlistCount])

  return { isWatchlisted, watchlistCount, toggleWatchlist, loading }
}
