import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily } from '../../lib/theme'

export default function WalletScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Mon Wallet',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fontFamily.bold },
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Balance card */}
          <LinearGradient
            colors={['#1A1A1A', '#252525']}
            style={styles.balanceCard}
          >
            <Text style={styles.balanceLabel}>Solde disponible</Text>
            <Text style={styles.balanceAmount}>CHF 0.00</Text>
            <Text style={styles.balanceReserved}>Réservé : CHF 0.00</Text>
            <TouchableOpacity style={styles.rechargeBtn}>
              <Text style={styles.rechargeBtnText}>+ Recharger mon wallet</Text>
            </TouchableOpacity>
          </LinearGradient>

          {/* Moyens de paiement */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Moyens de paiement</Text>

            <View style={styles.methodCard}>
              <View style={[styles.methodIcon, { backgroundColor: '#00B14F' }]}>
                <Text style={styles.twintLabel}>TWINT</Text>
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>TWINT</Text>
                <Text style={styles.methodSub}>Non configuré</Text>
              </View>
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            </View>

            <View style={styles.methodCard}>
              <View style={[styles.methodIcon, { backgroundColor: colors.surfaceHigh }]}>
                <Ionicons name="card-outline" size={24} color={colors.textSecondary} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>Carte bancaire</Text>
                <Text style={styles.methodSub}>Non configurée</Text>
              </View>
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            </View>
          </View>

          {/* Badge conformité */}
          <LinearGradient
            colors={['rgba(0,210,184,0.08)', 'rgba(0,210,184,0.03)']}
            style={styles.complianceBadge}
          >
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
            <Text style={styles.complianceText}>
              Paiements sécurisés · Conformité LPD Suisse
            </Text>
          </LinearGradient>

          {/* Transactions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transactions récentes</Text>
            <View style={styles.emptyTx}>
              <Ionicons name="receipt-outline" size={40} color={colors.border} />
              <Text style={styles.emptyTxText}>Aucune transaction</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  balanceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 20,
  },
  balanceLabel: { fontSize: 13, color: colors.textSecondary },
  balanceAmount: { fontFamily: fontFamily.bold, fontSize: 38, color: colors.text, marginTop: 4 },
  balanceReserved: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  rechargeBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rechargeBtnText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.bg },
  section: { marginHorizontal: 16, marginBottom: 8 },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
  },
  methodCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  twintLabel: { fontFamily: fontFamily.bold, fontSize: 11, color: '#FFFFFF' },
  methodInfo: { flex: 1, marginLeft: 12 },
  methodName: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.text },
  methodSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  complianceBadge: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  complianceText: { fontSize: 13, color: colors.textSecondary, marginLeft: 10, flex: 1 },
  emptyTx: { padding: 32, alignItems: 'center' },
  emptyTxText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
})
