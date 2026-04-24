import { useStripe } from '@stripe/stripe-react-native'
import { useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from './supabase'

export const useStoryPurchase = () => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [purchasing, setPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  const handlePurchase = async (
    storyId: string,
    amountChf: number,
    buyerName: string,
    onSuccess: () => void
  ) => {
    if (purchasing) return
    setPurchasing(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('not_authenticated')

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ story_id: storyId, amount_chf: amountChf }),
        }
      )

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Clickk',
        paymentIntentClientSecret: data.clientSecret,
        defaultBillingDetails: { name: buyerName },
        returnURL: 'clickk://payment-return',
      })
      if (initError) throw new Error(initError.message)

      const { error: paymentError } = await presentPaymentSheet()
      if (paymentError) {
        if (paymentError.code !== 'Canceled') {
          Alert.alert('Payment failed', paymentError.message)
        }
        return
      }

      setPurchased(true)
      onSuccess()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur paiement'
      Alert.alert('Error', message)
    } finally {
      setPurchasing(false)
    }
  }

  return { handlePurchase, purchasing, purchased, setPurchased }
}
