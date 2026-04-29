import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily } from '../../lib/theme'

type RowProps = {
  icon: string
  label: string
  onPress: () => void
  destructive?: boolean
  value?: string
  showChevron?: boolean
}

function SettingsRow({ icon, label, onPress, destructive, value, showChevron = true }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon as any}
          size={20}
          color={destructive ? colors.error : colors.textSecondary}
        />
        <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {showChevron && (
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>
}

function Divider() {
  return <View style={styles.divider} />
}

export default function SettingsScreen() {
  const appVersion = Constants.expoConfig?.version ?? '—'

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Êtes-vous sûr ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await supabase.rpc('delete_user')
            await supabase.auth.signOut()
            router.replace('/(auth)/login')
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* COMPTE */}
        <SectionHeader title="COMPTE" />
        <View style={styles.section}>
          <SettingsRow
            icon="person-outline"
            label="Modifier mon profil"
            onPress={() => router.push('/profile/about')}
          />
          <Divider />
          <SettingsRow
            icon="card-outline"
            label="Moyens de paiement"
            onPress={() => router.push('/profile/payment-methods')}
          />
          <Divider />
          <SettingsRow
            icon="wallet-outline"
            label="Mon Wallet"
            onPress={() => router.push('/wallet')}
          />
        </View>

        {/* INFORMATIONS */}
        <SectionHeader title="INFORMATIONS" />
        <View style={styles.section}>
          <SettingsRow
            icon="document-text-outline"
            label="Conditions d'utilisation"
            onPress={() => Linking.openURL('https://clickk.app/cgu')}
          />
          <Divider />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Politique de confidentialité"
            onPress={() => Linking.openURL('https://clickk.app/privacy')}
          />
          <Divider />
          <SettingsRow
            icon="information-circle-outline"
            label="Version"
            value={appVersion}
            onPress={() => {}}
            showChevron={false}
          />
        </View>

        {/* DANGER ZONE */}
        <SectionHeader title="DANGER ZONE" />
        <View style={styles.section}>
          <SettingsRow
            icon="log-out-outline"
            label="Se déconnecter"
            onPress={handleSignOut}
            destructive
          />
          <Divider />
          <SettingsRow
            icon="trash-outline"
            label="Supprimer mon compte"
            onPress={handleDeleteAccount}
            destructive
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.text,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 48,
  },
  sectionHeader: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text,
  },
  rowLabelDestructive: {
    color: colors.error,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
})
