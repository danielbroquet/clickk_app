import { useState } from 'react'
import { Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'

export const useStoryPurchase = () => {
  const [purchasing, setPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  const handlePurchase = async (
    storyId: string,
    amountChf: number,
    _buyerName: string,
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
      if (!data.checkoutUrl) throw new Error('no_checkout_url')

      const result = await WebBrowser.openAuthSessionAsync(
        data.checkoutUrl,
        'clickk://payment-success'
      )

      if (result.type === 'success') {
        setPurchased(true)
        onSuccess()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur paiement'
      Alert.alert('Error', message)
    } finally {
      setPurchasing(false)
    }
  }

  return { handlePurchase, purchasing, purchased, setPurchased }
}
