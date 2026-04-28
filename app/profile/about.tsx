import React from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, spacing, fontSize } from '../../lib/theme'

const APP_VERSION = '1.0.0'

const LEGAL_ITEMS = [
  {
    title: "Conditions générales d'utilisation",
    icon: 'document-text-outline' as const,
    url: 'https://clickk.app/cgu',
  },
  {
    title: 'Politique de confidentialité',
    icon: 'shield-outline' as const,
    url: 'https://clickk.app/privacy',
  },
  {
    title: 'Mentions légales',
    icon: 'information-circle-outline' as const,
    url: 'https://clickk.app/legal',
  },
  {
    title: 'Conformité LPD Suisse',
    icon: 'lock-closed-outline' as const,
    url: 'https://clickk.app/lpd',
  },
]

const SOCIAL_ITEMS = [
  { title: 'Instagram', icon: 'logo-instagram' as const, url: 'https://instagram.com/clickkapp' },
  { title: 'TikTok', icon: 'logo-tiktok' as const, url: 'https://tiktok.com/@clickkapp' },
]

function LinkRow({
  title,
  icon,
  onPress,
}: {
  title: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.rowLabel}>{title}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.border} />
    </TouchableOpacity>
  )
}

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>À propos</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Logo + version */}
        <View style={styles.hero}>
          <Image
            source={require('../../assets/images/clickk_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Clickk</Text>
          <Text style={styles.version}>Version {APP_VERSION}</Text>
          <Text style={styles.tagline}>
            La marketplace suisse des enchères hollandaises vidéo
          </Text>
        </View>

        {/* Mission */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notre mission</Text>
          <Text style={styles.cardText}>
            Clickk connecte acheteurs et vendeurs suisses via des enchères hollandaises en format
            vidéo court. Le prix baisse en temps réel — le premier à cliquer achète.
          </Text>
        </View>

        {/* Legal */}
        <Text style={styles.sectionLabel}>Légal</Text>
        <View style={styles.section}>
          {LEGAL_ITEMS.map((item, i) => (
            <React.Fragment key={item.title}>
              <LinkRow
                title={item.title}
                icon={item.icon}
                onPress={() => Linking.openURL(item.url)}
              />
              {i < LEGAL_ITEMS.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>

        {/* Social */}
        <Text style={styles.sectionLabel}>Nous suivre</Text>
        <View style={styles.section}>
          {SOCIAL_ITEMS.map((item, i) => (
            <React.Fragment key={item.title}>
              <LinkRow
                title={item.title}
                icon={item.icon}
                onPress={() => Linking.openURL(item.url)}
              />
              {i < SOCIAL_ITEMS.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>

        {/* Contact */}
        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.section}>
          <LinkRow
            title="Nous contacter"
            icon="mail-outline"
            onPress={() => Linking.openURL('mailto:support@clickk.app')}
          />
        </View>

        <Text style={styles.footer}>
          © {new Date().getFullYear()} Clickk SA — Suisse{'\n'}
          Tous droits réservés
        </Text>
      </ScrollView>
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
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },

  content: { paddingBottom: 48 },

  hero: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: spacing.lg,
  },
  logo: { width: 80, height: 80, borderRadius: 18 },
  appName: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: colors.text,
    marginTop: 12,
  },
  version: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  tagline: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.text,
  },
  cardText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,210,184,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 32 + spacing.sm,
  },

  footer: {
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
})
