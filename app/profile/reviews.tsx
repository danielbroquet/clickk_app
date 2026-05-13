import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { toCdnUrl } from '../../lib/cdn'
import { useTranslation } from '../../lib/i18n'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  buyer: {
    username: string | null
    avatar_url: string | null
  } | null
}

function StarRow({ rating }: { rating: number }) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={14}
          color="#FFC107"
        />
      ))}
    </View>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ReviewCard({ review }: { review: Review }) {
  const { t } = useTranslation()
  const avatarUri = toCdnUrl(review.buyer?.avatar_url ?? null)
  const initial = (review.buyer?.username ?? '?').charAt(0).toUpperCase()

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.buyerName}>
            {review.buyer?.username ?? '—'}
          </Text>
          <StarRow rating={review.rating} />
        </View>
        <Text style={styles.date}>{formatDate(review.created_at)}</Text>
      </View>
      {review.comment ? (
        <Text style={styles.comment}>{review.comment}</Text>
      ) : (
        <Text style={styles.noComment}>{t('reviews_screen.no_comment')}</Text>
      )}
    </View>
  )
}

export default function ReviewsScreen() {
  const { sellerId, sellerUsername } = useLocalSearchParams<{
    sellerId: string
    sellerUsername: string
  }>()
  const { t } = useTranslation()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sellerId) return
    supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        buyer:profiles!buyer_id(username, avatar_url)
      `)
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setReviews((data as unknown as Review[]) ?? [])
        setLoading(false)
      })
  }, [sellerId])

  const avg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('reviews_screen.title', { username: sellerUsername ?? '' })}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 60 }}
        />
      ) : (
        <FlatList<Review>
          data={reviews}
          keyExtractor={r => r.id}
          renderItem={({ item }) => <ReviewCard review={item} />}
          contentContainerStyle={
            reviews.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListHeaderComponent={
            reviews.length > 0 ? (
              <View style={styles.summary}>
                <Text style={styles.summaryAvg}>{avg.toFixed(1)}</Text>
                <Ionicons name="star" size={28} color="#FFC107" />
                <Text style={styles.summaryDot}>·</Text>
                <Text style={styles.summaryCount}>
                  {t('reviews_screen.total', { count: reviews.length })}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <Ionicons name="star-outline" size={52} color={colors.border} />
              <Text style={styles.emptyTitle}>{t('reviews_screen.empty')}</Text>
              <Text style={styles.emptySub}>{t('reviews_screen.empty_sub')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.body,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryAvg: {
    fontSize: 32,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  summaryDot: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  summaryCount: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  avatarWrap: {
    width: 36,
    height: 36,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  cardMeta: {
    flex: 1,
    gap: 3,
  },
  buyerName: {
    fontSize: fontSize.label,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  starRow: {
    flexDirection: 'row',
    gap: 2,
  },
  date: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  comment: {
    fontSize: fontSize.label,
    color: colors.text,
    fontFamily: fontFamily.regular,
    lineHeight: 20,
  },
  noComment: {
    fontSize: fontSize.label,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
  },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.headline,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: fontSize.label,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
})
