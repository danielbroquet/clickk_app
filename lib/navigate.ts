import { router } from 'expo-router'

export async function safeNavigate(path: string, options?: { replace?: boolean }) {
  await new Promise(resolve => setTimeout(resolve, 300))
  try {
    if (options?.replace) {
      router.replace(path as any)
    } else {
      router.push(path as any)
    }
  } catch (e) {
    console.error('Navigation error:', e)
  }
}
