import React from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily } from '../../lib/theme'

export default function ProfileScreen() {
  const { profile, signOut } = useAuth()

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
                { value: 0, label: 'Articles' },
                { value: profile?.followers_count ?? 0, label: 'Abonnés' },
                { value: 0, label: 'Ventes' },
              ].map(stat => (
                <View key={stat.label} style={styles.stat}>
                  <Text style={styles.statNum}>{stat.value}</Text>
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

        {/* Empty grid */}
        <View style={styles.emptyGrid}>
          <Ionicons name="camera-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>Aucun article publié</Text>
          <Text style={styles.emptySubtitle}>Commence à vendre dès maintenant</Text>
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
  emptySubtitle: { fontSize: 13, color: '#707070', marginTop: 4 },
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
