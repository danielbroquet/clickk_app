import { useState } from 'react'
import { Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { router } from 'expo-router'
import { callEdgeFunction } from './edgeFunction'
import { safeNavigate } from './navigate'
import { supabase } from './supabase'
import { useTranslation } from './i18n'

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
  const { t } = useTranslation()
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
        let instantFailed = false
        try {
          const res = await callEdgeFunction<PaymentIntentResponse>(
            'create-payment-intent',
            { story_id: storyId, amount_chf: amountChf, mode: 'instant' }
          )
          if ('status' in res) {
            if (res.status === 'succeeded') {
              setPurchased(true)
              onSuccess?.()
              await safeNavigate(`/shipping/${storyId}`)
              return
            }
            if (res.status === 'requires_action') {
              Alert.alert(
                t('stripe_screen.auth_required_title'),
                t('stripe_screen.auth_required_msg')
              )
              return
            }
            // Any other status → fall through to checkout
            instantFailed = true
          } else if ('error' in (res as any)) {
            // no_payment_method or any instant error → fall through to checkout
            instantFailed = true
          }
        } catch {
          // Instant failed for any reason → fall through to checkout
          instantFailed = true
        } finally {
          setInstantLoading(false)
        }
        if (!instantFailed) return
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
        await safeNavigate(`/shipping/${storyId}`)
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : t('errors.payment_error')
      const message = rawMessage === 'cannot_buy_own_story'
        ? t('errors.own_article')
        : rawMessage
      setPurchaseError(message)
      Alert.alert(t('common.error'), message)
    } finally {
      setPurchasing(false)
      setInstantLoading(false)
    }
  }

  return { handlePurchase, purchasing, purchaseError, purchased, instantLoading }
}
