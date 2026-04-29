import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { callEdgeFunction } from './edgeFunction'

export interface PaymentMethod {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

interface UsePaymentMethodsResult {
  customerId: string | null
  paymentMethods: PaymentMethod[]
  hasPaymentMethod: boolean
  loading: boolean
  error: string | null
  initializeCustomer: () => Promise<string>
  createSetupIntent: () => Promise<{ client_secret: string; customer_id: string }>
  refreshMethods: () => Promise<void>
  removeMethod: (methodId: string) => Promise<void>
}

export function usePaymentMethods(): UsePaymentMethodsResult {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshMethods = useCallback(async (): Promise<void> => {
    try {
      setError(null)
      const res = await callEdgeFunction<{
        payment_methods: Array<{
          id: string
          brand: string
          last4: string
          exp_month: number
          exp_year: number
        }>
      }>('list-payment-methods')
      setPaymentMethods(
        res.payment_methods.map((pm) => ({
          id: pm.id,
          brand: pm.brand,
          last4: pm.last4,
          expMonth: pm.exp_month,
          expYear: pm.exp_year,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('stripe_customer_id')
          .eq('id', session.user.id)
          .maybeSingle()

        if (cancelled) return
        setCustomerId(profile?.stripe_customer_id ?? null)

        if (profile?.stripe_customer_id) {
          await refreshMethods()
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'unknown_error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshMethods])

  const initializeCustomer = useCallback(async (): Promise<string> => {
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const email = user?.email
    const res = await callEdgeFunction<{ customer_id: string }>(
      'create-stripe-customer',
      email ? { email } : undefined
    )
    setCustomerId(res.customer_id)
    return res.customer_id
  }, [])

  const createSetupIntent = useCallback(
    async (): Promise<{ client_secret: string; customer_id: string }> => {
      setError(null)
      const res = await callEdgeFunction<{ client_secret: string; customer_id: string }>(
        'create-setup-intent'
      )
      return res
    },
    []
  )

  // TODO (EAS Build): detach payment method via @stripe/stripe-react-native SDK
  const removeMethod = useCallback(async (_methodId: string): Promise<void> => {
    return
  }, [])

  return {
    customerId,
    paymentMethods,
    hasPaymentMethod: paymentMethods.length > 0,
    loading,
    error,
    initializeCustomer,
    createSetupIntent,
    refreshMethods,
    removeMethod,
  }
}
