import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily } from '../../lib/theme'
import { useFollow } from '../../hooks/useFollow'
import { callEdgeFunction } from '../../lib/edgeFunction'

const CELL_SIZE = Math.floor(Dimensions.get('window').width / 3)

type StoryCell = {
  id: string
  video_url: string | null
  current_price_chf: number
  status: string
}

function GridCell({ story }: { story: StoryCell }) {
  const sold = story.status === 'sold'
  return (
    <TouchableOpacity
      style={gridStyles.cell}
      activeOpacity={0.8}
      onPress={() => router.push(`/story/${story.id}`)}
    >
      {story.video_url ? (
        <Image source={{ uri: story.video_url }} style={gridStyles.thumb} resizeMode="cover" />
      ) : (
        <View style={[gridStyles.thumb, gridStyles.placeholder]} />
      )}
      {sold && (
        <View style={gridStyles.soldOverlay}>
          <Text style={gridStyles.soldLabel}>Vendu</Text>
        </View>
      )}
      <View style={gridStyles.priceBadge}>
        <Text style={gridStyles.priceText}>CHF {story.current_price_chf.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  )
}

const gridStyles = StyleSheet.create({
  cell: { width: CELL_SIZE, height: CELL_SIZE },
  thumb: { width: CELL_SIZE, height: CELL_SIZE },
  placeholder: { backgroundColor: '#2A2A2A' },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  soldLabel: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 13 },
  priceBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  priceText: { color: '#fff', fontSize: 11, fontWeight: '600' },
})

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
      // Bust cache by appending timestamp
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
          {/* Handle */}
          <View style={sheetStyles.handle} />

          {/* Header row */}
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

          {/* Avatar picker */}
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

          {/* Fields */}
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

export default function ProfileScreen() {
  const { profile, signOut, session, refreshProfile } = useAuth()
  const [articlesCount, setArticlesCount] = useState<number | null>(null)
  const [ventesCount, setVentesCount] = useState<number | null>(null)
  const [stories, setStories] = useState<StoryCell[]>([])
  const [editVisible, setEditVisible] = useState(false)
  const [activeOrdersCount, setActiveOrdersCount] = useState(0)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .then(({ count }) => setArticlesCount(count ?? 0))

    supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('status', 'sold')
      .then(({ count }) => setVentesCount(count ?? 0))

    supabase
      .from('stories')
      .select('id, video_url, current_price_chf, status')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setStories((data ?? []) as StoryCell[]))

    Promise.all([
      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', userId)
        .in('status', ['sold', 'shipped']),
      supabase
        .from('shop_orders')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', userId)
        .in('status', ['paid', 'sold', 'shipped']),
    ]).then(([sRes, oRes]) => {
      setActiveOrdersCount((sRes.count ?? 0) + (oRes.count ?? 0))
    })

    callEdgeFunction<{ available_chf: number }>('get-seller-wallet')
      .then(data => setWalletBalance(data.available_chf ?? 0))
      .catch(() => setWalletBalance(null))
  }, [session?.user?.id])

  const displayName = profile?.display_name ?? profile?.username ?? 'Utilisateur'
  const username = profile?.username ?? 'username'
  const initial = displayName.charAt(0).toUpperCase()
  const currentUserId = session?.user?.id ?? ''
  // Profile screen always shows the logged-in user's own profile
  const profileUserId = currentUserId
  const userId = currentUserId
  const isOwnProfile = profileUserId === currentUserId

  const {
    isFollowing,
    followersCount,
    toggleFollow,
    loading: followLoading,
  } = useFollow(profileUserId)

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {/* Avatar + stats */}
          <View style={styles.topRow}>
            <View style={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
            </View>
            <View style={styles.statsRow}>
              {[
                { value: articlesCount, label: 'Articles' },
                { value: followLoading ? null : followersCount, label: 'Abonnés' },
                { value: ventesCount, label: 'Ventes' },
              ].map(stat => (
                <View key={stat.label} style={styles.stat}>
                  <Text style={styles.statNum}>{stat.value === null ? '--' : stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Name / bio */}
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.username}>@{username}</Text>
          {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          {/* Buttons */}
          <View style={styles.btnRow}>
            {isOwnProfile ? (
              <>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditVisible(true)}>
                  <Text style={styles.editBtnText}>Modifier le profil</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addBtn}>
                  <Ionicons name="person-add-outline" size={18} color={colors.text} />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                onPress={toggleFollow}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {isFollowing ? 'Abonné' : 'Suivre'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {profile?.role !== 'seller' && (
            <TouchableOpacity
              style={styles.becomeSellerBtn}
              onPress={() => router.push('/become-seller')}
            >
              <Text style={styles.becomeSellerText}>Devenir vendeur</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Edit profile sheet */}
        <EditProfileSheet
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          onSaved={refreshProfile}
          userId={userId}
          initialDisplayName={profile?.display_name ?? ''}
          initialBio={profile?.bio ?? ''}
          initialUsername={profile?.username ?? ''}
          initialAvatarUrl={profile?.avatar_url ?? null}
        />

        {/* Story circles */}
        <View style={styles.storiesWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesRow}
          >
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={styles.storyItem}>
                <View style={styles.storyCircle}>
                  <Ionicons name="add" size={24} color={colors.text} />
                </View>
                <Text style={styles.storyLabel}>Story</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Grid tab */}
        <View style={styles.tabBar}>
          <View style={styles.activeTab}>
            <Ionicons name="grid-outline" size={22} color={colors.primary} />
          </View>
        </View>

        {/* Publications grid */}
        {stories.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyTitle}>Aucune publication</Text>
          </View>
        ) : (
          <FlatList
            data={stories}
            keyExtractor={item => item.id}
            numColumns={3}
            scrollEnabled={false}
            renderItem={({ item }) => <GridCell story={item} />}
          />
        )}

        {/* Settings */}
        <View style={styles.settingsSection}>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/profile/orders')}
            activeOpacity={0.7}
          >
            <View style={styles.settingsRowLeft}>
              <Ionicons name="bag-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.settingsRowLabel}>Mes commandes</Text>
            </View>
            <View style={styles.settingsRowRight}>
              {activeOrdersCount > 0 && (
                <View style={styles.ordersBadge}>
                  <Text style={styles.ordersBadgeText}>{activeOrdersCount}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <View style={styles.settingsDivider} />

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/(tabs)/wallet')}
            activeOpacity={0.7}
          >
            <View style={styles.settingsRowLeft}>
              <Ionicons name="wallet-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.settingsRowLabel}>Mon Wallet</Text>
            </View>
            <View style={styles.settingsRowRight}>
              {walletBalance !== null && (
                <Text style={styles.walletBalance}>
                  CHF {walletBalance.toFixed(2)}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <View style={styles.settingsDivider} />

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/profile/payment-methods')}
            activeOpacity={0.7}
          >
            <View style={styles.settingsRowLeft}>
              <Ionicons name="card-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.settingsRowLabel}>Moyens de paiement</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 80, height: 80 },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.primary },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: 16 },
  stat: { alignItems: 'center' },
  statNum: { fontFamily: fontFamily.bold, fontSize: 20, color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  displayName: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text },
  username: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  bio: { fontSize: 14, color: colors.text, marginTop: 6 },
  btnRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  editBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBtnText: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.text },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followBtnText: { fontFamily: fontFamily.semiBold, fontSize: 13, color: '#000' },
  followBtnTextActive: { color: colors.primary },
  storiesWrap: { marginTop: 16 },
  storiesRow: { paddingHorizontal: 16, gap: 16 },
  storyItem: { alignItems: 'center', gap: 6 },
  storyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyLabel: { fontSize: 11, color: colors.textSecondary },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
  },
  activeTab: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  emptyGrid: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  settingsSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsRowLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: colors.text,
  },
  settingsRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletBalance: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  ordersBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  ordersBadgeText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    color: '#0F0F0F',
  },
  signOutBtn: { padding: 16, marginTop: 8, alignItems: 'center' },
  signOutText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.error },
  becomeSellerBtn: {
    backgroundColor: 'rgba(0,210,184,0.1)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  becomeSellerText: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.primary },
})
