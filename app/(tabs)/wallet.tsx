import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Transfer {
  id: string
  amount_chf: number
  date: number
  description: string | null
}

interface Payout {
  id: string
  amount_chf: number
  arrival_date: number
  status: 'paid' | 'pending' | 'failed' | string
}

interface WalletData {
  available_chf: number
  stripe_pending_chf: number
  escrow_pending_chf: number
  transfers: Transfer[]
  payouts: Payout[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCHF(amount: number) {
  return `CHF ${amount.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#00D2B8',
  pending: '#FFA755',
  failed: '#FF4444',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Payé',
  pending: 'En cours',
  failed: 'Échoué',
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return <View style={styles.skeletonCard} />
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const { session } = useAuth()

  const [data, setData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notSeller, setNotSeller] = useState(false)
  const [activeTab, setActiveTab] = useState<'transfers' | 'payouts'>('transfers')

  const fetchWallet = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/get-seller-wallet`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.status === 403) {
        setNotSeller(true)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? 'Erreur inconnue')
      }
      const json: WalletData = await res.json()
      setData(json)
      setError(null)
      setNotSeller(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }, [session?.access_token])

  // Initial load
  React.useEffect(() => {
    setLoading(true)
    fetchWallet().finally(() => setLoading(false))
  }, [fetchWallet])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchWallet()
    setRefreshing(false)
  }, [fetchWallet])

  // ── Not a seller ────────────────────────────────────────────────────────────

  if (!loading && notSeller) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.notSellerText}>
            Disponible uniquement pour les vendeurs
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.screenTitle}>Mon Wallet</Text>
        <View style={styles.cardsRow}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
        <View style={[styles.skeletonCard, { marginHorizontal: 16, height: 200, marginTop: 8 }]} />
      </SafeAreaView>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Erreur de chargement'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => {
            setLoading(true)
            setError(null)
            fetchWallet().finally(() => setLoading(false))
          }}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.screenTitle}>Mon Wallet</Text>

        {/* ── Stat cards ── */}
        <View style={styles.cardsRow}>
          <View style={[styles.statCard, { flex: 1.1 }]}>
            <Text style={styles.statLabel}>Disponible</Text>
            <Text style={[styles.statAmount, { color: colors.primary }]}>
              {fmtCHF(data.available_chf)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>En attente livraison</Text>
            <Text style={[styles.statAmount, { color: '#FFA755' }]}>
              {fmtCHF(data.escrow_pending_chf)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Chez Stripe</Text>
            <Text style={[styles.statAmount, { color: colors.textSecondary }]}>
              {fmtCHF(data.stripe_pending_chf)}
            </Text>
          </View>
        </View>

        {/* ── Tab switcher ── */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'transfers' && styles.tabBtnActive]}
            onPress={() => setActiveTab('transfers')}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabBtnText, activeTab === 'transfers' && styles.tabBtnTextActive]}>
              Virements reçus
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'payouts' && styles.tabBtnActive]}
            onPress={() => setActiveTab('payouts')}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabBtnText, activeTab === 'payouts' && styles.tabBtnTextActive]}>
              Versements banque
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Transfers ── */}
        {activeTab === 'transfers' && (
          <View style={styles.listSection}>
            {data.transfers.length === 0 ? (
              <Text style={styles.emptyText}>Aucun virement reçu</Text>
            ) : (
              data.transfers.map((t) => (
                <View key={t.id} style={styles.listRow}>
                  <Text style={styles.listDate}>{fmtDate(t.date)}</Text>
                  <Text style={[styles.listAmount, { color: colors.primary }]}>
                    {fmtCHF(t.amount_chf)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Payouts ── */}
        {activeTab === 'payouts' && (
          <View style={styles.listSection}>
            {data.payouts.length === 0 ? (
              <Text style={styles.emptyText}>Aucun versement</Text>
            ) : (
              data.payouts.map((p) => (
                <View key={p.id} style={styles.listRow}>
                  <Text style={styles.listDate}>{fmtDate(p.arrival_date)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[p.status] ?? '#888'}22` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[p.status] ?? '#888' }]}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </Text>
                  </View>
                  <Text style={[styles.listAmount, { color: colors.primary }]}>
                    {fmtCHF(p.amount_chf)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },

  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },

  // Stat cards
  cardsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    gap: 8,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  statAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },

  // Skeleton
  skeletonCard: {
    flex: 1,
    height: 76,
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginHorizontal: 4,
    opacity: 0.5,
  },

  // Tab switcher
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.surfaceHigh,
  },
  tabBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
  },

  // List
  listSection: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listDate: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  listAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },

  // Status badge
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginRight: 10,
  },
  statusText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },

  // Empty / error
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 32,
  },
  notSellerText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
  },
})
