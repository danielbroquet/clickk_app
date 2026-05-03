import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily } from '../../lib/theme'
import i18n from '../../lib/i18n'
import { useFollow } from '../../hooks/useFollow'
import { callEdgeFunction } from '../../lib/edgeFunction'

const SCREEN_WIDTH = Dimensions.get('window').width
const CELL_SIZE = (SCREEN_WIDTH - 2) / 2

type DropCell = {
  id: string
  thumbnail_url: string | null
  video_url: string | null
  current_price_chf: number
  status: string
  buyer_id?: string | null
  updated_at?: string | null
}

// ── Grid cell ────────────────────────────────────────────────────────────────

function AddCell() {
  return (
    <TouchableOpacity
      style={[gridStyles.cell, gridStyles.addCell]}
      activeOpacity={0.85}
      onPress={() => router.push('/story/create')}
    >
      <Ionicons name="add" size={44} color="#0F0F0F" />
      <Text style={gridStyles.addCellLabel}>Nouveau drop</Text>
    </TouchableOpacity>
  )
}

function DropGridCell({
  drop,
  variant,
  editMode,
  onLongPress,
  onDelete,
}: {
  drop: DropCell
  variant: 'own' | 'purchase'
  editMode: boolean
  onLongPress: () => void
  onDelete: (id: string) => void
}) {
  const thumb = drop.thumbnail_url ?? drop.video_url
  const status = drop.status
  const rotation = useSharedValue(0)
  const canDelete = variant === 'own' && status !== 'sold' && status !== 'shipped'

  useEffect(() => {
    if (editMode && canDelete) {
      rotation.value = withRepeat(
        withSequence(
          withTiming(2, { duration: 100 }),
          withTiming(-2, { duration: 100 }),
        ),
        -1,
        true,
      )
    } else {
      cancelAnimation(rotation)
      rotation.value = withTiming(0, { duration: 80 })
    }
  }, [editMode])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  const handlePress = () => {
    if (editMode) return
    router.push({ pathname: '/(tabs)', params: { initialStoryId: drop.id } })
  }

  const handleDeletePress = () => {
    if (status === 'sold' || status === 'shipped') {
      Alert.alert('Impossible — ce drop a déjà été vendu.')
      return
    }
    Alert.alert(
      'Supprimer ce drop ?',
      undefined,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(drop.id) },
      ],
    )
  }

  return (
    <Reanimated.View style={[gridStyles.cellWrapper, animStyle]}>
      <View style={gridStyles.cell}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={editMode ? 1 : 0.85}
          onPress={handlePress}
          onLongPress={onLongPress}
          delayLongPress={500}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={gridStyles.thumb} resizeMode="cover" />
          ) : (
            <View style={[gridStyles.thumb, gridStyles.placeholder]}>
              <Ionicons name="videocam-outline" size={28} color={colors.border} />
            </View>
          )}

          {/* Price badge */}
          <View style={gridStyles.priceBadge}>
            <Text style={gridStyles.priceBadgeText}>CHF {Number(drop.current_price_chf).toFixed(0)}</Text>
          </View>

          {/* Status badge */}
          {variant === 'own' && status === 'sold' && (
            <View style={[gridStyles.statusBadge, gridStyles.statusSold]}>
              <Text style={gridStyles.statusSoldText}>Vendu ✓</Text>
            </View>
          )}
          {variant === 'own' && status === 'expired' && (
            <View style={[gridStyles.statusBadge, gridStyles.statusExpired]}>
              <Text style={gridStyles.statusExpiredText}>Expiré</Text>
            </View>
          )}
          {variant === 'purchase' && (
            <View style={[gridStyles.statusBadge, gridStyles.statusSold]}>
              <Text style={gridStyles.statusSoldText}>
                {status === 'delivered' ? 'Livré' : status === 'shipped' ? 'Expédié' : 'En cours'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Delete button outside the clipped cell so it's fully visible */}
      {editMode && canDelete && (
        <TouchableOpacity
          style={gridStyles.deleteBtn}
          onPress={handleDeletePress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={gridStyles.deleteBtnText}>×</Text>
        </TouchableOpacity>
      )}
    </Reanimated.View>
  )
}

const gridStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    paddingHorizontal: 0,
  },
  cellWrapper: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  addCell: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  addCellLabel: {
    color: '#0F0F0F',
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
  thumb: { width: '100%', height: '100%' },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  priceBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  priceBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },
  statusBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  statusSold: { backgroundColor: 'rgba(0,210,184,0.2)' },
  statusSoldText: {
    color: colors.primary,
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  statusExpired: { backgroundColor: 'rgba(255,255,255,0.1)' },
  statusExpiredText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
  },
  deleteBtn: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: -1,
  },
})

// ── Edit profile sheet (unchanged) ───────────────────────────────────────────

function EditProfileSheet({
  visible,
  onClose,
  onSaved,
  userId,
  initialDisplayName,
  initialBio,
  initialUsername,
  initialAvatarUrl,
}: {
  visible: boolean
  onClose: () => void
  onSaved: () => void
  userId: string
  initialDisplayName: string
  initialBio: string
  initialUsername: string
  initialAvatarUrl: string | null
}) {
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(400)).current
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [bio, setBio] = useState(initialBio)
  const [username, setUsername] = useState(initialUsername)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initial = (initialDisplayName || initialUsername || 'U').charAt(0).toUpperCase()

  useEffect(() => {
    if (visible) {
      setDisplayName(initialDisplayName)
      setBio(initialBio)
      setUsername(initialUsername)
      setAvatarUrl(initialAvatarUrl)
      setError(null)
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
    } else {
      Animated.timing(slideAnim, { toValue: 400, duration: 220, useNativeDriver: true }).start()
    }
  }, [visible])

  const handlePickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (!asset.base64) {
      setError('Impossible de lire l\'image.')
      return
    }
    setAvatarUploading(true)
    setError(null)
    try {
      const path = `${userId}/avatar.jpg`
      const byteArray = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0))
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, byteArray, { upsert: true, contentType: 'image/jpeg' })
      if (uploadErr) {
        setError(uploadErr.message)
        return
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`)
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { error: dbErr } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        bio: bio.trim(),
        username: username.trim(),
        avatar_url: avatarUrl,
      })
      .eq('id', userId)
    setSaving(false)
    if (dbErr) {
      setError(dbErr.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={sheetStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[
            sheetStyles.sheet,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.sheetHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={sheetStyles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <Text style={sheetStyles.sheetTitle}>Modifier le profil</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving || avatarUploading}>
              <Text style={[sheetStyles.saveText, (saving || avatarUploading) && sheetStyles.savingText]}>
                {saving ? '...' : 'Enregistrer'}
              </Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={sheetStyles.errorText}>{error}</Text>}

          <View style={sheetStyles.avatarSection}>
            <TouchableOpacity
              style={sheetStyles.avatarCircle}
              onPress={handlePickAvatar}
              disabled={avatarUploading}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={sheetStyles.avatarImg} />
              ) : (
                <Text style={sheetStyles.avatarInitial}>{initial}</Text>
              )}
              {avatarUploading && (
                <View style={sheetStyles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              {!avatarUploading && (
                <View style={sheetStyles.cameraIcon}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            <Text style={sheetStyles.avatarHint}>Modifier la photo</Text>
          </View>

          <View style={sheetStyles.fieldGroup}>
            <Text style={sheetStyles.fieldLabel}>Nom affiché</Text>
            <TextInput
              style={sheetStyles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Nom affiché"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
            />
          </View>

          <View style={sheetStyles.fieldGroup}>
            <Text style={sheetStyles.fieldLabel}>Nom d'utilisateur</Text>
            <TextInput
              style={sheetStyles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          <View style={sheetStyles.fieldGroup}>
            <View style={sheetStyles.bioLabelRow}>
              <Text style={sheetStyles.fieldLabel}>Bio</Text>
              <Text style={sheetStyles.charCount}>{bio.length}/150</Text>
            </View>
            <TextInput
              style={[sheetStyles.input, sheetStyles.bioInput]}
              value={bio}
              onChangeText={t => setBio(t.slice(0, 150))}
              placeholder="Parlez-nous de vous…"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={150}
              returnKeyType="done"
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.text },
  cancelText: { fontSize: 15, color: colors.textSecondary },
  saveText: { fontSize: 15, fontFamily: fontFamily.semiBold, color: colors.primary },
  savingText: { opacity: 0.5 },
  errorText: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  bioLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  charCount: { fontSize: 12, color: colors.textSecondary },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  bioInput: { height: 90, textAlignVertical: 'top' },
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 80, height: 80 },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.primary },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarHint: { fontSize: 12, color: colors.primary, marginTop: 6 },
})

// ── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'drops' | 'achats'

export default function ProfileScreen() {
  const { profile, session, refreshProfile } = useAuth()
  const [dropsCount, setDropsCount] = useState<number | null>(null)
  const [ventesCount, setVentesCount] = useState<number | null>(null)
  const [ownDrops, setOwnDrops] = useState<DropCell[]>([])
  const [purchases, setPurchases] = useState<DropCell[]>([])
  const [editVisible, setEditVisible] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('drops')
  const [bioExpanded, setBioExpanded] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const currentUserId = session?.user?.id ?? ''

  useEffect(() => {
    if (!currentUserId) return

    supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', currentUserId)
      .then(({ count }) => setDropsCount(count ?? 0))

    supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', currentUserId)
      .eq('status', 'sold')
      .then(({ count }) => setVentesCount(count ?? 0))

    supabase
      .from('stories')
      .select('id, thumbnail_url, video_url, current_price_chf, status')
      .eq('seller_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setOwnDrops((data ?? []) as DropCell[]))

    supabase
      .from('stories')
      .select('id, thumbnail_url, video_url, current_price_chf, status, buyer_id, updated_at')
      .eq('buyer_id', currentUserId)
      .order('updated_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setPurchases((data ?? []) as DropCell[]))

    if (profile?.role === 'seller') {
      callEdgeFunction<{ available_chf: number }>('get-seller-wallet')
        .then(data => setWalletBalance(data.available_chf ?? 0))
        .catch(() => setWalletBalance(null))
    }
  }, [currentUserId, profile?.role])

  const { followersCount, loading: followLoading } = useFollow(currentUserId)

  const handleEnterEditMode = () => {
    if (editMode) return
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    setEditMode(true)
  }

  const handleDeleteDrop = async (dropId: string) => {
    // Optimistic remove
    setOwnDrops(prev => prev.filter(d => d.id !== dropId))
    await supabase
      .from('stories')
      .update({ status: 'expired' })
      .eq('id', dropId)
      .eq('seller_id', currentUserId)
  }

  const displayName = profile?.display_name ?? profile?.username ?? 'Utilisateur'
  const username = profile?.username ?? 'username'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.topHeader}>
          <Text style={styles.topHeaderUsername} numberOfLines={1}>@{username}</Text>
          {editMode ? (
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => setEditMode(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.terminerText}>Terminer</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/profile/settings')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Profile info ────────────────────────────────────────────────── */}
        <View style={styles.profileInfo}>
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>{initial}</Text>
            )}
          </View>

          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.username}>@{username}</Text>

          {!!profile?.bio && (
            <TouchableOpacity activeOpacity={0.8} onPress={() => setBioExpanded(b => !b)}>
              <Text style={styles.bio} numberOfLines={bioExpanded ? undefined : 3}>
                {profile.bio}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{dropsCount === null ? '--' : dropsCount}</Text>
              <Text style={styles.statLabel}>Drops</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>
                {followLoading ? '--' : followersCount}
              </Text>
              <Text style={styles.statLabel}>Abonnés</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{ventesCount === null ? '--' : ventesCount}</Text>
              <Text style={styles.statLabel}>Ventes</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.editBtnText}>{i18n.t('profile.edit')}</Text>
          </TouchableOpacity>

          {profile?.role !== 'seller' && (
            <TouchableOpacity
              style={styles.becomeSellerBtn}
              onPress={() => router.push('/become-seller')}
              activeOpacity={0.85}
            >
              <Text style={styles.becomeSellerText}>{i18n.t('profile.become_seller')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Wallet banner (seller only) ─────────────────────────────────── */}
        {profile?.role === 'seller' && (
          <TouchableOpacity
            style={styles.walletCard}
            onPress={() => router.push('/wallet')}
            activeOpacity={0.85}
          >
            <View style={styles.walletLeft}>
              <Ionicons name="wallet-outline" size={22} color={colors.primary} />
              <Text style={styles.walletLabel}>Mon wallet</Text>
            </View>
            <View style={styles.walletRight}>
              <Text style={styles.walletAmount}>
                {walletBalance === null ? '--' : `CHF ${walletBalance.toFixed(2)}`}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Quick links ─────────────────────────────────────────────────── */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/profile/orders')}
            activeOpacity={0.85}
          >
            <Ionicons name="cube-outline" size={20} color={colors.primary} />
            <Text style={styles.quickLabel}>Mes commandes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/profile/payment-methods')}
            activeOpacity={0.85}
          >
            <Ionicons name="card-outline" size={20} color={colors.primary} />
            <Text style={styles.quickLabel}>Paiement</Text>
          </TouchableOpacity>

          {profile?.role === 'seller' && (
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => router.push('/(seller)/sales')}
              activeOpacity={0.85}
            >
              <Ionicons name="receipt-outline" size={20} color={colors.primary} />
              <Text style={styles.quickLabel}>Ventes</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'drops' && styles.tabItemActive]}
            onPress={() => setActiveTab('drops')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="grid-outline"
              size={20}
              color={activeTab === 'drops' ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === 'drops' && styles.tabLabelActive]}>
              Drops
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'achats' && styles.tabItemActive]}
            onPress={() => setActiveTab('achats')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="bag-outline"
              size={20}
              color={activeTab === 'achats' ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === 'achats' && styles.tabLabelActive]}>
              Achats
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Grid content ────────────────────────────────────────────────── */}
        {activeTab === 'drops' ? (
          ownDrops.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="videocam-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>Publie ton premier drop</Text>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => router.push('/story/create')}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyCtaText}>Créer un drop</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={gridStyles.grid}>
              <AddCell />
              {ownDrops.map(drop => (
                <DropGridCell
                  key={drop.id}
                  drop={drop}
                  variant="own"
                  editMode={editMode}
                  onLongPress={handleEnterEditMode}
                  onDelete={handleDeleteDrop}
                />
              ))}
            </View>
          )
        ) : purchases.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bag-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Aucun achat pour l'instant</Text>
          </View>
        ) : (
          <View style={gridStyles.grid}>
            {purchases.map(drop => (
              <DropGridCell
                key={drop.id}
                drop={drop}
                variant="purchase"
                editMode={false}
                onLongPress={() => {}}
                onDelete={() => {}}
              />
            ))}
          </View>
        )}

        {/* Edit profile sheet */}
        <EditProfileSheet
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          onSaved={refreshProfile}
          userId={currentUserId}
          initialDisplayName={profile?.display_name ?? ''}
          initialBio={profile?.bio ?? ''}
          initialUsername={profile?.username ?? ''}
          initialAvatarUrl={profile?.avatar_url ?? null}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  topHeaderUsername: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  settingsBtn: {
    position: 'absolute',
    right: 16,
    top: 10,
    padding: 4,
  },
  terminerText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.primary,
  },

  // Profile info
  profileInfo: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarImg: { width: 80, height: 80 },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.primary },
  displayName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    lineHeight: 22,
  },
  username: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bio: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginTop: 18,
    marginBottom: 18,
  },
  stat: { alignItems: 'center' },
  statNum: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Buttons
  editBtn: {
    alignSelf: 'stretch',
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  becomeSellerBtn: {
    alignSelf: 'stretch',
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  becomeSellerText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#0F0F0F',
  },

  // Wallet
  walletCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  walletRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.primary,
  },

  // Quick links
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  quickLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: colors.primary },
  tabLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  tabLabelActive: { color: colors.primary, fontFamily: fontFamily.semiBold },

  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: { fontSize: 14, color: colors.textSecondary },
  emptyCta: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyCtaText: {
    color: '#0F0F0F',
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
})
