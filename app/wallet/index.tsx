import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, spacing, fontSize } from '../../lib/theme'
import { useAuth } from '../../lib/auth'
import { callEdgeFunction } from '../../lib/edgeFunction'
import { useTranslation } from '../../lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  status: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed'
}

interface WalletData {
  available_chf: number
  stripe_pending_chf: number
  escrow_pending_chf: number
  transfers: Transfer[]
  payouts: Payout[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(unix: number): string {
  const d = new Date(unix * 1000)
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const PAYOUT_STATUS_COLORS: Record<string, string> = {
  paid:        '#10B981',
  pending:     '#F59E0B',
  in_transit:  '#3B82F6',
  canceled:    '#EF4444',
  failed:      '#EF4444',
}

// ─── Components ───────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>
}

function TransactionRow({ transfer, t }: { transfer: Transfer; t: (key: string, options?: any) => string }) {
  return (
    <View style={styles.txRow}>
      <View style={styles.txIconWrap}>
        <Ionicons name="arrow-down-circle" size={22} color="#10B981" />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txLabel} numberOfLines={1}>
          {transfer.description ? `${t('profile.sales')} #${transfer.description.slice(-6)}` : t('profile.sales')}
        </Text>
        <Text style={styles.txDate}>{formatDate(transfer.date)}</Text>
      </View>
      <Text style={styles.txAmount}>+CHF {transfer.amount_chf.toFixed(2)}</Text>
    </View>
  )
}

function PayoutRow({ payout, t }: { payout: Payout; t: (key: string, options?: any) => string }) {
  const color = PAYOUT_STATUS_COLORS[payout.status] ?? PAYOUT_STATUS_COLORS.pending
  return (
    <View style={styles.txRow}>
      <View style={styles.txIconWrap}>
        <Ionicons name="arrow-up-circle" size={22} color={color} />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txLabel}>{t('wallet.transfer_bank')}</Text>
        <Text style={styles.txDate}>{formatDate(payout.arrival_date)}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, { color: colors.text }]}>
          -CHF {payout.amount_chf.toFixed(2)}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
      </View>
    </View>
  )
}

function EmptyTransactions({ t }: { t: (key: string, options?: any) => string }) {
  return (
    <View style={styles.emptyTx}>
      <Ionicons name="receipt-outline" size={40} color={colors.border} />
      <Text style={styles.emptyTxText}>{t('wallet.no_transactions')}</Text>
      <Text style={styles.emptyTxSub}>{t('wallet.no_transactions_hint')}</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const { t } = useTranslation()
  const { session, profile } = useAuth()
  const isSeller = profile?.role === 'seller'

  const [data, setData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWallet = useCallback(async () => {
    if (!session || !isSeller) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      const res = await callEdgeFunction<WalletData>('get-seller-wallet')
      setData(res)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('errors.unknown')
      setError(msg)
    }
  }, [session, isSeller])

  useEffect(() => {
    setLoading(true)
    fetchWallet().finally(() => setLoading(false))
  }, [fetchWallet])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchWallet()
    setRefreshing(false)
  }, [fetchWallet])

  const allTransactions: Array<{ type: 'transfer' | 'payout'; item: Transfer | Payout; date: number }> = [
    ...(data?.transfers ?? []).map(t => ({ type: 'transfer' as const, item: t, date: t.date })),
    ...(data?.payouts ?? []).map(p => ({ type: 'payout' as const, item: p, date: p.arrival_date })),
  ].sort((a, b) => b.date - a.date)

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
          title: t('wallet.title'),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fontFamily.bold },
          headerShadowVisible: false,
        }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          {/* Balance card */}
          <LinearGradient colors={['#1A1A1A', '#252525']} style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>
              {isSeller ? t('wallet.available') : t('wallet.title')}
            </Text>

            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 12 }} />
            ) : error ? (
              <View style={styles.errorBlock}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
                <Text style={styles.errorText}>{error === 'forbidden' ? t('wallet.seller_access_required') : error}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.balanceAmount}>
                  CHF {(data?.available_chf ?? 0).toFixed(2)}
                </Text>
                {isSeller && (
                  <View style={styles.balanceDetails}>
                    {(data?.stripe_pending_chf ?? 0) > 0 && (
                      <View style={styles.balanceDetail}>
                        <View style={[styles.detailDot, { backgroundColor: '#F59E0B' }]} />
                        <Text style={styles.balanceDetailText}>
                          {t('wallet.in_transit', { amount: (data?.stripe_pending_chf ?? 0).toFixed(2) })}
                        </Text>
                      </View>
                    )}
                    {(data?.escrow_pending_chf ?? 0) > 0 && (
                      <View style={styles.balanceDetail}>
                        <View style={[styles.detailDot, { backgroundColor: '#3B82F6' }]} />
                        <Text style={styles.balanceDetailText}>
                          {t('wallet.awaiting_delivery', { amount: (data?.escrow_pending_chf ?? 0).toFixed(2) })}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {isSeller && !loading && !error && (
              <TouchableOpacity
                style={styles.payoutBtn}
                onPress={() => router.push('/wallet/payout')}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-up-outline" size={16} color="#0F0F0F" />
                <Text style={styles.payoutBtnText}>{t('wallet.withdraw')}</Text>
              </TouchableOpacity>
            )}

            {!isSeller && (
              <TouchableOpacity
                style={styles.payoutBtn}
                onPress={() => router.push('/profile/payment-methods')}
                activeOpacity={0.85}
              >
                <Ionicons name="card-outline" size={16} color="#0F0F0F" />
                <Text style={styles.payoutBtnText}>{t('wallet.manage_payment')}</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>

          {/* Quick actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => router.push('/profile/payment-methods')}
              activeOpacity={0.8}
            >
              <View style={styles.quickIconWrap}>
                <Ionicons name="card-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickLabel}>{t('wallet.my_cards')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => router.push('/profile/orders')}
              activeOpacity={0.8}
            >
              <View style={styles.quickIconWrap}>
                <Ionicons name="bag-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.quickLabel}>{t('wallet.my_orders')}</Text>
            </TouchableOpacity>

            {isSeller && (
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => router.push('/(seller)/sales')}
                activeOpacity={0.8}
              >
                <View style={styles.quickIconWrap}>
                  <Ionicons name="receipt-outline" size={22} color={colors.primary} />
                </View>
                <Text style={styles.quickLabel}>{t('wallet.my_sales')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Badge conformité */}
          <LinearGradient
            colors={['rgba(0,210,184,0.08)', 'rgba(0,210,184,0.03)']}
            style={styles.complianceBadge}
          >
            <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
            <Text style={styles.complianceText}>
              {t('wallet.security_badge')}
            </Text>
          </LinearGradient>

          {/* Transactions */}
          {isSeller && (
            <View style={styles.section}>
              <SectionTitle title={t('wallet.recent_transactions')} />
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 24 }} />
              ) : allTransactions.length === 0 ? (
                <EmptyTransactions t={t} />
              ) : (
                <View style={styles.txList}>
                  {allTransactions.map(entry =>
                    entry.type === 'transfer' ? (
                      <TransactionRow key={entry.item.id} transfer={entry.item as Transfer} t={t} />
                    ) : (
                      <PayoutRow key={entry.item.id} payout={entry.item as Payout} t={t} />
                    )
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  balanceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 20,
  },
  balanceLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  balanceAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 38,
    color: colors.text,
    marginTop: 4,
  },
  balanceDetails: {
    marginTop: 8,
    gap: 4,
  },
  balanceDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  balanceDetailText: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  errorText: {
    fontSize: fontSize.caption,
    color: colors.error,
    fontFamily: fontFamily.medium,
  },
  payoutBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  payoutBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#0F0F0F',
  },

  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,210,184,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.text,
    textAlign: 'center',
  },

  complianceBadge: {
    marginHorizontal: 16,
    marginBottom: spacing.md,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  complianceText: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },

  section: {
    marginHorizontal: 16,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
  },

  txList: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  txInfo: { flex: 1 },
  txLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.text,
  },
  txDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#10B981',
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    alignSelf: 'flex-end',
  },

  emptyTx: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTxText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.text,
  },
  emptyTxSub: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
})
