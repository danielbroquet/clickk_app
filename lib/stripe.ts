import { useState } from 'react'
import { Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { callEdgeFunction } from './edgeFunction'

export const useStoryPurchase = () => {
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [purchased, setPurchased] = useState(false)

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
      const { checkoutUrl } = await callEdgeFunction<{ checkoutUrl: string; sessionId: string }>(
        'create-payment-intent',
        { story_id: storyId, amount_chf: amountChf }
      )

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
      Alert.alert('Error', message)
    } finally {
      setPurchasing(false)
    }
  }

  return { handlePurchase, purchasing, purchaseError, purchased }
}
