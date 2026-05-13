export const formatPrice = (amount: number): string =>
  `CHF ${amount.toFixed(2)}`

/**
 * Find an existing direct conversation between two users (no story context),
 * or create one if none exists. Returns the conversation id.
 * story_id is intentionally omitted so this is a general "message this user" flow.
 */
export async function getOrCreateConversation(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  currentUserId: string,
  otherUserId: string,
): Promise<string> {
  // Canonical order: the user who initiates is buyer, the other is seller.
  // Try both orderings so we reuse any pre-existing conversation.
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(buyer_id.eq.${currentUserId},seller_id.eq.${otherUserId}),` +
      `and(buyer_id.eq.${otherUserId},seller_id.eq.${currentUserId})`
    )
    .is('story_id', null)
    .limit(1)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ buyer_id: currentUserId, seller_id: otherUserId })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return created.id
}

type TFunc = (key: string, params?: Record<string, string | number>) => string

export const formatRelativeTime = (dateStr: string, t: TFunc): string => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('utils.just_now')
  if (mins < 60) return t('utils.minutes_ago', { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('utils.hours_ago', { count: hours })
  return t('utils.days_ago', { count: Math.floor(hours / 24) })
}

export const getConditionLabel = (c: string, t: TFunc): string =>
  ({ new: t('utils.condition_new'), like_new: t('utils.condition_like_new'), good: t('utils.condition_good'), fair: t('utils.condition_fair') }[c] ?? c)
