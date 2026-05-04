import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily } from '../../lib/theme'

export default function EditProfileScreen() {
  const { profile, session, refreshProfile } = useAuth()
  const userId = session?.user?.id ?? ''

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
    setUsername(profile?.username ?? '')
    setBio(profile?.bio ?? '')
    setAvatarUrl(profile?.avatar_url ?? null)
  }, [profile])

  const initial = (displayName || username || 'U').charAt(0).toUpperCase()

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
      setError("Impossible de lire l'image.")
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
    if (!userId) return
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
    await refreshProfile()
    router.back()
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.cancelText}>Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifier le profil</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || avatarUploading}
            hitSlop={8}
          >
            <Text style={[styles.saveText, (saving || avatarUploading) && styles.savingText]}>
              {saving ? '...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarCircle}
              onPress={handlePickAvatar}
              disabled={avatarUploading}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitial}>{initial}</Text>
              )}
              {avatarUploading && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              {!avatarUploading && (
                <View style={styles.cameraIcon}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Modifier la photo</Text>
          </View>

          {/* Fields */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nom affiché</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Nom affiché"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nom d'utilisateur</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.bioLabelRow}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <Text style={styles.charCount}>{bio.length}/150</Text>
            </View>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={t => setBio(t.slice(0, 150))}
              placeholder="Parlez-nous de vous…"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={150}
              returnKeyType="done"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.text,
  },
  cancelText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  saveText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  savingText: { opacity: 0.5 },

  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },

  errorText: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 88, height: 88 },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 32, color: colors.primary },
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarHint: { fontSize: 13, color: colors.primary, marginTop: 8 },

  fieldGroup: { marginBottom: 18 },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 7,
    fontFamily: fontFamily.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bioLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  charCount: { fontSize: 12, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    fontFamily: fontFamily.regular,
  },
  bioInput: { height: 100, textAlignVertical: 'top' },
})
