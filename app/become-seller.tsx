import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '../lib/supabase'
import { callEdgeFunction } from '../lib/edgeFunction'
import { colors, fontFamily, spacing } from '../lib/theme'

type Status = 'idle' | 'loading' | 'redirecting' | 'complete' | 'error'

const BENEFITS = [
  { icon: 'flash' as const, title: 'Stories hollandaises', desc: 'Prix qui descend — le premier qui clique achète' },
  { icon: 'shield-checkmark' as const, title: 'Paiements sécurisés', desc: 'Stripe gère tout — conforme LPD Suisse' },
  { icon: 'wallet' as const, title: 'Virements automatiques', desc: '92% du prix de vente sur ton compte' },
  { icon: 'time' as const, title: 'Protection acheteur', desc: "Argent retenu jusqu'à confirmation de réception" },
]

export default function BecomeSellerScreen() {
  const params = useLocalSearchParams()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (params.success === 'true') {
      checkOnboardingStatus()
    }
  }, [params.success])

  const checkOnboardingStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .from('seller_onboarding')
      .select('status')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (data?.status === 'complete') {
      await supabase
        .from('profiles')
        .update({ role: 'seller' })
        .eq('id', session.user.id)
      setStatus('complete')
    }
  }

  const fetchOnboardingUrl = async (): Promise<string | null> => {
    let data: { status?: string; onboarding_url?: string }
    try {
      data = await callEdgeFunction<{ status?: string; onboarding_url?: string }>(
        'create-connect-account'
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'already_onboarded') {
        await checkOnboardingStatus()
        return null
      }
      throw err
    }
    if (data.status === 'complete') {
      setStatus('complete')
      return null
    }
    return data.onboarding_url ?? null
  }

  const startOnboarding = async () => {
    setStatus('loading')
    setErrorMsg(null)

    try {
      const url = await fetchOnboardingUrl()
      if (!url) return

      setStatus('redirecting')
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        'https://ckrttngnwoslypyulwuf.supabase.co/onboarding-complete',
        { preferEphemeralSession: false }
      )

      if (result.type === 'success') {
        const redirectUrl = (result as WebBrowser.WebBrowserAuthSessionResult & { url?: string }).url ?? ''
        if (redirectUrl.startsWith('https://ckrttngnwoslypyulwuf.supabase.co/onboarding-complete')) {
          await checkOnboardingStatus()
        } else if (redirectUrl.startsWith('https://ckrttngnwoslypyulwuf.supabase.co/onboarding-refresh')) {
          setStatus('loading')
          const newUrl = await fetchOnboardingUrl()
          if (newUrl) {
            setStatus('redirecting')
            const refreshResult = await WebBrowser.openAuthSessionAsync(
              newUrl,
              'https://ckrttngnwoslypyulwuf.supabase.co/onboarding-complete',
              { preferEphemeralSession: false }
            )
            if (refreshResult.type === 'success') {
              await checkOnboardingStatus()
            } else {
              setStatus('idle')
            }
          }
        }
      } else {
        setStatus('idle')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'already_onboarded') {
        await checkOnboardingStatus()
        return
      }
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  if (status === 'complete') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>Tu es vendeur !</Text>
          <Text style={styles.successSubtitle}>
            Ton compte vendeur est actif.{'\n'}
            Tu peux maintenant créer des stories et publier des articles.
          </Text>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.startBtnText}>Commencer à vendre →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const busy = status === 'loading' || status === 'redirecting'

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>Deviens vendeur</Text>
        <Text style={styles.subtitle}>
          Crée ton compte vendeur et commence à vendre en quelques minutes.
        </Text>

        {BENEFITS.map((item, i) => (
          <View key={i} style={styles.benefitCard}>
            <View style={styles.benefitIcon}>
              <Ionicons name={item.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.benefitText}>
              <Text style={styles.benefitTitle}>{item.title}</Text>
              <Text style={styles.benefitDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}

        <View style={styles.commissionBadge}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.commissionText}>
            clickk prend une commission de 8% sur chaque vente. Tu gardes 92% du prix de vente.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.mainBtn, busy && styles.mainBtnDisabled]}
          onPress={startOnboarding}
          disabled={busy}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.bg} />
          ) : status === 'redirecting' ? (
            <Text style={styles.mainBtnText}>Ouverture Stripe...</Text>
          ) : (
            <Text style={styles.mainBtnText}>Créer mon compte vendeur →</Text>
          )}
        </TouchableOpacity>

        {status === 'error' && errorMsg && (
          <Text style={styles.errorText}>Erreur : {errorMsg}</Text>
        )}

        <View style={styles.secureRow}>
          <Ionicons name="lock-closed" size={14} color="#707070" />
          <Text style={styles.secureText}>Intégration sécurisée par Stripe · Données chiffrées</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },

  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16,185,129,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.text, textAlign: 'center', marginBottom: 12 },
  successSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  startBtn: {
    backgroundColor: colors.primary,
    borderRadius: 100,
    height: 52,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.bg },

  backBtn: { marginBottom: 32 },
  title: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.text, marginBottom: 8 },
  subtitle: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.textSecondary, marginBottom: 40, lineHeight: 22 },

  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: 12,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,210,184,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  benefitText: { flex: 1 },
  benefitTitle: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text },
  benefitDesc: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  commissionBadge: {
    backgroundColor: 'rgba(0,210,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.2)',
    borderRadius: 12,
    padding: spacing.md,
    marginTop: 8,
    marginBottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  commissionText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },

  mainBtn: {
    backgroundColor: colors.primary,
    borderRadius: 100,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  mainBtnDisabled: { backgroundColor: 'rgba(0,210,184,0.5)' },
  mainBtnText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.bg },

  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },

  secureRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  secureText: { fontFamily: fontFamily.regular, fontSize: 12, color: '#707070', marginLeft: 6 },
})
