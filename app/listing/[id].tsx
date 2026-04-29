import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../../components/ui/Avatar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Video, ResizeMode } from 'expo-av'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'
import { getOrCreateConversation } from '../../lib/utils'
import { useStripePayment } from '../../hooks/useStripePayment'

type ListingMediaItemProps = {
  url: string
  index: number
  isActive: boolean
  videoRefs: React.MutableRefObject<{ [key: number]: any }>
}

const ListingMediaItem = ({ url, index, isActive, videoRefs }: ListingMediaItemProps) => {
  const isVideo = ['mp4', 'mov', 'avi', 'webm'].includes(url.split('.').pop()?.toLowerCase() ?? '')

  if (isVideo) {
    return (
      <Video
        ref={(ref) => { videoRefs.current[index] = ref }}
        source={{ uri: url }}
        style={styles.carouselImage}
        resizeMode={ResizeMode.COVER}
        shouldPlay={isActive}
        isLooping={true}
        isMuted={false}
        useNativeControls={false}
      />
    )
  }
  return (
    <Image
      source={{ uri: url }}
      style={styles.carouselImage}
      resizeMode="cover"
    />
  )
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CAROUSEL_HEIGHT = 300

interface Seller {
  id: string
  display_name: string | null
  avatar_url: string | null
  username: string
}

interface Listing {
  id: string
  title: string
  description: string | null
  price_chf: number
  images: string[]
  category: string | null
  condition: string | null
  stock: number
  is_active: boolean
  seller_id: string
  seller: Seller | null
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeImage, setActiveImage] = useState(0)
  const videoRefs = useRef<{ [key: number]: any }>({})
  const [chatLoading, setChatLoading] = useState(false)
  const [buying, setBuying] = useState(false)
  const [instantLoading, setInstantLoading] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const { pay: payWithSheet, isLoading: sheetLoading, error: sheetError } = useStripePayment({
    amount: listing?.price_chf ?? 0,
    currency: 'CHF',
    listingId: listing?.id,
    sellerId: listing?.seller_id ?? '',
  })

  useEffect(() => {
    if (!id) return
    supabase
      .from('shop_listings')
      .select(`
        id, title, description, price_chf, images,
        category, condition, stock, is_active, seller_id,
        seller:seller_id ( id, display_name, avatar_url, username )
      `)
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setFetchError(error.message)
        else setListing(data as unknown as Listing)
        setLoading(false)
      })
  }, [id])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    setActiveImage(newIndex)
    Object.entries(videoRefs.current).forEach(([i, ref]) => {
      if (ref) {
        if (Number(i) === newIndex) {
          ref.playAsync()
        } else {
          ref.pauseAsync()
        }
      }
    })
  }, [])

  const handleContact = async () => {
    if (!listing || !listing.seller || currentUserId === listing.seller_id) return
    setChatLoading(true)
    try {
      const convId = await getOrCreateConversation(supabase, currentUserId, listing.seller_id)
      router.push(`/conversation/${convId}`)
    } catch {
      // silently ignore
    } finally {
      setChatLoading(false)
    }
  }

  const handleBuy = async () => {
    if (!listing || !session) return
    setOrderError(null)
    setBuying(true)

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
    const errorMap: Record<string, string> = {
      listing_not_active: "Cet article n'est plus disponible.",
      out_of_stock: 'Cet article est en rupture de stock.',
      cannot_buy_own_listing: 'Vous ne pouvez pas acheter votre propre article.',
      listing_not_found: 'Article introuvable.',
    }

    if (Platform.OS !== 'web') {
      try {
        const result = await payWithSheet()
        if (result) {
          router.replace({
            pathname: '/listing/order-confirmation',
            params: {
              sessionId: result.paymentIntentId,
              title: listing.title,
              price: listing.price_chf.toFixed(2),
            },
          })
        } else if (sheetError && sheetError !== 'web_not_supported') {
          const msg = errorMap[sheetError] ?? sheetError
          setOrderError(msg)
          Alert.alert('Erreur de paiement', msg)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Une erreur est survenue.'
        setOrderError(msg)
        Alert.alert('Erreur de paiement', msg)
      } finally {
        setBuying(false)
      }
      return
    }

    const callEF = async (mode: 'instant' | 'checkout') => {
      const res = await fetch(`${supabaseUrl}/functions/v1/create-listing-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ listing_id: listing.id, mode }),
      })
      return res.json()
    }

    try {
      // Check for saved payment method
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', currentUserId)
        .maybeSingle()

      const stripeCustomerId = profile?.stripe_customer_id ?? null

      if (stripeCustomerId) {
        setInstantLoading(true)
        try {
          const json = await callEF('instant')

          if (json.status === 'succeeded') {
            router.replace({
              pathname: '/listing/order-confirmation',
              params: {
                sessionId: json.payment_intent_id ?? '',
                title: listing.title,
                price: listing.price_chf.toFixed(2),
              },
            })
            return
          }

          if (json.status === 'requires_action') {
            // TODO (EAS Build): open Stripe SDK 3DS flow with json.client_secret
            Alert.alert(
              'Authentification requise',
              "La vérification 3DS sera disponible dans la version native de l'application."
            )
            return
          }

          // status === 'failed' or no_payment_method — fall through to checkout
          if (json.error && json.error !== 'no_payment_method' && json.status !== 'failed') {
            throw new Error(errorMap[json.error] ?? json.error ?? 'Erreur instant payment.')
          }
        } finally {
          setInstantLoading(false)
        }
      }

      // Checkout fallback
      const json = await callEF('checkout')
      if (!json.checkoutUrl) {
        throw new Error(errorMap[json.error] ?? json.error ?? 'Impossible de créer la session de paiement.')
      }

      const result = await WebBrowser.openAuthSessionAsync(
        json.checkoutUrl,
        'clickk://payment-success'
      )

      if (result.type === 'success') {
        const redirectUrl = (result as { url?: string }).url ?? ''
        const sessionId =
          new URL(redirectUrl.replace('clickk://', 'https://placeholder/')).searchParams.get('session_id') ??
          json.sessionId
        router.replace({
          pathname: '/listing/order-confirmation',
          params: {
            sessionId,
            title: listing.title,
            price: listing.price_chf.toFixed(2),
          },
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Une erreur est survenue.'
      setOrderError(msg)
      Alert.alert('Erreur de paiement', msg)
    } finally {
      setBuying(false)
      setInstantLoading(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (fetchError || !listing) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{fetchError ?? 'Article introuvable.'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const isSeller = currentUserId === listing.seller_id
  const unavailable = !listing.is_active || listing.stock === 0
  const outOfStock = listing.stock === 0
  const images = listing.images ?? []
  const sellerName = listing.seller?.display_name ?? listing.seller?.username ?? 'Vendeur'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Floating back button over carousel */}
      <TouchableOpacity onPress={() => router.back()} style={styles.floatingBack}>
        <View style={styles.floatingBackInner}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </View>
      </TouchableOpacity>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Image carousel */}
        {images.length > 0 ? (
          <View>
            <FlatList
              data={images}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => (
                <ListingMediaItem
                  url={item}
                  index={index}
                  isActive={activeImage === index}
                  videoRefs={videoRefs}
                />
              )}
            />
            {images.length > 1 && (
              <View style={styles.dots}>
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === activeImage && styles.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={48} color={colors.border} />
          </View>
        )}

        <View style={styles.body}>
          {/* Title & price */}
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>CHF {listing.price_chf.toFixed(2)}</Text>

          {/* Badges */}
          <View style={styles.badgeRow}>
            {listing.condition && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{listing.condition}</Text>
              </View>
            )}
            {listing.category && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{listing.category}</Text>
              </View>
            )}
          </View>

          {/* Stock */}
          <Text style={[styles.stock, outOfStock && styles.stockOut]}>
            {outOfStock ? 'Rupture de stock' : `${listing.stock} disponible${listing.stock > 1 ? 's' : ''}`}
          </Text>

          {/* Description */}
          {listing.description ? (
            <Text style={styles.description}>{listing.description}</Text>
          ) : null}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Seller row */}
          {listing.seller && (
            <View style={styles.sellerRow}>
              <Avatar
                uri={listing.seller.avatar_url}
                name={sellerName}
                size={44}
              />
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>{sellerName}</Text>
                <Text style={styles.sellerUsername}>@{listing.seller.username}</Text>
              </View>
              {!isSeller && (
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={handleContact}
                  disabled={chatLoading}
                  activeOpacity={0.8}
                >
                  {chatLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.contactBtnText}>Contacter</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Order error */}
          {orderError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{orderError}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isSeller ? (
          <View style={styles.ownerLabel}>
            <Text style={styles.ownerLabelText}>Votre article</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.buyBtn, (unavailable || buying) && styles.buyBtnDisabled]}
            onPress={handleBuy}
            disabled={unavailable || buying}
            activeOpacity={0.85}
          >
            {instantLoading || sheetLoading ? (
              <View style={styles.buyBtnInner}>
                <ActivityIndicator size="small" color="#0F0F0F" />
                <Text style={styles.buyBtnText}>Achat en cours...</Text>
              </View>
            ) : buying ? (
              <ActivityIndicator size="small" color="#0F0F0F" />
            ) : (
              <Text style={styles.buyBtnText}>
                {outOfStock ? 'Rupture de stock' : !listing.is_active ? 'Article indisponible' : `Acheter — CHF ${listing.price_chf.toFixed(2)}`}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { padding: spacing.md },
  floatingBack: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 10,
  },
  floatingBackInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  imagePlaceholder: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
  },
  body: {
    padding: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.text,
    marginBottom: 6,
    lineHeight: 26,
  },
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  stock: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.success,
    marginBottom: spacing.md,
  },
  stockOut: {
    color: colors.error,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.text,
  },
  sellerUsername: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contactBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    minWidth: 48,
    alignItems: 'center',
  },
  contactBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.primary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.error,
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.md,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  buyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnDisabled: {
    opacity: 0.45,
  },
  buyBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: '#0F0F0F',
  },
  buyBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ownerLabel: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerLabelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
})
