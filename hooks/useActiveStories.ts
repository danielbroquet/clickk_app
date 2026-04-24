import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SpeedPreset, Story } from '../types'

interface RawStory {
  id: string
  seller_id: string
  title: string
  description: string | null
  video_url: string
  start_price_chf: number
  floor_price_chf: number
  current_price_chf: number
  price_drop_seconds: number
  speed_preset: SpeedPreset
  status: 'active' | 'sold' | 'expired'
  buyer_id: string | null
  final_price_chf: number | null
  expires_at: string
  last_drop_at: string
  video_duration_seconds: number | null
  duration_hours: number | null
  created_at: string
  updated_at: string
  profiles: { id: string; username: string; avatar_url: string | null } | null
}

function rawToStory(r: RawStory): Story {
  return {
    id: r.id,
    seller_id: r.seller_id,
    title: r.title,
    description: r.description,
    video_url: r.video_url,
    start_price_chf: r.start_price_chf,
    floor_price_chf: r.floor_price_chf,
    current_price_chf: r.current_price_chf,
    price_drop_seconds: r.price_drop_seconds,
    speed_preset: r.speed_preset,
    status: r.status,
    buyer_id: r.buyer_id,
    final_price_chf: r.final_price_chf,
    expires_at: r.expires_at,
    last_drop_at: r.last_drop_at,
    video_duration_seconds: r.video_duration_seconds ?? undefined,
    duration_hours: r.duration_hours ?? undefined,
    created_at: r.created_at,
    seller: r.profiles
      ? {
          id: r.profiles.id,
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
        .select(`
          id, seller_id, title, description,
          video_url, start_price_chf, floor_price_chf,
          current_price_chf, price_drop_seconds,
          status, expires_at, speed_preset,
          buyer_id, final_price_chf, last_drop_at,
          video_duration_seconds, duration_hours,
          created_at, updated_at,
          profiles:seller_id (id, username, avatar_url)
        `)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
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
