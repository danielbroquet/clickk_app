// Web stub — PaymentSheet is native-only. Web callers fall back to WebBrowser Checkout.

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

export function useStripePayment(_params: UseStripePaymentParams) {
  return {
    pay: async (): Promise<PaymentResult | null> => null,
    isLoading: false,
    error: 'web_not_supported' as string | null,
  }
}
