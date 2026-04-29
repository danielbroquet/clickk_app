import { useState, useCallback } from 'react'
import { Platform } from 'react-native'
import { useStripe } from '@stripe/stripe-react-native'
import { supabase } from '../lib/supabase'

export interface UseStripePaymentParams {
  amount: number
  currency?: string
  listingId?: string
  storyId?: string
  sellerId: string
}

export interface PaymentResult {
  paymentIntentId: string
}

export function useStripePayment(params: UseStripePaymentParams) {
  const { amount, listingId, storyId, sellerId } = params
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = useCallback(async (): Promise<PaymentResult | null> => {
    if (Platform.OS === 'web') {
      setError('web_not_supported')
      return null
    }
    if (!listingId && !storyId) {
      setError('missing_target')
      return null
    }

    setError(null)
    setIsLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('not_authenticated')

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const endpoint = listingId
        ? 'create-listing-payment-intent'
        : 'create-payment-intent'

      const body = listingId
        ? { listing_id: listingId, mode: 'instant' }
        : { story_id: storyId, amount_chf: amount, mode: 'instant' }

      const res = await fetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const json = await res.json()

      // Happy path without 3DS: EF already confirmed off-session via saved card.
      if (json.status === 'succeeded' && json.payment_intent_id) {
        return { paymentIntentId: json.payment_intent_id as string }
      }

      const clientSecret: string | undefined = json.client_secret
      if (!clientSecret) {
        const message = json.error ?? 'missing_client_secret'
        throw new Error(message)
      }

      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'clickk',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL: 'clickk://payment-success',
        applePay: { merchantCountryCode: 'CH' },
        googlePay: {
          merchantCountryCode: 'CH',
          currencyCode: (params.currency ?? 'CHF').toUpperCase(),
          testEnv: __DEV__,
        },
      })
      if (initErr) throw new Error(initErr.message)

      const { error: presentErr } = await presentPaymentSheet()
      if (presentErr) {
        if (presentErr.code === 'Canceled') {
          return null
        }
        throw new Error(presentErr.message)
      }

      const paymentIntentId = (clientSecret.split('_secret_')[0] ?? '').trim()
      return { paymentIntentId }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'payment_error'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [amount, listingId, storyId, sellerId, params.currency, initPaymentSheet, presentPaymentSheet])

  return { pay, isLoading, error }
}
