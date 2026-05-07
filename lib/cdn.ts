export const CDN_BASE = 'https://clickk-cdn.danielbroquet.workers.dev'
export const SUPABASE_STORAGE_BASE = 'https://ckrttngnwoslypyulwuf.supabase.co/storage/v1/object/public'

/**
 * Ensures any media URL is served via Cloudflare CDN.
 * - New R2 URLs (already CDN) → returned as-is
 * - Old Supabase Storage URLs (migration period) → rewritten to CDN
 * - null/undefined → null
 */
export function toCdnUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith(CDN_BASE)) return url
  if (url.includes(SUPABASE_STORAGE_BASE)) {
    return url.replace(SUPABASE_STORAGE_BASE, CDN_BASE)
  }
  return url
}
