import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import 'react-native-url-polyfill/auto'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'

const CATEGORIES = [
  { label: 'Électronique', value: 'electronics' },
  { label: 'Mode', value: 'fashion' },
  { label: 'Maison', value: 'home' },
  { label: 'Sport', value: 'sports' },
  { label: 'Livres', value: 'books' },
  { label: 'Jeux vidéo', value: 'gaming' },
  { label: 'Autres', value: 'other' },
]
const CONDITIONS = [
  { label: 'Neuf', value: 'new' },
  { label: 'Très bon état', value: 'like_new' },
  { label: 'Bon état', value: 'good' },
  { label: 'État correct', value: 'fair' },
]
const MAX_PHOTOS = 4

interface PhotoSlot {
  uri: string | null
  uploading: boolean
  url: string | null
  mediaType?: 'image' | 'video'
}

function makeSlots(): PhotoSlot[] {
  return Array.from({ length: MAX_PHOTOS }, () => ({ uri: null, uploading: false, url: null }))
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export default function CreateListingScreen() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [slots, setSlots] = useState<PhotoSlot[]>(makeSlots())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('')
  const [condition, setCondition] = useState<string>('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const anyUploading = slots.some((s) => s.uploading)

  const uploadMedia = async (index: number, uri: string, mediaType: 'image' | 'video') => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = { uri, uploading: true, url: null, mediaType }
      return next
    })

    try {
      const uriParts = uri.split('.')
      const ext = uriParts[uriParts.length - 1].split('?')[0].toLowerCase()
      let safeExt: string
      let mimeType: string
      if (mediaType === 'video') {
        safeExt = ['mp4', 'mov', 'm4v'].includes(ext) ? ext : 'mp4'
        mimeType = 'video/mp4'
      } else {
        safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
        mimeType = safeExt === 'jpg' || safeExt === 'jpeg' ? 'image/jpeg' : `image/${safeExt}`
      }
      const path = `${userId}/${uuidv4()}.${safeExt}`

      const response = await fetch(uri)
      const blob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from('listing-images')
        .upload(path, blob, { contentType: mimeType, upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(path)

      setSlots((prev) => {
        const next = [...prev]
        next[index] = { uri, uploading: false, url: urlData.publicUrl, mediaType }
        return next
      })
    } catch (err) {
      console.error('UPLOAD ERROR:', err)
      console.error('UPLOAD ERROR msg:', err instanceof Error ? err.message : String(err))
      setSlots((prev) => {
        const next = [...prev]
        next[index] = { uri: null, uploading: false, url: null }
        return next
      })
      setError("Échec du téléchargement. Veuillez réessayer.")
    }
  }

  const pickImage = async (index: number) => {
    Alert.alert(
      'Ajouter un média',
      undefined,
      [
        {
          text: 'Prendre une photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert("Autorisez l'accès à la caméra dans les réglages de votre téléphone")
              return
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            })
            if (result.canceled || !result.assets[0]) return
            await uploadMedia(index, result.assets[0].uri, 'image')
          },
        },
        {
          text: 'Filmer une vidéo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert("Autorisez l'accès à la caméra dans les réglages de votre téléphone")
              return
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              allowsEditing: true,
              videoMaxDuration: 60,
              quality: 1,
            })
            if (result.canceled || !result.assets[0]) return
            await uploadMedia(index, result.assets[0].uri, 'video')
          },
        },
        {
          text: 'Choisir dans la galerie',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
              videoMaxDuration: 60,
            })
            if (result.canceled || !result.assets[0]) return
            const asset = result.assets[0]
            const mediaType = asset.type === 'video' ? 'video' : 'image'
            await uploadMedia(index, asset.uri, mediaType)
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    )
  }

  const removeSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = { uri: null, uploading: false, url: null }
      return next
    })
  }

  const validate = (): string | null => {
    if (!slots[0].url) return 'Au moins une photo est requise.'
    if (!title.trim()) return 'Le titre est requis.'
    const p = parseFloat(price)
    if (!price || isNaN(p) || p < 1) return 'Le prix doit être d\'au moins CHF 1.'
    const s = parseInt(stock, 10)
    if (!stock || isNaN(s) || s < 1) return 'Le stock doit être d\'au moins 1.'
    return null
  }

  const handleSubmit = async () => {
    setError(null)
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setSubmitting(true)
    try {
      const imageUrls = slots.map((s) => s.url).filter((u): u is string => !!u)

      const { error: insertError } = await supabase.from('shop_listings').insert({
        seller_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        price_chf: parseFloat(price),
        images: imageUrls,
        category: category || null,
        condition: condition || null,
        stock: parseInt(stock, 10),
        is_active: true,
      })

      if (insertError) throw insertError
      router.replace('/(tabs)/profile')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Une erreur est survenue.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = submitting || anyUploading

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Publier un article</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Photos */}
          <Text style={styles.sectionLabel}>Photos <Text style={styles.required}>*</Text></Text>
          <Text style={styles.hint}>Ajoutez jusqu'à 4 photos. La première est obligatoire.</Text>
          <View style={styles.photoRow}>
            {slots.map((slot, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.photoSlot, i === 0 && !slot.uri && styles.photoSlotPrimary]}
                onPress={() => !slot.uploading && pickImage(i)}
                activeOpacity={0.75}
                disabled={slot.uploading}
              >
                {slot.uri ? (
                  <>
                    {slot.mediaType === 'video' ? (
                      <View style={styles.videoPreview}>
                        <Ionicons name="play-circle" size={32} color="#fff" />
                        <Text style={styles.videoLabel} numberOfLines={1}>Vidéo</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: slot.uri }} style={styles.photoPreview} />
                    )}
                    {slot.uploading ? (
                      <View style={styles.photoOverlay}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.photoRemove}
                        onPress={() => removeSlot(i)}
                        hitSlop={6}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.text} />
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons
                      name="camera-outline"
                      size={22}
                      color={i === 0 ? colors.primary : colors.textSecondary}
                    />
                    {i === 0 && <Text style={styles.photoAddLabel}>Ajouter</Text>}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.label}>Titre <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, 80))}
            placeholder="Ex. iPhone 14 Pro, état neuf"
            placeholderTextColor={colors.textSecondary}
            maxLength={80}
          />
          <Text style={styles.counter}>{title.length}/80</Text>

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 500))}
            placeholder="Décrivez votre article..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{description.length}/500</Text>

          {/* Category */}
          <Text style={styles.label}>Catégorie</Text>
          <View style={styles.chipGroup}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.chip, category === c.value && styles.chipActive]}
                onPress={() => setCategory(category === c.value ? '' : c.value)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, category === c.value && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Condition */}
          <Text style={styles.label}>État</Text>
          <View style={styles.chipGroup}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.chip, condition === c.value && styles.chipActive]}
                onPress={() => setCondition(condition === c.value ? '' : c.value)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, condition === c.value && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Price */}
          <Text style={styles.label}>Prix (CHF) <Text style={styles.required}>*</Text></Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>CHF</Text>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Stock */}
          <Text style={styles.label}>Stock <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, styles.inputSmall]}
            value={stock}
            onChangeText={(t) => setStock(t.replace(/[^0-9]/g, ''))}
            placeholder="1"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, isDisabled && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isDisabled}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#0F0F0F" />
            ) : (
              <Text style={styles.submitBtnText}>Publier</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
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
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.text,
    marginBottom: 4,
  },
  hint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  required: { color: colors.primary },
  photoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.xs,
  },
  photoSlot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photoSlotPrimary: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  videoLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    color: colors.textSecondary,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  photoAddLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.primary,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 12,
  },
  inputSmall: {
    width: 100,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputFlex: {
    flex: 1,
  },
  currencyPrefix: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    width: 36,
  },
  counter: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0,210,184,0.12)',
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.error,
    flex: 1,
  },
  bottomPad: { height: 24 },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: '#0F0F0F',
  },
})
