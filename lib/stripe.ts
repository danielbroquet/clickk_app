import { useState } from 'react'
import { Alert } from 'react-native'

// Web stub — PaymentSheet is native-only
export const useStoryPurchase = () => {
  const [purchasing, setPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  const handlePurchase = async (
    _storyId: string,
    _amountChf: number,
    _buyerName: string,
    _onSuccess: () => void
  ) => {
    Alert.alert('Error', 'Payments are only supported on mobile.')
  }

  return { handlePurchase, purchasing, purchased, setPurchased }
}
