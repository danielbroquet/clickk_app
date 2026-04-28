import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Animated,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, fontFamily, spacing } from '../lib/theme'

const { width } = Dimensions.get('window')

export const ONBOARDING_KEY = 'clickk_onboarding_done'

interface Slide {
  id: string
  icon: string
  title: string
  subtitle: string
  gradient: [string, string]
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: '📸',
    title: 'Stories vidéo en live',
    subtitle:
      'Découvre des produits présentés en vidéo courte. Le vendeur montre, tu décides en quelques secondes.',
    gradient: ['#0F2027', '#203A43'],
  },
  {
    id: '2',
    icon: '⏱️',
    title: 'Enchère hollandaise',
    subtitle:
      'Le prix baisse toutes les X secondes. Achète au bon moment — pas trop tôt, pas trop tard.',
    gradient: ['#0F2027', '#16313B'],
  },
  {
    id: '3',
    icon: '🇨🇭',
    title: '100% Suisse',
    subtitle:
      'Paiements sécurisés via Stripe, conformité LPD, livraison Post CH. Une marketplace pensée pour la Suisse.',
    gradient: ['#0F2027', '#1A2A1A'],
  },
  {
    id: '4',
    icon: '🛍️',
    title: 'Achète ou vends',
    subtitle:
      'Parcours les stories en cours ou publie tes propres articles — en quelques secondes, depuis ton téléphone.',
    gradient: ['#0F1623', '#1A2535'],
  },
]

function Dot({ active }: { active: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        active ? styles.dotActive : styles.dotInactive,
      ]}
    />
  )
}

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const flatListRef = useRef<FlatList<Slide>>(null)
  const fadeAnim = useRef(new Animated.Value(1)).current

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true })
    } else {
      handleDone()
    }
  }

  const handleDone = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true')
    router.replace('/(auth)/login')
  }

  const handleScroll = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width)
    if (index !== currentIndex) setCurrentIndex(index)
  }

  const isLast = currentIndex === SLIDES.length - 1

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <LinearGradient colors={item.gradient} style={styles.slide}>
            <Text style={styles.slideIcon}>{item.icon}</Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </LinearGradient>
        )}
      />

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Dot key={i} active={i === currentIndex} />
          ))}
        </View>

        {/* CTA */}
        <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>
          <TouchableOpacity
            style={[styles.btn, isLast && styles.btnPrimary]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, isLast && styles.btnTextPrimary]}>
              {isLast ? "C'est parti !" : 'Suivant'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Skip */}
        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={handleDone}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F2027' },

  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 20,
  },
  slideIcon: { fontSize: 64 },
  slideTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 34,
  },
  slideSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 24,
  },

  controls: {
    backgroundColor: colors.bg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: colors.border,
  },

  btn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  btnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  btnTextPrimary: {
    color: '#0F0F0F',
  },

  skipBtn: { paddingVertical: 8 },
  skipText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
})
