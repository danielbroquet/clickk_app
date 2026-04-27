import { useState } from 'react'
import { Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { callEdgeFunction } from './edgeFunction'
import { supabase } from './supabase'

type InstantSuccessResponse = { status: 'succeeded'; payment_intent_id: string }
type InstantActionResponse = { status: 'requires_action'; client_secret: string }
type InstantFailedResponse = { status: 'failed'; error: string }
type CheckoutResponse = { checkoutUrl: string; sessionId: string }

type PaymentIntentResponse =
  | InstantSuccessResponse
  | InstantActionResponse
  | InstantFailedResponse
  | CheckoutResponse

export const useStoryPurchase = () => {
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [purchased, setPurchased] = useState(false)
  const [instantLoading, setInstantLoading] = useState(false)

  const handlePurchase = async (
    storyId: string,
    amountChf: number,
    onSuccess?: () => void
  ) => {
    if (purchasing) return
    setPurchasing(true)
    setPurchaseError(null)
    setPurchased(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id

      let stripeCustomerId: string | null = null
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('stripe_customer_id')
          .eq('id', userId)
          .maybeSingle()
        stripeCustomerId = profile?.stripe_customer_id ?? null
      }

      const useInstant = !!stripeCustomerId

      if (useInstant) {
        setInstantLoading(true)
        try {
          const res = await callEdgeFunction<PaymentIntentResponse>(
            'create-payment-intent',
            { story_id: storyId, amount_chf: amountChf, mode: 'instant' }
          )

          if ('status' in res) {
            if (res.status === 'succeeded') {
              setPurchased(true)
              onSuccess?.()
              return
            }

            if (res.status === 'requires_action') {
              // TODO (EAS Build): open Stripe SDK 3DS flow with res.client_secret
              Alert.alert(
                'Authentification requise',
                "La vérification 3DS sera disponible dans la version native de l'application."
              )
              return
            }

            if (res.status === 'failed') {
              // Instant failed — fall through to checkout
            }
          }
        } finally {
          setInstantLoading(false)
        }
      }

      // Checkout fallback (also used when: no saved card, instant failed, or no_payment_method)
      const res = await callEdgeFunction<CheckoutResponse>(
        'create-payment-intent',
        { story_id: storyId, amount_chf: amountChf, mode: 'checkout' }
      )

      const checkoutUrl = (res as CheckoutResponse).checkoutUrl
      if (!checkoutUrl) throw new Error('no_checkout_url')

      const result = await WebBrowser.openAuthSessionAsync(
        checkoutUrl,
        'clickk://payment-success'
      )

      if (result.type === 'success') {
        setPurchased(true)
        onSuccess?.()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur paiement'
      setPurchaseError(message)
      Alert.alert('Erreur', message)
    } finally {
      setPurchasing(false)
      setInstantLoading(false)
    }
  }

  return { handlePurchase, purchasing, purchaseError, purchased, instantLoading }
}
