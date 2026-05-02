import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function useDropPresence(storyId: string, active: boolean): number {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const [viewerCount, setViewerCount] = useState(0)

  useEffect(() => {
    if (!storyId || !active || !userId) {
      setViewerCount(0)
      return
    }

    const channel = supabase.channel(`drop:${storyId}`, {
      config: { presence: { key: userId } },
    })

    const updateCount = () => {
      const state = channel.presenceState()
      setViewerCount(Object.keys(state).length)
    }

    channel
      .on('presence', { event: 'sync' }, updateCount)
      .on('presence', { event: 'join' }, updateCount)
      .on('presence', { event: 'leave' }, updateCount)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() })
        }
      })

    return () => {
      channel.untrack().catch(() => {})
      channel.unsubscribe()
    }
  }, [storyId, active, userId])

  return viewerCount
}
