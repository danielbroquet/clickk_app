import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  Pressable,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleOrder {
  id: string
  created_at: string
  total_chf: number
  commission_chf: number
  seller_amount_chf: number
  status: string
  delivery_status: string
  tracking_number: string | null
  delivered_at: string | null
  listing_id: string
  listing: { title: string; images: string[] } | null
  buyer: { username: string; avatar_url: string | null } | null
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(msg)
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      timer.current = setTimeout(() => setMessage(null), 50)
    })
  }, [opacity])

  const ToastView = message ? (
    <Animated.View style={[toastStyles.toast, { opacity }]}>
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  ) : null

  return { show, ToastView }
}

const toastStyles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
  },
})

// ─── Ship Modal ───────────────────────────────────────────────────────────────

function ShipModal({
  visible,
  orderId,
  listingTitle,
  currentUserId,
  onClose,
  onSuccess,
}: {
  visible: boolean
  orderId: string
  listingTitle: string
  currentUserId: string
  onClose: () => void
  onSuccess: (trackingNumber: string | null) => void
}) {
  const [trackingInput, setTrackingInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (loading) return
    setTrackingInput('')
    setError(null)
    onClose()
  }

  const handleConfirm = async () => {
    setError(null)
    setLoading(true)
    const trimmed = trackingInput.trim() || null

    const { error: updateErr } = await supabase
      .from('shop_orders')
      .update({
        delivery_status: 'shipped',
        tracking_number: trimmed,
      })
      .eq('id', orderId)
      .eq('seller_id', currentUserId)

    if (updateErr) {
      setError(updateErr.message ?? 'Une erreur est survenue')
      setLoading(false)
      return
    }

    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }

    setTrackingInput('')
    setError(null)
    setLoading(false)
    onSuccess(trimmed)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={modalStyles.overlay} onPress={handleClose}>
        <Pressable style={modalStyles.sheet} onPress={e => e.stopPropagation()}>
          <Text style={modalStyles.title}>Confirmer l'expédition</Text>
          {listingTitle ? (
            <Text style={modalStyles.subtitle} numberOfLines={1}>{listingTitle}</Text>
          ) : null}

          <Text style={modalStyles.helper}>
            Pensez à utiliser la Post-App pour générer votre étiquette avant de confirmer.
          </Text>

          <Text style={modalStyles.inputLabel}>Numéro de suivi (optionnel)</Text>
          <TextInput
            style={modalStyles.input}
            value={trackingInput}
            onChangeText={setTrackingInput}
            placeholder="99.00.123456.78901234"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            maxLength={30}
            editable={!loading}
          />

          {error ? <Text style={modalStyles.errorText}>{error}</Text> : null}

          <View style={modalStyles.btnRow}>
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={handleClose}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={modalStyles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.confirmBtn, loading && modalStyles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0F0F0F" />
              ) : (
                <Text style={modalStyles.confirmBtnText}>Confirmer</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 36,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  inputLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.label,
    color: colors.text,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.text,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.error,
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: colors.primary,
    minHeight: 48,
    justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
})

// ─── Sale Card ────────────────────────────────────────────────────────────────

function SaleCard({
  order,
  currentUserId,
  onShipped,
}: {
  order: SaleOrder
  currentUserId: string
  onShipped: (id: string, trackingNumber: string | null) => void
}) {
  const [modalVisible, setModalVisible] = useState(false)
  const thumb = order.listing?.images?.[0] ?? null

  const handleShipSuccess = (trackingNumber: string | null) => {
    setModalVisible(false)
    onShipped(order.id, trackingNumber)
  }

  // ── Status badge ──
  let badgeStyle = styles.badgeGray
  let badgeTextColor = colors.textSecondary
  let badgeLabel = 'En attente'

  if (order.delivery_status === 'shipped') {
    badgeStyle = styles.badgeBlue
    badgeTextColor = '#3B82F6'
    badgeLabel = 'Expédié'
  } else if (order.delivery_status === 'delivered') {
    badgeStyle = styles.badgeGreen
    badgeTextColor = colors.success
    badgeLabel = 'Livré'
  } else {
    badgeStyle = styles.badgeAmber
    badgeTextColor = colors.warning
    badgeLabel = "En attente d'expédition"
  }

  const formattedDate = (() => {
    const d = new Date(order.created_at)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
  })()

  return (
    <>
      <View style={styles.card}>
        {/* Top row: thumbnail + info */}
        <View style={styles.cardRow}>
          <View style={styles.thumb}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumbImg} resizeMode="cover" />
            ) : (
              <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
                <Ionicons name="image-outline" size={22} color={colors.border} />
              </View>
            )}
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {order.listing?.title ?? 'Article supprimé'}
              </Text>
            </View>

            {/* Buyer row */}
            <View style={styles.buyerRow}>
              {order.buyer?.avatar_url ? (
                <Image source={{ uri: order.buyer.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={10} color={colors.textSecondary} />
                </View>
              )}
              <Text style={styles.buyerName} numberOfLines={1}>
                {order.buyer?.username ?? '—'}
              </Text>
              <Text style={styles.dateText}>{formattedDate}</Text>
            </View>
          </View>
        </View>

        {/* Amounts */}
        <View style={styles.amountsRow}>
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>Total payé</Text>
            <Text style={styles.amountValue}>CHF {Number(order.total_chf).toFixed(2)}</Text>
          </View>
          <View style={styles.amountDivider} />
          <View style={styles.amountBlock}>
            <Text style={styles.amountLabel}>Vos gains</Text>
            <Text style={[styles.amountValue, styles.earningsValue]}>
              CHF {Number(order.seller_amount_chf).toFixed(2)}
            </Text>
          </View>
          <View style={styles.badgeWrapper}>
            <View style={[styles.badge, badgeStyle]}>
              <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeLabel}</Text>
            </View>
          </View>
        </View>

        {/* delivery_status: pending → ship button */}
        {order.delivery_status === 'pending' && (
          <TouchableOpacity
            style={styles.shipBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="send-outline" size={15} color="#0F0F0F" />
            <Text style={styles.shipBtnText}>Marquer comme expédié</Text>
          </TouchableOpacity>
        )}

        {/* delivery_status: shipped → tracking info */}
        {order.delivery_status === 'shipped' && (
          <View style={styles.shippedInfo}>
            {order.tracking_number ? (
              <View style={styles.trackingRow}>
                <Ionicons name="barcode-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.trackingText} numberOfLines={1}>
                  {order.tracking_number}
                </Text>
              </View>
            ) : null}
            <Text style={styles.awaitingText}>
              En attente de confirmation acheteur
            </Text>
          </View>
        )}

        {/* delivery_status: delivered */}
        {order.delivery_status === 'delivered' && (
          <View style={styles.shippedInfo}>
            <Text style={styles.deliveredText}>Livré — paiement viré</Text>
            {order.delivered_at ? (
              <Text style={styles.metaText}>
                {new Date(order.delivered_at).toLocaleDateString('fr-CH', {
                  day: '2-digit', month: '2-digit', year: '2-digit',
                })}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <ShipModal
        visible={modalVisible}
        orderId={order.id}
        listingTitle={order.listing?.title ?? ''}
        currentUserId={currentUserId}
        onClose={() => setModalVisible(false)}
        onSuccess={handleShipSuccess}
      />
    </>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SellerSalesScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const { show: showToast, ToastView } = useToast()

  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrders = useCallback(async () => {
    if (!currentUserId) return

    const { data, error } = await supabase
      .from('shop_orders')
      .select(`
        id,
        created_at,
        total_chf,
        commission_chf,
        seller_amount_chf,
        status,
        delivery_status,
        tracking_number,
        delivered_at,
        listing_id,
        listing:shop_listings!listing_id(title, images),
        buyer:profiles!buyer_id(username, avatar_url)
      `)
      .eq('seller_id', currentUserId)
      .order('created_at', { ascending: false })

    if (error) {
      Alert.alert('Erreur', error.message)
      return
    }

    setOrders((data ?? []) as unknown as SaleOrder[])
  }, [currentUserId])

  useEffect(() => {
    setLoading(true)
    fetchOrders().finally(() => setLoading(false))
  }, [fetchOrders])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }, [fetchOrders])

  const handleShipped = useCallback((id: string, trackingNumber: string | null) => {
    setOrders(prev =>
      prev.map(o =>
        o.id === id
          ? { ...o, delivery_status: 'shipped', tracking_number: trackingNumber }
          : o
      )
    )
    showToast('Expédition confirmée')
  }, [showToast])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes ventes</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <SaleCard
              order={item}
              currentUserId={currentUserId}
              onShipped={handleShipped}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={44} color={colors.border} />
              <Text style={styles.emptyText}>Aucune vente pour le moment</Text>
            </View>
          }
        />
      )}

      {ToastView}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.text,
  },

  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImg: { width: 72, height: 72 },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyerName: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  dateText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },

  amountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  amountBlock: {
    gap: 2,
  },
  amountLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  amountValue: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: colors.text,
  },
  earningsValue: {
    color: colors.primary,
  },
  amountDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  badgeWrapper: {
    flex: 1,
    alignItems: 'flex-end',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeAmber:  { backgroundColor: 'rgba(245,158,11,0.12)' },
  badgeBlue:   { backgroundColor: 'rgba(59,130,246,0.12)' },
  badgeGreen:  { backgroundColor: 'rgba(16,185,129,0.12)' },
  badgeGray:   { backgroundColor: colors.surfaceHigh },
  badgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },

  shipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 12,
    marginTop: spacing.xs,
  },
  shipBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },

  shippedInfo: {
    gap: 4,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackingText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
    flex: 1,
  },
  awaitingText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  deliveredText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.success,
  },
  metaText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },

  emptyState: {
    paddingTop: 80,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
})
