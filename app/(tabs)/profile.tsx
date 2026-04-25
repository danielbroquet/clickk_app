import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Dimensions,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily } from '../../lib/theme'

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
  soldLabel: { color: '#fff', fontFamily, fontSize: 13, fontWeight: '700' },
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

export default function ProfileScreen() {
  const { profile, signOut, session } = useAuth()
  const [articlesCount, setArticlesCount] = useState<number | null>(null)
  const [ventesCount, setVentesCount] = useState<number | null>(null)
  const [stories, setStories] = useState<StoryCell[]>([])

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
  }, [session?.user?.id])

  const displayName = profile?.display_name ?? profile?.username ?? 'Utilisateur'
  const username = profile?.username ?? 'username'
  const initial = displayName.charAt(0).toUpperCase()

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
                { value: profile?.followers_count ?? 0, label: 'Abonnés' },
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
            <TouchableOpacity style={styles.editBtn}>
              <Text style={styles.editBtnText}>Modifier le profil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn}>
              <Ionicons name="person-add-outline" size={18} color={colors.text} />
            </TouchableOpacity>
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
