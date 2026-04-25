import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function useUnreadMessages(): { unreadCount: number } {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [unreadCount, setUnreadCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!currentUserId) { setUnreadCount(0); return }

    const { count } = await supabase
      .from('messages')
      .select('id, conversations!inner(buyer_id, seller_id)', { count: 'exact', head: true })
      .is('read_at', null)
      .neq('sender_id', currentUserId)
      .or(`buyer_id.eq.${currentUserId},seller_id.eq.${currentUserId}`, {
        foreignTable: 'conversations',
      })

    setUnreadCount(count ?? 0)
  }, [currentUserId])

  useEffect(() => {
    fetchCount()
  }, [fetchCount])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel('unread-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => { fetchCount() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUserId, fetchCount])

  return { unreadCount }
}
