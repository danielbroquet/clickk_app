import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStoryPrice(storyId: string, initialPrice: number): number {
  const [price, setPrice] = useState(initialPrice)

  useEffect(() => {
    setPrice(initialPrice)
  }, [initialPrice])

  useEffect(() => {
    if (!storyId) return

    const channel = supabase
      .channel(`story-price-${storyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories',
          filter: `id=eq.${storyId}`,
        },
        payload => {
          const next = (payload.new as { current_price_chf: number }).current_price_chf
          if (typeof next === 'number') setPrice(next)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storyId])

  return price
}
