import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'
import { supabase } from '../../lib/supabase'

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

interface PayoutLogRow {
  amount_chf: number
  status: string
  arrival_date: number | null
  created_at: string
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

function fmtRelative(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Il y a ${days}j`
  return new Date(isoString).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

const LOG_STATUS_COLORS: Record<string, string> = {
  pending: '#FFA755',
  in_transit: '#FFA755',
  paid: '#00D2B8',
  failed: '#FF4444',
  canceled: '#FF4444',
}

const LOG_STATUS_LABELS: Record<string, string> = {
  pending: 'En cours',
  in_transit: 'En cours',
  paid: 'Versé',
  failed: 'Échoué',
  canceled: 'Échoué',
}

const PAYOUT_ERROR_MESSAGES: Record<string, string> = {
  no_stripe_account: 'Compte Stripe non configuré',
  payouts_not_enabled: 'Vérification Stripe en cours',
  insufficient_balance: 'Solde insuffisant',
  amount_below_minimum: 'Montant minimum 0.50 CHF',
  stripe_not_configured: 'Service de paiement non configuré',
  unauthorized: 'Session expirée, veuillez vous reconnecter',
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

  // Withdraw modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  // Payout log state
  const [payoutLog, setPayoutLog] = useState<PayoutLogRow[]>([])
  const [logLoading, setLogLoading] = useState(false)

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

  const fetchPayoutLog = useCallback(async () => {
    if (!session?.user?.id) return
    setLogLoading(true)
    try {
      const { data: rows } = await supabase
        .from('payouts_log')
        .select('amount_chf, status, arrival_date, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setPayoutLog(rows ?? [])
    } catch {
      // silent — supplementary audit data
    } finally {
      setLogLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchWallet(), fetchPayoutLog()]).finally(() => setLoading(false))
  }, [fetchWallet, fetchPayoutLog])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchWallet(), fetchPayoutLog()])
    setRefreshing(false)
  }, [fetchWallet, fetchPayoutLog])

  const handleConfirmWithdraw = useCallback(async () => {
    if (!session?.access_token) return
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/create-payout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        const key = json?.error ?? ''
        const msg = PAYOUT_ERROR_MESSAGES[key] ?? json?.message ?? 'Erreur lors du retrait'
        setWithdrawError(msg)
        return
      }
      setShowWithdrawModal(false)
      const arrivalLabel = json.arrival_date ? fmtDate(json.arrival_date) : 'prochainement'
      Alert.alert(
        'Retrait confirmé !',
        `CHF ${Number(json.amount_chf).toFixed(2)} arriveront sur votre compte bancaire le ${arrivalLabel}.`,
      )
      await Promise.all([fetchWallet(), fetchPayoutLog()])
    } catch (err: unknown) {
      setWithdrawError(err instanceof Error ? err.message : 'Erreur réseau')
    } finally {
      setWithdrawing(false)
    }
  }, [session?.access_token, fetchWallet, fetchPayoutLog])

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
        <View style={[styles.skeletonCard, { marginHorizontal: 16, height: 52, marginTop: 8 }]} />
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

  const canWithdraw = data.available_chf >= 0.50

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

        {/* ── Retirer button ── */}
        <TouchableOpacity
          style={[styles.withdrawBtn, !canWithdraw && styles.withdrawBtnDisabled]}
          onPress={() => {
            setWithdrawError(null)
            setShowWithdrawModal(true)
          }}
          disabled={!canWithdraw}
          activeOpacity={0.8}
        >
          <Text style={[styles.withdrawBtnText, !canWithdraw && styles.withdrawBtnTextDisabled]}>
            {canWithdraw
              ? `Retirer CHF ${data.available_chf.toFixed(2)}`
              : 'Aucun fonds disponible'}
          </Text>
        </TouchableOpacity>

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

        {/* ── Historique des retraits ── */}
        <Text style={styles.sectionTitle}>Historique des retraits</Text>
        <View style={styles.listSection}>
          {logLoading ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 24 }} />
          ) : payoutLog.length === 0 ? (
            <Text style={styles.emptyText}>Aucun retrait effectué</Text>
          ) : (
            payoutLog.map((row, idx) => {
              const logColor = LOG_STATUS_COLORS[row.status] ?? '#888'
              const logLabel = LOG_STATUS_LABELS[row.status] ?? row.status
              const isPending = row.status === 'pending' || row.status === 'in_transit'
              return (
                <View
                  key={idx}
                  style={[styles.listRow, idx === payoutLog.length - 1 && styles.listRowLast]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listDate}>{fmtRelative(row.created_at)}</Text>
                    {isPending && row.arrival_date ? (
                      <Text style={styles.arrivalText}>Arrivée le {fmtDate(row.arrival_date)}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${logColor}22` }]}>
                    <Text style={[styles.statusText, { color: logColor }]}>{logLabel}</Text>
                  </View>
                  <Text style={[styles.listAmount, { color: colors.primary }]}>
                    {fmtCHF(Number(row.amount_chf))}
                  </Text>
                </View>
              )
            })
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Withdraw confirmation modal ── */}
      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="slide"
        onRequestClose={() => !withdrawing && setShowWithdrawModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !withdrawing && setShowWithdrawModal(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Retrait des fonds</Text>

            <Text style={styles.modalAmount}>
              CHF {data.available_chf.toFixed(2)}
            </Text>

            <Text style={styles.modalSubtitle}>
              Les fonds seront virés sur votre compte bancaire enregistré dans Stripe sous 1 à 3 jours ouvrables.
            </Text>

            {withdrawError ? (
              <Text style={styles.modalError}>{withdrawError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowWithdrawModal(false)}
                disabled={withdrawing}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmBtn, withdrawing && styles.confirmBtnDisabled]}
                onPress={handleConfirmWithdraw}
                disabled={withdrawing}
                activeOpacity={0.8}
              >
                {withdrawing ? (
                  <ActivityIndicator color="#0F0F0F" size="small" />
                ) : (
                  <Text style={styles.confirmText}>Confirmer le retrait</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

  // Retirer button
  withdrawBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawBtnDisabled: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  withdrawBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#0F0F0F',
  },
  withdrawBtnTextDisabled: {
    color: colors.textSecondary,
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

  // Section title
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },

  // List
  listSection: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  listDate: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  arrivalText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 36,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  modalError: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  confirmBtn: {
    flex: 1.6,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.7,
  },
  confirmText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#0F0F0F',
  },
})
