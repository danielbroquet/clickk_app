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

export const formatRelativeTime = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export const getConditionLabel = (c: string): string =>
  ({ new: 'Neuf', like_new: 'Comme neuf', good: 'Bon état', fair: 'Correct' }[c] ?? c)
