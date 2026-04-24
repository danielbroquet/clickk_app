import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface StoryRow {
  id: string
  start_price_chf: number
  floor_price_chf: number
  current_price_chf: number
  price_drop_seconds: number
  last_drop_at: string
  speed_preset: string
}

function computeDropAmount(startPrice: number, speedPreset: string): number {
  const rates: Record<string, number> = {
    SLOW: 0.05,
    STANDARD: 0.1,
    FAST: 0.2,
  }
  const rate = rates[speedPreset] ?? 0.1
  return Math.round(startPrice * rate * 100) / 100
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    // ── Security ─────────────────────────────────────────────────────────────
    const secret = Deno.env.get('CRON_SECRET')
    const auth = req.headers.get('Authorization')
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const nowIso = now.toISOString()

    // ── Step 1: expire outdated stories ──────────────────────────────────────
    await supabase
      .from('stories')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', nowIso)
      .is('buyer_id', null)

    // ── Step 2: fetch active stories with price_drop_seconds > 0 ─────────────
    const { data: stories, error: fetchError } = await supabase
      .from('stories')
      .select(
        'id, start_price_chf, floor_price_chf, current_price_chf, price_drop_seconds, last_drop_at, speed_preset'
      )
      .eq('status', 'active')
      .is('buyer_id', null)
      .gt('price_drop_seconds', 0)

    if (fetchError) throw fetchError

    const all: StoryRow[] = stories ?? []

    // ── Step 3: filter due stories in memory ─────────────────────────────────
    const due = all.filter((story) => {
      const secondsSinceDrop =
        (now.getTime() - new Date(story.last_drop_at).getTime()) / 1000
      return secondsSinceDrop >= story.price_drop_seconds
    })

    // ── Step 4 + 5: compute and update prices concurrently ───────────────────
    const computedNewPrices: Record<string, number> = {}

    await Promise.all(
      due.map(async (story) => {
        const dropAmount = computeDropAmount(story.start_price_chf, story.speed_preset)
        const rawNewPrice = story.current_price_chf - dropAmount
        const newPrice = Math.max(rawNewPrice, story.floor_price_chf)
        const roundedPrice = Math.round(newPrice * 100) / 100

        computedNewPrices[story.id] = roundedPrice

        await supabase
          .from('stories')
          .update({
            current_price_chf: roundedPrice,
            last_drop_at: nowIso,
          })
          .eq('id', story.id)
      })
    )

    // ── Step 6: return summary ───────────────────────────────────────────────
    const body = {
      processed: due.length,
      timestamp: nowIso,
      drops: due.map((s) => ({
        id: s.id,
        old_price: s.current_price_chf,
        new_price: computedNewPrices[s.id],
      })),
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[price-drop]', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
