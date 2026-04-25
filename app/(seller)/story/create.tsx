import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Video, X } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Video as AvVideo, ResizeMode } from 'expo-av'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../../lib/supabase'

type SpeedPreset = 'FLASH' | 'STANDARD' | 'RELAX'

const DURATION: Record<SpeedPreset, { hours: number; ms: number }> = {
  FLASH:    { hours: 24,  ms: 24  * 60 * 60 * 1000 },
  STANDARD: { hours: 72,  ms: 72  * 60 * 60 * 1000 },
  RELAX:    { hours: 168, ms: 168 * 60 * 60 * 1000 },
}

const SPEED_TO_SECONDS: Record<SpeedPreset, number> = {
  FLASH:    30,
  STANDARD: 120,
  RELAX:    300,
}

const PRESETS: { key: SpeedPreset; emoji: string; label: string; sub: string }[] = [
  { key: 'FLASH',    emoji: '⚡', label: 'Flash',    sub: '24h'    },
  { key: 'STANDARD', emoji: '🕐', label: 'Standard', sub: '72h'    },
  { key: 'RELAX',    emoji: '🌿', label: 'Relax',    sub: '7 days' },
]

const PRESET_COLORS: Record<SpeedPreset, { bg: string; text: string }> = {
  FLASH:    { bg: '#FFA755', text: '#0F0F0F' },
  STANDARD: { bg: '#00D2B8', text: '#0F0F0F' },
  RELAX:    { bg: '#A9F7E1', text: '#0F0F0F' },
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = days[d.getDay()]
  const date = String(d.getDate()).padStart(2, '0')
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${date} ${month} ${year} · ${hh}:${mm}`
}

export default function CreateStoryScreen() {
  const router = useRouter()

  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startPrice, setStartPrice] = useState('')
  const [floorPrice, setFloorPrice] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<SpeedPreset>('STANDARD')
  const [loading, setLoading] = useState(false)

  const { hours: durationHours, ms: durationMs } = DURATION[selectedPreset]

  const floorGtStart =
    startPrice !== '' &&
    floorPrice !== '' &&
    parseFloat(floorPrice) > parseFloat(startPrice)

  const canPublish =
    videoUri !== null &&
    title.trim() !== '' &&
    startPrice !== '' &&
    floorPrice !== '' &&
    !floorGtStart

  const pickVideo = () => {
    Alert.alert(
      'Ajouter une vidéo',
      undefined,
      [
        {
          text: 'Filmer',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert("Accès refusé", "Autorisez l'accès à la caméra dans les réglages de votre téléphone")
              return
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              allowsEditing: true,
              videoMaxDuration: 60,
              quality: 1,
            })
            if (!result.canceled && result.assets.length > 0) {
              setVideoUri(result.assets[0].uri)
            }
          },
        },
        {
          text: 'Choisir dans la galerie',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              allowsEditing: true,
              videoMaxDuration: 60,
              quality: 1,
            })
            if (!result.canceled && result.assets.length > 0) {
              setVideoUri(result.assets[0].uri)
            }
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    )
  }

  const handlePublish = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Alert.alert('Error', 'Not authenticated')

    setLoading(true)
    try {
      const path = `${user.id}/${Date.now()}.mp4`
      let localUri = videoUri!
      if (localUri.startsWith('ph://') || !localUri.startsWith('file://')) {
        const cacheUri = FileSystem.cacheDirectory + `upload_${Date.now()}.mp4`
        await FileSystem.copyAsync({ from: localUri, to: cacheUri })
        localUri = cacheUri
      }
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
      })
      const { error: uploadError } = await supabase.storage
        .from('story-videos')
        .upload(path, decode(base64), { contentType: 'video/mp4' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('story-videos')
        .getPublicUrl(path)

      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          seller_id: user.id,
          video_url: publicUrl,
          title: title.trim(),
          description: description.trim() || null,
          start_price_chf: parseFloat(startPrice),
          floor_price_chf: parseFloat(floorPrice),
          current_price_chf: parseFloat(startPrice),
          price_drop_seconds: SPEED_TO_SECONDS[selectedPreset],
          last_drop_at: new Date().toISOString(),
          speed_preset: selectedPreset,
          duration_hours: durationHours,
          expires_at: new Date(Date.now() + durationMs).toISOString(),
          status: 'active',
        })
      if (insertError) throw insertError

      router.replace('/(tabs)')         // tab home
      router.replace('/(tabs)/sell')    // tab vendeur
      router.replace('/(tabs)/profile') // tab profil
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Story</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Video upload zone */}
          {videoUri ? (
            <View style={s.videoPreviewWrapper}>
              <AvVideo
                source={{ uri: videoUri }}
                style={s.videoPreview}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                useNativeControls
              />
              <TouchableOpacity
                style={s.clearBtn}
                onPress={() => setVideoUri(null)}
              >
                <X size={14} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={s.readyPill}>
                <Text style={s.readyPillText}>✓ Video ready</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.uploadZone} onPress={pickVideo} activeOpacity={0.7}>
              <Video size={40} color="#00D2B8" />
              <Text style={s.uploadLabel}>Record or pick a video</Text>
              <Text style={s.uploadSub}>Max 30 seconds</Text>
            </TouchableOpacity>
          )}

          {/* Form fields */}
          <View style={s.card}>
            {/* Title */}
            <View>
              <Text style={s.fieldLabel}>Title</Text>
              <TextInput
                style={s.input}
                placeholder="What are you selling?"
                placeholderTextColor="#717976"
                value={title}
                onChangeText={setTitle}
                maxLength={60}
                returnKeyType="next"
              />
              <Text style={s.counter}>{title.length}/60</Text>
            </View>

            {/* Description */}
            <View style={{ marginTop: 16 }}>
              <Text style={s.fieldLabel}>Description</Text>
              <TextInput
                style={[s.input, { height: 96, textAlignVertical: 'top' }]}
                placeholder="Describe your item…"
                placeholderTextColor="#717976"
                value={description}
                onChangeText={setDescription}
                maxLength={300}
                multiline
                numberOfLines={4}
              />
              <Text style={s.counter}>{description.length}/300</Text>
            </View>
          </View>

          {/* Pricing */}
          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.sectionLabel}>Pricing</Text>
            <View style={s.priceRow}>
              {/* Starting price */}
              <View style={{ flex: 1 }}>
                <Text style={s.priceLabel}>Starting price</Text>
                <View style={s.priceInputWrapper}>
                  <TextInput
                    style={s.priceInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#717976"
                    value={startPrice}
                    onChangeText={setStartPrice}
                  />
                  <Text style={s.currencyTag}>CHF</Text>
                </View>
              </View>

              {/* Floor price */}
              <View style={{ flex: 1 }}>
                <Text style={s.priceLabel}>Floor price</Text>
                <View style={s.priceInputWrapper}>
                  <TextInput
                    style={s.priceInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#717976"
                    value={floorPrice}
                    onChangeText={setFloorPrice}
                  />
                  <Text style={s.currencyTag}>CHF</Text>
                </View>
                <Text style={s.minNote}>Minimum accepted</Text>
              </View>
            </View>

            {floorGtStart && (
              <Text style={s.priceError}>Floor price must be ≤ starting price</Text>
            )}
          </View>

          {/* Speed preset */}
          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.sectionLabel}>Sale speed</Text>
            <View style={s.pillRow}>
              {PRESETS.map(p => {
                const active = selectedPreset === p.key
                const colors = PRESET_COLORS[p.key]
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      s.pill,
                      { backgroundColor: active ? colors.bg : '#2A2A2A' },
                    ]}
                    onPress={() => setSelectedPreset(p.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 16 }}>{p.emoji}</Text>
                    <Text
                      style={[
                        s.pillLabel,
                        { color: active ? colors.text : '#717976' },
                      ]}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={[
                        s.pillSub,
                        { color: active ? colors.text : '#717976' },
                      ]}
                    >
                      {p.sub}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={s.endsOn}>
              Ends on {formatDate(Date.now() + durationMs)}
            </Text>
          </View>

          {/* Publish button */}
          <TouchableOpacity
            style={[s.publishBtn, (!canPublish || loading) && { opacity: 0.4 }]}
            onPress={handlePublish}
            disabled={!canPublish || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={s.publishText}>Publish Story</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Video zone
  uploadZone: {
    aspectRatio: 9 / 16,
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#00D2B8',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  uploadLabel: {
    color: '#717976',
    fontSize: 13,
    marginTop: 4,
  },
  uploadSub: {
    color: '#717976',
    fontSize: 11,
  },
  videoPreviewWrapper: {
    aspectRatio: 9 / 16,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
  },
  clearBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#0F0F0F',
    borderRadius: 999,
    padding: 4,
  },
  readyPill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: '#00D2B8',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  readyPillText: {
    color: '#0F0F0F',
    fontSize: 11,
    fontWeight: '700',
  },

  // Card
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  fieldLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  counter: {
    color: '#717976',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },

  // Pricing
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  priceLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    marginBottom: 6,
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  priceInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 12,
  },
  currencyTag: {
    color: '#717976',
    fontSize: 13,
  },
  minNote: {
    color: '#717976',
    fontSize: 10,
    marginTop: 4,
  },
  priceError: {
    color: '#FF4444',
    fontSize: 12,
    marginTop: 8,
  },

  // Speed presets
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillSub: {
    fontSize: 10,
  },
  endsOn: {
    color: '#717976',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 10,
  },

  // Publish
  publishBtn: {
    height: 52,
    backgroundColor: '#00D2B8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  publishText: {
    color: '#0F0F0F',
    fontSize: 16,
    fontWeight: '700',
  },
})
