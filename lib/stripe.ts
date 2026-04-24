import { useState } from 'react'
import { supabase } from './supabase'

export const useStoryPurchase = () => {
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [purchased, setPurchased] = useState(false)

  const purchaseStory = async (
    storyId: string,
    amountChf: number
  ): Promise<{ success: boolean; error?: string }> => {
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

      // On web, redirect to Stripe Checkout
      if (typeof window !== 'undefined') {
        window.open(data.checkoutUrl, '_blank')
        return { success: true }
      }

      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur paiement'
      return { success: false, error: message }
    }
  }

  const handlePurchase = async (storyId: string, currentPrice: number, onClose: () => void) => {
    if (purchasing) return
    setPurchasing(true)
    setPurchaseError(null)

    const result = await purchaseStory(storyId, currentPrice)

    if (result.success) {
      setPurchased(true)
      setTimeout(() => {
        onClose()
        setPurchased(false)
      }, 2000)
    } else if (result.error !== 'canceled') {
      setPurchaseError(result.error ?? 'Erreur paiement')
    }

    setPurchasing(false)
  }

  return { purchaseStory, handlePurchase, purchasing, purchaseError, purchased, setPurchaseError, setPurchased }
}
