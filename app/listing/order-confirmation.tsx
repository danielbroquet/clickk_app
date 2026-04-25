import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

export default function OrderConfirmationScreen() {
  const { title, price } = useLocalSearchParams<{
    sessionId: string
    title: string
    price: string
  }>()

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        </View>

        <Text style={styles.heading}>Commande confirmée !</Text>
        <Text style={styles.subheading}>
          Merci pour votre achat. Le vendeur va préparer votre article.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Article</Text>
            <Text style={styles.rowValue} numberOfLines={2}>{title ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Montant payé</Text>
            <Text style={styles.rowValueAccent}>CHF {price ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Livraison estimée</Text>
            <Text style={styles.rowValue}>3 – 5 jours ouvrables</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Le paiement est conservé en sécurité jusqu'à ce que vous confirmiez la réception de votre article.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Retour à l'accueil</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace('/(tabs)/messages')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>Contacter le vendeur</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(16,185,129,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  subheading: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  rowValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.text,
    textAlign: 'right',
    flex: 1,
  },
  rowValueAccent: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(0,210,184,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.2)',
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.xl,
  },
  infoText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: '#0F0F0F',
  },
  secondaryBtn: {
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
})
