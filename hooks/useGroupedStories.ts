import { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { Story } from '../types'

const VIEWED_STORIES_KEY = 'viewed_stories'

export type SellerStories = {
  sellerId: string
  username: string
  avatarUrl: string | null
  stories: Story[]
  hasUnviewed: boolean
}

export function useGroupedStories() {
  const [sellerGroups, setSellerGroups] = useState<SellerStories[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchErr } = await supabase
        .from('stories')
        .select('*, profiles:seller_id ( id, username, avatar_url )')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (fetchErr) {
        setError(fetchErr.message)
        setSellerGroups([])
        return
      }

      const viewedRaw = await AsyncStorage.getItem(VIEWED_STORIES_KEY)
      const viewedIds: string[] = viewedRaw ? JSON.parse(viewedRaw) : []
      const viewedSet = new Set(viewedIds)

      const groupsMap = new Map<string, SellerStories>()

      for (const row of (data ?? []) as any[]) {
        const sellerId: string = row.seller_id
        const profile = row.profiles ?? {}
        const { profiles, ...storyFields } = row
        const story = storyFields as Story

        let group = groupsMap.get(sellerId)
        if (!group) {
          group = {
            sellerId,
            username: profile.username ?? 'vendeur',
            avatarUrl: profile.avatar_url ?? null,
            stories: [],
            hasUnviewed: false,
          }
          groupsMap.set(sellerId, group)
        }
        group.stories.push(story)
        if (!viewedSet.has(story.id)) {
          group.hasUnviewed = true
        }
      }

      const groups = Array.from(groupsMap.values())
      groups.sort((a, b) => {
        if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1
        return 0
      })
      setSellerGroups(groups)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setSellerGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { sellerGroups, loading, error, refresh: load }
}

export async function markStoryViewed(storyId: string) {
  const raw = await AsyncStorage.getItem(VIEWED_STORIES_KEY)
  const list: string[] = raw ? JSON.parse(raw) : []
  if (list.includes(storyId)) return
  list.push(storyId)
  await AsyncStorage.setItem(VIEWED_STORIES_KEY, JSON.stringify(list))
}
