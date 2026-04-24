import { supabase } from './supabase'

export async function callEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('not_authenticated')

  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: payload ? JSON.stringify(payload) : undefined,
    }
  )

  const data = await response.json() as T & { error?: string }
  if (data.error) throw new Error(data.error)
  return data
}
