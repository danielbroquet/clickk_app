import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Linking,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { toCdnUrl } from '../../lib/cdn'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

type TrackingEvent = {
  timestamp: string
  description: string
  location?: string
}

type TrackingStatus = {
  status: 'in_transit' | 'delivered' | 'exception' | 'unknown'
  label: string
  lastEvent?: TrackingEvent
  estimatedDelivery?: string
}

type DisplayStatus = 'paid' | 'sold' | 'shipped' | 'delivered' | 'refunded' | 'disputed'

interface SellerInfo {
  username: string
  avatar_url: string | null
}

interface OrderItem {
  id: string
  story_id: string
  seller_id: string
  title: string
  thumbnail: string | null
  hasVideo: boolean
  seller: SellerInfo | null
  price: number
  displayStatus: DisplayStatus
  shipped_at: string | null
  delivered_at: string | null
  tracking_number: string | null
  created_at: string
  myRating: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function relativeTime(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return "À l'instant"
  if (mins  < 60) return `Il y a ${mins} min`
  if (hours < 24) return `Il y a ${hours} h`
  if (days  < 30) return `Il y a ${days} j`
  return new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DisplayStatus, { label: string; color: string; bg: string }> = {
  sold:      { label: "En attente d'expédition", color: '#FFA755', bg: 'rgba(255,167,85,0.12)'   },
  paid:      { label: "En attente d'expédition", color: '#FFA755', bg: 'rgba(255,167,85,0.12)'   },
  shipped:   { label: 'Expédié',                 color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'   },
  delivered: { label: 'Reçu',                    color: '#10B981', bg: 'rgba(16,185,129,0.12)'   },
  refunded:  { label: 'Remboursé',               color: '#EF4444', bg: 'rgba(239,68,68,0.12)'    },
  disputed:  { label: 'Litige en cours',         color: '#FFA502', bg: 'rgba(255,165,2,0.12)'    },
}

const DISPUTE_REASONS: { key: string; label: string }[] = [
  { key: 'not_received',    label: "Je n'ai pas reçu le colis" },
  { key: 'not_as_described', label: "L'article ne correspond pas à la description" },
  { key: 'damaged',         label: "L'article est endommagé" },
  { key: 'counterfeit',     label: 'Article contrefait' },
  { key: 'other',           label: 'Autre problème' },
]

async function fetchSwissPostTracking(trackingNumber: string): Promise<TrackingStatus> {
  try {
    const res = await fetch(
      `https://www.post.ch/api/trackingv2?formattedParcelCodes=${encodeURIComponent(trackingNumber)}&lang=fr`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (!res.ok) return { status: 'unknown', label: 'Statut indisponible' }
    const json = await res.json()

    const shipment = json?.[0]
    if (!shipment) return { status: 'unknown', label: 'Statut indisponible' }

    const events = shipment.events ?? []
    const lastEvent = events[0]

    const statusCode = (shipment.status ?? '').toLowerCase()
    let status: TrackingStatus['status'] = 'unknown'
    let label = 'En transit'

    if (statusCode.includes('delivr') || statusCode.includes('remis')) {
      status = 'delivered'
      label = 'Livré'
    } else if (statusCode.includes('transit') || statusCode.includes('cours')) {
      status = 'in_transit'
      label = 'En transit'
    } else if (statusCode.includes('exception') || statusCode.includes('echec')) {
      status = 'exception'
      label = 'Problème de livraison'
    } else if (lastEvent) {
      status = 'in_transit'
      label = lastEvent.description ?? 'En transit'
    }

    return {
      status,
      label,
      lastEvent: lastEvent ? {
        timestamp: lastEvent.timestamp,
        description: lastEvent.description ?? '',
        location: lastEvent.location,
      } : undefined,
      estimatedDelivery: shipment.estimatedDeliveryDate,
    }
  } catch {
    return { status: 'unknown', label: 'Statut indisponible' }
  }
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.paid
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  item,
  onDelivered,
  onOpenDispute,
  onOpenReview,
}: {
  item: OrderItem
  onDelivered: (id: string) => void
  onOpenDispute: (storyId: string, title: string) => void
  onOpenReview: (storyId: string, sellerId: string, sellerUsername: string, title: string) => void
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const sellerInitial = (item.seller?.username ?? 'V').charAt(0).toUpperCase()
  const titleInitial  = item.title.charAt(0).toUpperCase()
  const [tracking, setTracking] = useState<TrackingStatus | null>(null)
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [trackingExpanded, setTrackingExpanded] = useState(false)

  const handleTrackingPress = useCallback(async () => {
    if (!item.tracking_number) return
    if (trackingExpanded) {
      setTrackingExpanded(false)
      return
    }
    setTrackingExpanded(true)
    if (!tracking) {
      setTrackingLoading(true)
      const result = await fetchSwissPostTracking(item.tracking_number)
      setTracking(result)
      setTrackingLoading(false)
    }
  }, [item.tracking_number, tracking, trackingExpanded])

  const handleConfirmDelivery = async () => {
    setAwaitingConfirm(false)
    setConfirming(true)
    try {
      const { data, error } = await supabase.functions.invoke('confirm-delivery', {
        body: { story_id: item.story_id },
      })

      if (error) {
        setConfirming(false)
        return
      }

      if (!data?.success && !data?.already_delivered) {
        setConfirming(false)
        return
      }

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
      onDelivered(item.id)
    } catch {
      setConfirming(false)
    }
  }

  const handleTrackParcel = () => {
    if (!item.tracking_number) return
    Linking.openURL(
      'https://service.post.ch/EasyTrack/submitParcelData.do?formattedParcelCodes=' +
        encodeURIComponent(item.tracking_number),
    )
  }

  return (
    <View style={styles.card}>
      {/* Top row: thumbnail + body */}
      <View style={styles.cardRow}>
        <View style={styles.thumb}>
          {item.thumbnail ? (
            <Image source={{ uri: toCdnUrl(item.thumbnail) ?? '' }} style={styles.thumbImg} resizeMode="cover" />
          ) : item.hasVideo ? (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="play-circle-outline" size={28} color={colors.primary} />
            </View>
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Text style={styles.thumbInitial}>{titleInitial}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

          <View style={styles.sellerRow}>
            {item.seller?.avatar_url ? (
              <Image source={{ uri: item.seller.avatar_url }} style={styles.sellerAvatar} />
            ) : (
              <View style={styles.sellerAvatarFallback}>
                <Text style={styles.sellerAvatarText}>{sellerInitial}</Text>
              </View>
            )}
            <Text style={styles.sellerName}>@{item.seller?.username ?? 'vendeur'}</Text>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.badgeGroup}>
              <StatusBadge status={item.displayStatus} />
              {item.displayStatus === 'shipped' && item.shipped_at && (
                <Text style={styles.statusDate}>{formatDate(item.shipped_at)}</Text>
              )}
              {item.displayStatus === 'delivered' && item.delivered_at && (
                <Text style={styles.statusDate}>{formatDate(item.delivered_at)}</Text>
              )}
            </View>
            <Text style={styles.price}>CHF {item.price.toFixed(2)}</Text>
          </View>

          <Text style={styles.date}>{relativeTime(item.created_at)}</Text>
        </View>
      </View>

      {/* sold: helper text */}
      {(item.displayStatus === 'sold' || item.displayStatus === 'paid') && (
        <View style={styles.helperRow}>
          <Ionicons name="time-outline" size={13} color="#FFA755" />
          <Text style={styles.helperText}>{t('orders.preparing')}</Text>
        </View>
      )}

      {/* shipped: tracking + CTA */}
      {item.displayStatus === 'shipped' && (
        <View style={styles.shippedSection}>
          {item.tracking_number ? (
            <View style={styles.trackingRow}>
              <Ionicons name="barcode-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.trackingText} numberOfLines={1}>
                Numéro de suivi: {item.tracking_number}
              </Text>
            </View>
          ) : null}

          {item.tracking_number && (
            <View>
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={handleTrackingPress}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                <Text style={styles.trackBtnText}>
                  {trackingExpanded ? 'Masquer le suivi' : 'Suivre le colis'}
                </Text>
                {trackingLoading && (
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />
                )}
                <Ionicons
                  name={trackingExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.textSecondary}
                  style={{ marginLeft: 'auto' }}
                />
              </TouchableOpacity>

              {trackingExpanded && !trackingLoading && tracking && (
                <View style={styles.trackingPanel}>
                  <View style={styles.trackingStatusRow}>
                    <View style={[
                      styles.trackingDot,
                      { backgroundColor:
                          tracking.status === 'delivered' ? '#10B981' :
                          tracking.status === 'in_transit' ? '#3B82F6' :
                          tracking.status === 'exception' ? '#EF4444' : '#A0A0A0'
                      }
                    ]} />
                    <Text style={styles.trackingStatusLabel}>{tracking.label}</Text>
                  </View>

                  {tracking.lastEvent && (
                    <View style={styles.trackingEventRow}>
                      <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <Text style={styles.trackingEventDesc}>
                          {tracking.lastEvent.description}
                        </Text>
                        {tracking.lastEvent.location && (
                          <Text style={styles.trackingEventMeta}>
                            📍 {tracking.lastEvent.location}
                          </Text>
                        )}
                        <Text style={styles.trackingEventMeta}>
                          {new Date(tracking.lastEvent.timestamp).toLocaleString('fr-CH')}
                        </Text>
                      </View>
                    </View>
                  )}

                  {tracking.estimatedDelivery && (
                    <View style={styles.trackingDeliveryRow}>
                      <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                      <Text style={styles.trackingEventMeta}>
                        {' '}Livraison estimée : {new Date(tracking.estimatedDelivery).toLocaleDateString('fr-CH')}
                      </Text>
                    </View>
                  )}

                  {!tracking.lastEvent && tracking.status === 'unknown' && (
                    <Text style={styles.trackingEventMeta}>
                      Aucune information disponible pour ce numéro de suivi.
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {awaitingConfirm ? (
            <View style={styles.confirmBlock}>
              <View style={styles.confirmWarning}>
                <Ionicons name="warning-outline" size={16} color="#FFA502" />
                <Text style={styles.confirmWarningText}>
                  En confirmant, l'argent est immédiatement envoyé au vendeur.
                  Aucun retour ou remboursement ne sera possible ensuite.
                  Si quelque chose ne va pas, annule et utilise "Signaler un problème".
                </Text>
              </View>
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setAwaitingConfirm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmDestructiveBtn, confirming && styles.receivedBtnDisabled]}
                  onPress={handleConfirmDelivery}
                  disabled={confirming}
                  activeOpacity={0.8}
                >
                  {confirming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmDestructiveText}>Je confirme</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.receivedBtn, confirming && styles.receivedBtnDisabled]}
              onPress={() => setAwaitingConfirm(true)}
              disabled={confirming}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color="#0F0F0F" />
              <Text style={styles.receivedBtnText}>{t('orders.received')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Dispute trigger — only available before the buyer confirms delivery.
          Once confirmed, funds are released to the seller and the order is final. */}
      {(item.displayStatus === 'sold' ||
        item.displayStatus === 'paid' ||
        item.displayStatus === 'shipped') && (
        <TouchableOpacity
          style={styles.disputeLink}
          onPress={() => onOpenDispute(item.story_id, item.title)}
          activeOpacity={0.7}
        >
          <Ionicons name="alert-circle-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.disputeLinkText}>Signaler un problème</Text>
        </TouchableOpacity>
      )}

      {item.displayStatus === 'disputed' && (
        <View style={styles.disputeNotice}>
          <Ionicons name="shield-checkmark-outline" size={13} color="#FFA502" />
          <Text style={styles.disputeNoticeText}>
            Notre équipe examine ton dossier. Réponse sous 48 h.
          </Text>
        </View>
      )}

      {item.displayStatus === 'delivered' && (
        item.myRating ? (
          <View style={styles.reviewedRow}>
            <Ionicons name="star" size={13} color="#FFD700" />
            <Text style={styles.reviewedText}>
              Tu as donné {item.myRating}/5 au vendeur
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.reviewCta}
            onPress={() =>
              onOpenReview(
                item.story_id,
                item.seller_id,
                item.seller?.username ?? 'vendeur',
                item.title,
              )
            }
            activeOpacity={0.85}
          >
            <Ionicons name="star-outline" size={15} color="#0F0F0F" />
            <Text style={styles.reviewCtaText}>Noter le vendeur</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  )
}

// ─── Dispute modal ────────────────────────────────────────────────────────────

function DisputeModal({
  visible,
  storyId,
  title,
  onClose,
  onSubmitted,
}: {
  visible: boolean
  storyId: string | null
  title: string
  onClose: () => void
  onSubmitted: (storyId: string) => void
}) {
  const [reason, setReason] = useState<string>('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      setReason('')
      setDescription('')
      setError(null)
      setSubmitting(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    if (!storyId || !reason) {
      setError('Sélectionne un motif')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const { error: insErr } = await supabase.from('disputes').insert({
        story_id: storyId,
        opened_by: user.id,
        reason,
        description: description.trim() || null,
        status: 'open',
      })
      if (insErr) throw insErr

      onSubmitted(storyId)
    } catch (e: any) {
      setError(e.message ?? 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalSheet}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Signaler un problème</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle} numberOfLines={2}>{title}</Text>

          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.modalLabel}>Motif</Text>
            {DISPUTE_REASONS.map((r) => {
              const active = reason === r.key
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.reasonRow, active && styles.reasonRowActive]}
                  onPress={() => setReason(r.key)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.reasonRadio, active && styles.reasonRadioActive]}>
                    {active && <View style={styles.reasonRadioInner} />}
                  </View>
                  <Text style={styles.reasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              )
            })}

            <Text style={[styles.modalLabel, { marginTop: 16 }]}>Détails (optionnel)</Text>
            <TextInput
              style={styles.modalTextarea}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              maxLength={500}
              placeholder="Explique ce qui s'est passé..."
              placeholderTextColor={colors.textSecondary}
            />

            {error && <Text style={styles.modalError}>{error}</Text>}
          </ScrollView>

          <TouchableOpacity
            style={[styles.modalSubmit, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalSubmitText}>Envoyer le signalement</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Review modal ─────────────────────────────────────────────────────────────

function ReviewModal({
  visible,
  storyId,
  sellerId,
  sellerUsername,
  title,
  onClose,
  onSubmitted,
}: {
  visible: boolean
  storyId: string | null
  sellerId: string | null
  sellerUsername: string
  title: string
  onClose: () => void
  onSubmitted: (storyId: string, rating: number) => void
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      setRating(0)
      setComment('')
      setError(null)
      setSubmitting(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    if (!storyId || !sellerId) return
    if (rating < 1) {
      setError('Choisis une note entre 1 et 5')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const { error: insErr } = await supabase.from('reviews').insert({
        story_id: storyId,
        buyer_id: user.id,
        seller_id: sellerId,
        rating,
        comment: comment.trim() || null,
      })
      if (insErr) throw insErr

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
      onSubmitted(storyId, rating)
    } catch (e: any) {
      setError(e.message ?? 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalSheet}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Noter @{sellerUsername}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle} numberOfLines={2}>{title}</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => {
                  setRating(n)
                  if (Platform.OS !== 'web') Haptics.selectionAsync()
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Ionicons
                  name={n <= rating ? 'star' : 'star-outline'}
                  size={40}
                  color={n <= rating ? '#FFD700' : colors.textSecondary}
                />
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingHint}>
              {rating === 5 ? 'Parfait' : rating === 4 ? 'Très bien' : rating === 3 ? 'Correct' : rating === 2 ? 'Décevant' : 'Mauvais'}
            </Text>
          )}

          <Text style={[styles.modalLabel, { marginTop: 16 }]}>Commentaire (optionnel)</Text>
          <TextInput
            style={styles.modalTextarea}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={4}
            maxLength={500}
            placeholder="Partage ton expérience..."
            placeholderTextColor={colors.textSecondary}
          />

          {error && <Text style={styles.modalError}>{error}</Text>}

          <TouchableOpacity
            style={[styles.reviewSubmitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={styles.reviewSubmitText}>Publier l'avis</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [orders, setOrders]         = useState<OrderItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrders = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return

    const storiesRes = await supabase
      .from('stories')
      .select('id, seller_id, created_at, final_price_chf, status, title, video_url, thumbnail_url, shipped_at, delivered_at, tracking_number, seller:profiles!seller_id(username, avatar_url)')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })

    if (storiesRes.error) {
      console.error('[fetchOrders] stories query failed:', storiesRes.error)
    }

    const storyIds = (storiesRes.data ?? []).map((s: any) => s.id)
    const reviewsRes = storyIds.length > 0
      ? await supabase
          .from('reviews')
          .select('story_id, rating')
          .eq('buyer_id', userId)
          .in('story_id', storyIds)
      : { data: [] as { story_id: string; rating: number }[] }
    const myRatings = new Map<string, number>()
    ;(reviewsRes.data ?? []).forEach((r: any) => myRatings.set(r.story_id, r.rating))

    const storyOrders: OrderItem[] = (storiesRes.data ?? []).map((s: any) => ({
      id:             `story-${s.id}`,
      story_id:       s.id,
      seller_id:      s.seller_id,
      title:          s.title ?? 'Drop',
      thumbnail:      s.thumbnail_url ?? null,
      hasVideo:       !s.thumbnail_url && !!s.video_url,
      seller:         s.seller as SellerInfo | null,
      price:          s.final_price_chf ?? 0,
      displayStatus:  (s.status as DisplayStatus) ?? 'sold',
      shipped_at:     s.shipped_at ?? null,
      delivered_at:   s.delivered_at ?? null,
      tracking_number: s.tracking_number ?? null,
      created_at:     s.created_at,
      myRating:       myRatings.get(s.id) ?? null,
    }))

    setOrders(storyOrders)
  }, [session?.user?.id])

  useEffect(() => {
    setLoading(true)
    fetchOrders().finally(() => setLoading(false))
  }, [fetchOrders])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }, [fetchOrders])

  // Optimistic: mark a story order as delivered locally
  const handleDelivered = useCallback((orderId: string) => {
    setOrders(prev =>
      prev.map(o =>
        o.id === orderId
          ? { ...o, displayStatus: 'delivered', delivered_at: new Date().toISOString() }
          : o,
      ),
    )
  }, [])

  const [dispute, setDispute] = useState<{ storyId: string; title: string } | null>(null)

  const handleOpenDispute = useCallback((storyId: string, title: string) => {
    setDispute({ storyId, title })
  }, [])

  const handleDisputeSubmitted = useCallback((storyId: string) => {
    setDispute(null)
    setOrders(prev =>
      prev.map(o =>
        o.story_id === storyId ? { ...o, displayStatus: 'disputed' } : o,
      ),
    )
  }, [])

  const [review, setReview] = useState<{
    storyId: string
    sellerId: string
    sellerUsername: string
    title: string
  } | null>(null)

  const handleOpenReview = useCallback(
    (storyId: string, sellerId: string, sellerUsername: string, title: string) => {
      setReview({ storyId, sellerId, sellerUsername, title })
    },
    [],
  )

  const handleReviewSubmitted = useCallback((storyId: string, rating: number) => {
    setReview(null)
    setOrders(prev =>
      prev.map(o => (o.story_id === storyId ? { ...o, myRating: rating } : o)),
    )
  }, [])

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
        <Text style={styles.headerTitle}>{t('orders.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="bag-outline" size={52} color={colors.textSecondary} />
              <Text style={styles.emptyText}>{t('orders.empty')}</Text>
              <Text style={styles.emptySubtext}>{t('orders.empty_sub')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <OrderCard
              item={item}
              onDelivered={handleDelivered}
              onOpenDispute={handleOpenDispute}
              onOpenReview={handleOpenReview}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <DisputeModal
        visible={!!dispute}
        storyId={dispute?.storyId ?? null}
        title={dispute?.title ?? ''}
        onClose={() => setDispute(null)}
        onSubmitted={handleDisputeSubmitted}
      />

      <ReviewModal
        visible={!!review}
        storyId={review?.storyId ?? null}
        sellerId={review?.sellerId ?? null}
        sellerUsername={review?.sellerUsername ?? ''}
        title={review?.title ?? ''}
        onClose={() => setReview(null)}
        onSubmitted={handleReviewSubmitted}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  listContent:    { padding: spacing.md },
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
    textAlign: 'center',
  },

  separator: { height: spacing.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
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
    flexShrink: 0,
  },
  thumbImg: { width: 72, height: 72 },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.textSecondary,
  },

  cardBody: { flex: 1, gap: 6 },

  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },

  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerAvatar: { width: 18, height: 18, borderRadius: 9 },
  sellerAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarText: { fontSize: 9, color: colors.textSecondary, fontFamily: fontFamily.bold },
  sellerName: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
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
  statusDate: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },

  price: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },

  date: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },

  // sold/paid helper
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  helperText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: '#FFA755',
    fontStyle: 'italic',
  },

  // shipped section
  shippedSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trackingText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.text,
    flex: 1,
  },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.10)',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  trackBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.primary,
  },
  receivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 13,
    minHeight: 46,
  },
  receivedBtnDisabled: {
    opacity: 0.6,
  },
  receivedBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#0F0F0F',
  },
  confirmBlock: {
    gap: spacing.sm,
  },
  confirmWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,165,2,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,165,2,0.30)',
    borderRadius: 10,
    padding: 10,
  },
  confirmWarningText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#FFA502',
    lineHeight: 17,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.textSecondary,
  },
  confirmDestructiveBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    minHeight: 46,
  },
  confirmDestructiveText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    color: '#fff',
  },

  disputeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  disputeLinkText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  disputeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,165,2,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,165,2,0.20)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  disputeNoticeText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#FFA502',
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
  },
  modalSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  modalLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
  },
  reasonRowActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0,210,184,0.06)',
  },
  reasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reasonRadioActive: {
    borderColor: colors.primary,
  },
  reasonRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.primary,
  },
  reasonLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  modalTextarea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    fontFamily: fontFamily.regular,
  },
  modalError: {
    color: colors.error,
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  modalSubmit: {
    backgroundColor: '#FFA502',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  modalSubmitText: {
    color: '#fff',
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },

  reviewCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 4,
  },
  reviewCtaText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#0F0F0F',
  },
  reviewedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
  },
  reviewedText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 12,
  },
  ratingHint: {
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  reviewSubmitBtn: {
    backgroundColor: '#FFD700',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  reviewSubmitText: {
    color: '#0F0F0F',
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },

  trackingPanel: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trackingStatusLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.text,
  },
  trackingEventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trackingEventDesc: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.text,
  },
  trackingEventMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  trackingDeliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
})
