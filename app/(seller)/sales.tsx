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
import { getOrCreateConversation } from '../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StorySale {
  id: string
  title: string
  thumbnail_url: string | null
  video_url: string | null
  final_price_chf: number | null
  status: string
  tracking_number: string | null
  shipped_at: string | null
  delivered_at: string | null
  created_at: string
  buyer_id: string | null
  buyer: { id: string; username: string; avatar_url: string | null } | null
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
  storyId,
  title,
  onClose,
  onSuccess,
}: {
  visible: boolean
  storyId: string | null
  title: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [tracking, setTracking] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible) setTracking('')
  }, [visible])

  const handleSubmit = async () => {
    if (!storyId || !tracking.trim()) return
    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('mark-shipped', {
        body: { story_id: storyId, tracking_number: tracking.trim() },
      })
      if (error) {
        Alert.alert('Erreur', 'Impossible de marquer comme expédié')
        setLoading(false)
        return
      }
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
      onSuccess()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={shipStyles.backdrop} onPress={onClose}>
        <Pressable style={shipStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={shipStyles.title}>Marquer comme expédié</Text>
          <Text style={shipStyles.subtitle} numberOfLines={1}>{title}</Text>

          <Text style={shipStyles.label}>Numéro de suivi</Text>
          <TextInput
            value={tracking}
            onChangeText={setTracking}
            style={shipStyles.input}
            placeholder="CH123456789"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
          />

          <View style={shipStyles.row}>
            <TouchableOpacity style={shipStyles.cancelBtn} onPress={onClose}>
              <Text style={shipStyles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[shipStyles.submitBtn, (!tracking.trim() || loading) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={!tracking.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0F0F0F" />
              ) : (
                <Text style={shipStyles.submitText}>Confirmer</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const shipStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  submitText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
})

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    sold:      { label: "À expédier",   color: '#FFA755', bg: 'rgba(255,167,85,0.12)' },
    shipped:   { label: 'Expédié',      color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
    delivered: { label: 'Livré',        color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  }
  const c = cfg[status] ?? cfg.sold
  return (
    <View style={[salesStyles.badge, { backgroundColor: c.bg }]}>
      <Text style={[salesStyles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SalesScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [sales, setSales] = useState<StorySale[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [shipModal, setShipModal] = useState<{ id: string; title: string } | null>(null)
  const { show, ToastView } = useToast()

  const fetchSales = useCallback(async () => {
    if (!currentUserId) return
    const { data, error } = await supabase
      .from('stories')
      .select('id, title, thumbnail_url, video_url, final_price_chf, status, tracking_number, shipped_at, delivered_at, created_at, buyer_id, buyer:profiles!buyer_id(id, username, avatar_url)')
      .eq('seller_id', currentUserId)
      .in('status', ['sold', 'shipped', 'delivered'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[fetchSales] failed:', error)
      return
    }
    setSales((data ?? []) as unknown as StorySale[])
  }, [currentUserId])

  useEffect(() => {
    setLoading(true)
    fetchSales().finally(() => setLoading(false))
  }, [fetchSales])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchSales()
    setRefreshing(false)
  }, [fetchSales])

  const handleMessage = useCallback(
    async (buyerId: string | null) => {
      if (!buyerId || !currentUserId) return
      try {
        const convId = await getOrCreateConversation(supabase, buyerId, currentUserId)
        router.push(`/conversation/${convId}`)
      } catch {
        show("Impossible d'ouvrir la conversation")
      }
    },
    [currentUserId, show],
  )

  return (
    <SafeAreaView style={salesStyles.safe} edges={['top']}>
      <View style={salesStyles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={salesStyles.headerTitle}>Mes ventes</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={salesStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={sales.length === 0 ? salesStyles.emptyContainer : salesStyles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={salesStyles.emptyState}>
              <Ionicons name="bag-outline" size={52} color={colors.textSecondary} />
              <Text style={salesStyles.emptyText}>Aucune vente</Text>
              <Text style={salesStyles.emptySubtext}>Vos drops vendus apparaîtront ici.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const buyerInitial = (item.buyer?.username ?? 'A').charAt(0).toUpperCase()
            return (
              <View style={salesStyles.card}>
                <View style={salesStyles.cardRow}>
                  <View style={salesStyles.thumb}>
                    {item.thumbnail_url ? (
                      <Image source={{ uri: item.thumbnail_url }} style={salesStyles.thumbImg} />
                    ) : (
                      <View style={salesStyles.thumbPlaceholder}>
                        <Ionicons name="play-circle-outline" size={24} color={colors.primary} />
                      </View>
                    )}
                  </View>
                  <View style={salesStyles.body}>
                    <Text style={salesStyles.title} numberOfLines={2}>{item.title}</Text>

                    <TouchableOpacity
                      style={salesStyles.buyerRow}
                      onPress={() => handleMessage(item.buyer_id)}
                      activeOpacity={0.7}
                    >
                      {item.buyer?.avatar_url ? (
                        <Image source={{ uri: item.buyer.avatar_url }} style={salesStyles.buyerAvatar} />
                      ) : (
                        <View style={salesStyles.buyerAvatarFallback}>
                          <Text style={salesStyles.buyerAvatarText}>{buyerInitial}</Text>
                        </View>
                      )}
                      <Text style={salesStyles.buyerName}>
                        @{item.buyer?.username ?? 'acheteur'}
                      </Text>
                      <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <View style={salesStyles.bottomRow}>
                      <StatusBadge status={item.status} />
                      <Text style={salesStyles.price}>
                        CHF {Number(item.final_price_chf ?? 0).toFixed(2)}
                      </Text>
                    </View>

                    {item.status === 'sold' && (
                      <TouchableOpacity
                        style={salesStyles.shipBtn}
                        onPress={() => setShipModal({ id: item.id, title: item.title })}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="send-outline" size={15} color="#0F0F0F" />
                        <Text style={salesStyles.shipBtnText}>Marquer comme expédié</Text>
                      </TouchableOpacity>
                    )}

                    {item.status === 'shipped' && item.tracking_number && (
                      <View style={salesStyles.trackingRow}>
                        <Ionicons name="barcode-outline" size={13} color={colors.textSecondary} />
                        <Text style={salesStyles.trackingText} numberOfLines={1}>
                          {item.tracking_number}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <ShipModal
        visible={!!shipModal}
        storyId={shipModal?.id ?? null}
        title={shipModal?.title ?? ''}
        onClose={() => setShipModal(null)}
        onSuccess={() => {
          show('Colis marqué comme expédié')
          fetchSales()
        }}
      />

      {ToastView}
    </SafeAreaView>
  )
}

const salesStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: spacing.md },
  emptyContainer: { flexGrow: 1, padding: spacing.md },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbImg: { width: 72, height: 72 },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { flex: 1, gap: 6 },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buyerAvatar: { width: 18, height: 18, borderRadius: 9 },
  buyerAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyerAvatarText: { fontSize: 9, color: colors.textSecondary, fontFamily: fontFamily.bold },
  buyerName: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },
  shipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 6,
  },
  shipBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  trackingText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
    flex: 1,
  },
})
