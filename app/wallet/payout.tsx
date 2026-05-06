import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, spacing, fontSize } from '../../lib/theme'
import { useAuth } from '../../lib/auth'
import { callEdgeFunction } from '../../lib/edgeFunction'
import { useTranslation } from '../../lib/i18n'

interface WalletData {
  available_chf: number
}

export default function PayoutScreen() {
  const { t } = useTranslation()
  const { session } = useAuth()

  const [available, setAvailable] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  const [amount, setAmount] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fetchBalance = useCallback(async () => {
    if (!session) return
    setBalanceError(null)
    try {
      const res = await callEdgeFunction<WalletData>('get-seller-wallet')
      setAvailable(res.available_chf)
      setAmount(res.available_chf.toFixed(2))
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }, [session])

  useEffect(() => {
    fetchBalance().finally(() => setLoadingBalance(false))
  }, [fetchBalance])

  const handleConfirm = async () => {
    setValidationError(null)
    setSubmitError(null)

    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      setValidationError('Veuillez saisir un montant valide supérieur à 0.')
      return
    }
    if (available !== null && parsed > available) {
      setValidationError(`Le montant dépasse votre solde disponible (CHF ${available.toFixed(2)}).`)
      return
    }

    setSubmitting(true)
    try {
      await callEdgeFunction('create-payout', { amount_chf: parsed })
      setSuccess(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('wallet.withdraw'),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fontFamily.bold },
        }}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {success ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
              </View>
              <Text style={styles.successTitle}>{t('wallet.withdraw_success')}</Text>
              <Text style={styles.successSub}>
                Arrivée sous 2-3 jours ouvrés sur votre compte bancaire.
              </Text>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.back()}
                activeOpacity={0.85}
              >
                <Text style={styles.backBtnText}>Retour au wallet</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Info banner */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} style={styles.infoIcon} />
                <Text style={styles.infoText}>{t('wallet.withdraw_info')}</Text>
              </View>

              {/* Balance display */}
              <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>{t('wallet.available')}</Text>
                {loadingBalance ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
                ) : balanceError ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{balanceError}</Text>
                  </View>
                ) : (
                  <Text style={styles.balanceAmount}>
                    CHF {(available ?? 0).toFixed(2)}
                  </Text>
                )}
              </View>

              {/* Amount input */}
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>{t('wallet.withdraw_amount')}</Text>
                <View style={[styles.inputWrap, validationError ? styles.inputWrapError : null]}>
                  <Text style={styles.currencyPrefix}>CHF</Text>
                  <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={text => {
                      setAmount(text)
                      setValidationError(null)
                    }}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                  />
                  {available !== null && (
                    <TouchableOpacity
                      onPress={() => {
                        setAmount(available.toFixed(2))
                        setValidationError(null)
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.maxLabel}>MAX</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {validationError && (
                  <Text style={styles.validationError}>{validationError}</Text>
                )}
              </View>

              {/* Submit error */}
              {submitError && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{submitError}</Text>
                </View>
              )}

              {/* Confirm button */}
              <TouchableOpacity
                style={[styles.confirmBtn, (submitting || loadingBalance) && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                activeOpacity={0.85}
                disabled={submitting || loadingBalance}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#0F0F0F" />
                ) : (
                  <>
                    <Ionicons name="arrow-up-outline" size={18} color="#0F0F0F" />
                    <Text style={styles.confirmBtnText}>{t('wallet.withdraw')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.md,
    flexGrow: 1,
  },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.2)',
    borderRadius: 12,
    padding: 14,
    marginBottom: spacing.md,
  },
  infoIcon: { marginRight: 10, marginTop: 1 },
  infoText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  balanceLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  balanceAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    color: colors.text,
    marginTop: 4,
  },

  inputSection: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.text,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  inputWrapError: {
    borderColor: colors.error,
  },
  currencyPrefix: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.textSecondary,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
  },
  maxLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  validationError: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.error,
    marginTop: 6,
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.error,
    flex: 1,
  },

  confirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#0F0F0F',
  },

  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    gap: spacing.md,
  },
  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,210,184,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text,
  },
  successSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#0F0F0F',
  },
})
