import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuctionType, Story } from '../types'

interface RawStory {
  id: string
  seller_id: string
  current_price_chf: number
  floor_price_chf: number
  start_price_chf: number
  last_drop_at: string
  auction_type: AuctionType
  thumbnail_url: string | null
  buyer_id: string | null
  status: 'active' | 'sold' | 'expired'
  profiles: { avatar_url: string | null; username: string } | null
}

function rawToStory(r: RawStory): Story {
  return {
    id: r.id,
    seller_id: r.seller_id,
    title: '',
    description: null,
    image_url: r.thumbnail_url ?? '',
    thumbnail_url: r.thumbnail_url,
    start_price_chf: r.start_price_chf,
    floor_price_chf: r.floor_price_chf,
    current_price_chf: r.current_price_chf,
    price_drop_seconds: 0,
    auction_type: r.auction_type,
    status: r.status,
    buyer_id: r.buyer_id,
    final_price_chf: null,
    expires_at: '',
    last_drop_at: r.last_drop_at,
    created_at: '',
    seller: r.profiles
      ? {
          id: r.seller_id,
          username: r.profiles.username,
          display_name: null,
          role: 'seller',
          avatar_url: r.profiles.avatar_url,
          bio: null,
          preferred_language: 'fr',
          followers_count: 0,
          following_count: 0,
          stripe_customer_id: null,
          is_verified: false,
          created_at: '',
        }
      : undefined,
  }
}

export function useActiveStories(): { stories: Story[]; loading: boolean } {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchStories() {
      const { data, error } = await supabase
        .from('stories')
        .select(
          'id, seller_id, current_price_chf, floor_price_chf, start_price_chf, last_drop_at, auction_type, thumbnail_url, buyer_id, status, profiles:seller_id(avatar_url, username)'
        )
        .eq('status', 'active')
        .is('buyer_id', null)
        .order('created_at', { ascending: false })

      if (!mounted) return
      if (!error && data) {
        setStories((data as unknown as RawStory[]).map(rawToStory))
      }
      setLoading(false)
    }

    fetchStories()

    const channel = supabase
      .channel('active-stories')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stories', filter: 'status=eq.active' },
        (payload) => {
          if (!mounted) return
          const r = payload.new as RawStory
          if (r.buyer_id !== null) return
          setStories((prev) => [rawToStory(r), ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stories' },
        (payload) => {
          if (!mounted) return
          const r = payload.new as RawStory
          if (r.status !== 'active' || r.buyer_id !== null) {
            setStories((prev) => prev.filter((s) => s.id !== r.id))
          } else {
            setStories((prev) =>
              prev.map((s) => (s.id === r.id ? rawToStory(r) : s))
            )
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'stories' },
        (payload) => {
          if (!mounted) return
          const id = (payload.old as { id: string }).id
          setStories((prev) => prev.filter((s) => s.id !== id))
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  return { stories, loading }
}
