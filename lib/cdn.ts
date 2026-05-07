const SUPABASE_STORAGE_BASE = 'https://ckrttngnwoslypyulwuf.supabase.co/storage/v1/object/public'
const CDN_BASE = 'https://clickk-cdn.danielbroquet.workers.dev'

export function toCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (!url.includes(SUPABASE_STORAGE_BASE)) return url
  return url.replace(SUPABASE_STORAGE_BASE, CDN_BASE)
}
