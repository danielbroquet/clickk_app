export interface Profile {
  id: string
  username: string
  display_name: string | null
  role: 'buyer' | 'seller' | 'admin'
  avatar_url: string | null
  bio: string | null
  preferred_language: 'fr' | 'de' | 'it'
  followers_count: number
  following_count: number
  stripe_customer_id: string | null
  is_verified: boolean
  created_at: string
}

export type SpeedPreset = 'FLASH' | 'STANDARD' | 'RELAX'

export interface Story {
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
  video_duration_seconds?: number
  duration_hours?: 24 | 72 | 168
  created_at: string
  seller?: Profile
}

export interface ShopListing {
  id: string
  seller_id: string
  title: string
  description: string | null
  price_chf: number
  images: string[]
  category: string | null
  condition: 'new' | 'like_new' | 'good' | 'fair' | null
  stock: number
  is_active: boolean
  created_at: string
  seller?: Profile
}

export interface Auction {
  id: string
  seller_id: string
  title: string
  description: string | null
  images: string[]
  start_price_chf: number
  current_price_chf: number
  bid_increment_chf: number
  status: 'scheduled' | 'live' | 'ended'
  ends_at: string | null
  winner_id: string | null
  final_price_chf: number | null
  created_at: string
  seller?: Profile
}

export type FeedItem =
  | { type: 'listing'; data: ShopListing }
  | { type: 'auction'; data: Auction }

export interface Notification {
  id: string
  user_id: string
  type:
    | 'sale'
    | 'price_drop'
    | 'follow'
    | 'like'
    | 'purchase'
    | 'story_sold'
    | 'outbid'
    | 'auction_won'
    | 'top_up'
    | 'auction_ending'
    | 'new_follower'
  title: string
  message: string
  payload: Record<string, unknown>
  is_read: boolean
  created_at: string
}
