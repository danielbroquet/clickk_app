import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ChevronLeft, CreditCard, Trash2, Plus } from 'lucide-react-native'
import { colors, fontFamily, spacing } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'
import { usePaymentMethods, type PaymentMethod } from '../../lib/payment'
const useStripe: () => {
  initPaymentSheet: (params: any) => Promise<{ error?: { message: string } }>
  presentPaymentSheet: () => Promise<{ error?: { code: string; message: string } }>
} = Platform.OS !== 'web'
  ? require('@stripe/stripe-react-native').useStripe
  : () => ({
      initPaymentSheet: async () => ({}),
      presentPaymentSheet: async () => ({}),
    })

function CardRow({
  method,
  onRemove,
  removing,
}: {
  method: PaymentMethod
  onRemove: () => void
  removing: boolean
}) {
  const expStr = `${String(method.expMonth).padStart(2, '0')}/${String(method.expYear).slice(-2)}`
  const brandLabel = method.brand.charAt(0).toUpperCase() + method.brand.slice(1)

  return (
    <View style={styles.cardRow}>
      <View style={styles.cardIcon}>
        <CreditCard size={20} color={colors.primary} strokeWidth={1.8} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardBrand}>{brandLabel} •••• {method.last4}</Text>
        <Text style={styles.cardExpiry}>Expire {expStr}</Text>
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={onRemove}
        disabled={removing}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {removing ? (
          <ActivityIndicator size="small" color={colors.error} />
        ) : (
          <Trash2 size={18} color={colors.error} strokeWidth={1.8} />
        )}
      </TouchableOpacity>
    </View>
  )
}

export default function PaymentMethodsScreen() {
  const { t } = useTranslation()
  const {
    paymentMethods,
    loading,
    error,
    initializeCustomer,
    createSetupIntent,
    removeMethod,
    refreshMethods,
  } = usePaymentMethods()

  const { initPaymentSheet, presentPaymentSheet } = useStripe()

  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleAddMethod = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Disponible avec EAS Build',
        "L'ajout de carte sera disponible dans la version native de l'application."
      )
      return
    }

    setAdding(true)
    try {
      await initializeCustomer()
      const { client_secret, customer_id } = await createSetupIntent()

      const { error: initError } = await initPaymentSheet({
        customerId: customer_id,
        setupIntentClientSecret: client_secret,
        merchantDisplayName: 'Clickk',
        returnURL: 'clickk://stripe-return',
      })

      if (initError) {
        Alert.alert('Erreur', initError.message)
        return
      }

      const { error: presentError } = await presentPaymentSheet()

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Erreur', presentError.message)
        }
        return
      }

      await refreshMethods()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue'
      Alert.alert('Erreur', message)
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (methodId: string) => {
    Alert.alert(
      'Supprimer la carte',
      'Voulez-vous supprimer ce moyen de paiement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(methodId)
            try {
              await removeMethod(methodId)
              await refreshMethods()
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Erreur'
              Alert.alert('Erreur', message)
            } finally {
              setRemovingId(null)
            }
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('payment_methods.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : paymentMethods.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <CreditCard size={40} color={colors.textSecondary} strokeWidth={1.4} />
            </View>
            <Text style={styles.emptyTitle}>{t('payment_methods.no_method')}</Text>
            <Text style={styles.emptySubtitle}>
              Ajoutez une carte pour payer en un clic lors de vos prochains achats.
            </Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            <Text style={styles.sectionLabel}>Cartes enregistrées</Text>
            {paymentMethods.map((method: PaymentMethod) => (
              <CardRow
                key={method.id}
                method={method}
                onRemove={() => handleRemove(method.id)}
                removing={removingId === method.id}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.addBtn, adding && styles.addBtnDisabled]}
          onPress={handleAddMethod}
          disabled={adding}
          activeOpacity={0.85}
        >
          {adding ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Plus size={18} color="#000" strokeWidth={2.5} />
              <Text style={styles.addBtnText}>{t('payment_methods.add')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  headerRight: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, flexGrow: 1 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 64 },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: spacing.lg,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  cardList: { gap: spacing.sm },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { flex: 1 },
  cardBrand: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  cardExpiry: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  footer: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  addBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#000',
  },
})
