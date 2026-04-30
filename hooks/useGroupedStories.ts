import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { Story } from '../types'

const VIEWED_KEY = 'viewed_stories'

export interface SellerGroup {
  sellerId: string
  username: string
  avatarUrl: string | null
  stories: Story[]
  hasUnviewed: boolean
}

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
  speed_preset: string
  status: 'active' | 'sold' | 'expired'
  buyer_id: string | null
  final_price_chf: number | null
  expires_at: string
  last_drop_at: string
  video_duration_seconds: number | null
  duration_hours: 24 | 72 | 168 | null
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
    speed_preset: r.speed_preset as any,
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

export function useGroupedStories(): { sellerGroups: SellerGroup[]; viewedIds: Set<string>; loading: boolean } {
  const [sellerGroups, setSellerGroups] = useState<SellerGroup[]>([])
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchAndGroup() {
      const [{ data, error }, viewedRaw] = await Promise.all([
        supabase
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
          .order('created_at', { ascending: false }),
        AsyncStorage.getItem(VIEWED_KEY),
      ])

      if (!mounted) return

      if (error || !data) {
        setLoading(false)
        return
      }

      let viewedIds: Set<string> = new Set()
      try {
        const parsed = viewedRaw ? JSON.parse(viewedRaw) : []
        viewedIds = new Set(Array.isArray(parsed) ? parsed : [])
      } catch {
        viewedIds = new Set()
      }

      const stories = (data as unknown as RawStory[]).map(rawToStory)

      const groupMap = new Map<string, SellerGroup>()
      for (const story of stories) {
        const existing = groupMap.get(story.seller_id)
        if (existing) {
          existing.stories.push(story)
          if (!viewedIds.has(story.id)) {
            existing.hasUnviewed = true
          }
        } else {
          groupMap.set(story.seller_id, {
            sellerId: story.seller_id,
            username: story.seller?.username ?? 'seller',
            avatarUrl: story.seller?.avatar_url ?? null,
            stories: [story],
            hasUnviewed: !viewedIds.has(story.id),
          })
        }
      }

      setViewedIds(viewedIds)
      setSellerGroups(Array.from(groupMap.values()))
      setLoading(false)
    }

    fetchAndGroup()

    return () => {
      mounted = false
    }
  }, [])

  return { sellerGroups, viewedIds, loading }
}
