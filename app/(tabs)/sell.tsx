import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

export default function SellScreen() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const isSeller = profile?.role === 'seller'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.heading}>Que voulez-vous publier ?</Text>

        {isSeller ? (
          <View style={styles.cards}>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push('/(seller)/story/create')}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="play-circle-outline" size={48} color={colors.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Story Enchère</Text>
                <Text style={styles.cardSubtitle}>Prix dégressif · Vidéo · 24h à 7 jours</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push('/listing/create')}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="pricetag-outline" size={48} color={colors.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Article Prix Fixe</Text>
                <Text style={styles.cardSubtitle}>Photos · Prix fixe · Stock illimité</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push('/(seller)/listings')}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="list-outline" size={48} color={colors.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Mes annonces</Text>
                <Text style={styles.cardSubtitle}>Gérer vos stories et articles</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.notSellerBox}>
            <Ionicons name="storefront-outline" size={52} color={colors.border} />
            <Text style={styles.notSellerText}>Devenez vendeur pour publier</Text>
            <TouchableOpacity
              style={styles.becomeBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/become-seller')}
            >
              <Text style={styles.becomeBtnText}>Commencer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  cards: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  cardIcon: {
    width: 52,
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  notSellerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 80,
  },
  notSellerText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  becomeBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 13,
    marginTop: 4,
  },
  becomeBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: '#0F0F0F',
  },
})
