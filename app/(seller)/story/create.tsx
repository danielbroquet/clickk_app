import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
  Pressable,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { Video as AvVideo, ResizeMode } from 'expo-av'
import { decode } from 'base64-arraybuffer'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { colors, fontFamily, spacing, fontSize } from '../../../lib/theme'

const { width: SW } = Dimensions.get('window')

// ─── Types & constants ────────────────────────────────────────────────────────

type SpeedPreset = 'FLASH' | 'STANDARD' | 'RELAX'

const DURATION: Record<SpeedPreset, { label: string; hours: number; ms: number }> = {
  FLASH:    { label: '1h',     hours: 1,   ms: 1   * 60 * 60 * 1000 },
  STANDARD: { label: '24h',   hours: 24,  ms: 24  * 60 * 60 * 1000 },
  RELAX:    { label: '7 jours', hours: 168, ms: 7 * 24 * 60 * 60 * 1000 },
}

const PRESETS: { key: SpeedPreset; emoji: string; label: string; tagline: string }[] = [
  { key: 'FLASH',    emoji: '⚡', label: 'FLASH',    tagline: '1h · chute rapide'    },
  { key: 'STANDARD', emoji: '🎯', label: 'STANDARD', tagline: '24h · équilibré'      },
  { key: 'RELAX',    emoji: '🌙', label: 'RELAX',    tagline: '7 jours · lente'      },
]

const CATEGORIES: { label: string; value: string }[] = [
  { label: 'Sneakers', value: 'sneakers' },
  { label: 'Mode',     value: 'mode'     },
  { label: 'Tech',     value: 'tech'     },
  { label: 'Montres',  value: 'watches'  },
  { label: 'Art',      value: 'art'      },
  { label: 'Sport',    value: 'sport'    },
  { label: 'Maison',   value: 'maison'   },
  { label: 'Autre',    value: 'autre'    },
]

const PRESET_ACCENT: Record<SpeedPreset, string> = {
  FLASH:    '#FF6B35',
  STANDARD: '#00D2B8',
  RELAX:    '#A9F7E1',
}

const TOTAL_STEPS = 4

// ─── Price curve chart ────────────────────────────────────────────────────────

function PriceCurve({
  startPrice,
  floorPrice,
  preset,
}: {
  startPrice: number
  floorPrice: number
  preset: SpeedPreset
}) {
  const W = SW - 64
  const H = 80
  const pts = 40
  const sp = Math.max(startPrice, 0.01)
  const fp = Math.min(floorPrice, sp)

  const points = Array.from({ length: pts }, (_, i) => {
    const t = i / (pts - 1)
    const price = sp - (sp - fp) * t
    const x = (i / (pts - 1)) * W
    const y = H - ((price - fp) / (sp - fp + 0.001)) * (H - 10) - 5
    return `${x},${y}`
  })

  const linePath = `M ${points.join(' L ')}`
  const fillPath = `${linePath} L ${W},${H} L 0,${H} Z`
  const accent = PRESET_ACCENT[preset]

  return (
    <Svg width={W} height={H}>
      <Defs>
        <SvgGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accent} stopOpacity="0.35" />
          <Stop offset="1" stopColor={accent} stopOpacity="0.02" />
        </SvgGradient>
      </Defs>
      <Path d={fillPath} fill="url(#grad)" />
      <Path d={linePath} stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={s.progressRow}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View key={i} style={s.progressSegmentOuter}>
          <Animated.View
            style={[
              s.progressSegment,
              { backgroundColor: i < step ? colors.primary : colors.surfaceHigh },
            ]}
          />
        </View>
      ))}
    </View>
  )
}

// ─── Success check animation ──────────────────────────────────────────────────

function SuccessCheck({ onDone }: { onDone: () => void }) {
  const scale = useSharedValue(0)
  const opacity = useSharedValue(0)

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 })
    opacity.value = withTiming(1, { duration: 250 })
    const t = setTimeout(() => runOnJS(onDone)(), 1600)
    return () => clearTimeout(t)
  }, [scale, opacity, onDone])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  return (
    <View style={s.successWrap}>
      <Animated.View style={[s.successCircle, animStyle]}>
        <Ionicons name="checkmark" size={52} color="#0F0F0F" />
      </Animated.View>
      <Text style={s.successTitle}>Drop publié !</Text>
      <Text style={s.successSub}>Votre enchère est maintenant en ligne.</Text>
    </View>
  )
}

// ─── Category picker ──────────────────────────────────────────────────────────

function CategoryPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TouchableOpacity style={s.catTrigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={[s.catTriggerText, !value && { color: colors.textSecondary }]}>
          {CATEGORIES.find((c) => c.value === value)?.label ?? 'Choisir une catégorie'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.catBackdrop} onPress={() => setOpen(false)} />
        <View style={s.catSheet}>
          <View style={s.catHandle} />
          <Text style={s.catSheetTitle}>Catégorie</Text>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[s.catItem, value === c.value && s.catItemActive]}
              onPress={() => { onChange(c.value); setOpen(false) }}
            >
              <Text style={[s.catItemText, value === c.value && s.catItemTextActive]}>{c.label}</Text>
              {value === c.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreateDropScreen() {
  const router = useRouter()
  const { profile } = useAuth()

  useEffect(() => {
    if (profile && profile.role !== 'seller') {
      router.replace('/become-seller')
    }
  }, [profile])

  // Step state
  const [step, setStep] = useState(1)
  const [success, setSuccess] = useState(false)

  // Step 1
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null)
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number>(30)

  // Step 2
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')

  // Step 3
  const [startPrice, setStartPrice] = useState('')
  const [floorPrice, setFloorPrice] = useState('')
  const [preset, setPreset] = useState<SpeedPreset>('STANDARD')

  // Step 4
  const [loading, setLoading] = useState(false)
  const [uploadPhase, setUploadPhase] = useState<string>('')
  const [uploadPercent, setUploadPercent] = useState(0)

  const { hours: durationHours, ms: durationMs, label: durationLabel } = DURATION[preset]

  const sp = parseFloat(startPrice) || 0
  const fp = parseFloat(floorPrice) || 0
  const floorGtStart = startPrice !== '' && floorPrice !== '' && fp > sp
  const dropPerMin = durationMs > 0 ? ((sp - fp) / (durationMs / 60000)).toFixed(2) : '0.00'

  // ── video helpers ──────────────────────────────────────────────────────────

  const generateThumbnail = async (uri: string): Promise<string | null> => {
    try {
      const { uri: t } = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.7 })
      return t
    } catch { return null }
  }

  const handleVideoSelected = async (asset: ImagePicker.ImagePickerAsset) => {
    setVideoUri(asset.uri)
    const durationMs = asset.duration ?? null
    const durationSec = durationMs != null && durationMs > 0
      ? Math.min(Math.max(Math.round(durationMs / 1000), 1), 30)
      : 30
    setVideoDurationSeconds(durationSec)
    const thumb = await generateThumbnail(asset.uri)
    setThumbnailUri(thumb)
  }

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Accès refusé', "Autorisez l'accès à la caméra dans les réglages.")
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 1,
    })
    if (!result.canceled && result.assets[0]) await handleVideoSelected(result.assets[0])
  }

  const launchGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 1,
    })
    if (!result.canceled && result.assets[0]) await handleVideoSelected(result.assets[0])
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const goPrev = () => setStep((s) => Math.max(s - 1, 1))

  const handleCancel = () => {
    Alert.alert(
      'Annuler ?',
      'Vos modifications seront perdues.',
      [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Annuler le drop', style: 'destructive', onPress: () => router.back() },
      ]
    )
  }

  // ── publish ────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Alert.alert('Erreur', 'Non authentifié')

    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('stripe_onboarding_complete, stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!sellerProfile?.stripe_onboarding_complete || !sellerProfile?.stripe_account_id) {
      Alert.alert(
        'Compte vendeur incomplet',
        "Tu dois d'abord terminer ton inscription vendeur (Stripe) pour pouvoir recevoir des paiements.",
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Configurer', onPress: () => router.replace('/become-seller') },
        ]
      )
      return
    }

    setLoading(true)
    setUploadPercent(0)
    setUploadPhase('Préparation…')
    try {
      // Step 1 — copy to cache if needed (5%)
      const path = `${user.id}/${Date.now()}.mp4`
      let localUri = videoUri!
      if (localUri.startsWith('ph://') || !localUri.startsWith('file://')) {
        setUploadPhase('Copie du fichier…')
        setUploadPercent(5)
        const cacheUri = FileSystem.cacheDirectory + `upload_${Date.now()}.mp4`
        await FileSystem.copyAsync({ from: localUri, to: cacheUri })
        localUri = cacheUri
      }

      // Step 2 — read video (15%)
      setUploadPhase('Lecture de la vidéo…')
      setUploadPercent(15)
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' })

      // Step 3 — upload video (60%)
      setUploadPhase('Envoi de la vidéo…')
      setUploadPercent(30)
      const { error: uploadError } = await supabase.storage
        .from('story-videos')
        .upload(path, decode(base64), { contentType: 'video/mp4' })
      if (uploadError) throw uploadError
      setUploadPercent(60)

      const { data: { publicUrl } } = supabase.storage.from('story-videos').getPublicUrl(path)

      // Step 4 — upload thumbnail (75%)
      let thumbnailPublicUrl: string | null = null
      if (thumbnailUri) {
        try {
          setUploadPhase('Envoi de la miniature…')
          setUploadPercent(65)
          const thumbPath = `${user.id}/${Date.now()}_thumb.jpg`
          const thumbBase64 = await FileSystem.readAsStringAsync(thumbnailUri, { encoding: 'base64' })
          const { error: te } = await supabase.storage
            .from('story-thumbnails')
            .upload(thumbPath, decode(thumbBase64), { contentType: 'image/jpeg' })
          if (!te) {
            const { data: { publicUrl: tu } } = supabase.storage.from('story-thumbnails').getPublicUrl(thumbPath)
            thumbnailPublicUrl = tu
          }
          setUploadPercent(75)
        } catch {}
      } else {
        setUploadPercent(75)
      }

      // Step 5 — insert record (100%)
      setUploadPhase('Finalisation…')
      setUploadPercent(85)
      const categoryValue = category || 'autre'
      const insertPayload = {
        seller_id: user.id,
        video_url: publicUrl,
        thumbnail_url: thumbnailPublicUrl,
        title: title.trim(),
        description: description.trim() || null,
        category: categoryValue,
        video_duration_seconds: Math.min(Math.max(Math.round(videoDurationSeconds), 1), 30),
        start_price_chf: sp,
        floor_price_chf: fp,
        current_price_chf: sp,
        price_drop_seconds: 5,
        last_drop_at: new Date().toISOString(),
        speed_preset: preset,
        duration_hours: durationHours,
        expires_at: new Date(Date.now() + durationMs).toISOString(),
        status: 'active',
      }
      const { error: insertError } = await supabase.from('stories').insert(insertPayload)
      if (insertError) throw insertError

      setUploadPercent(100)
      setUploadPhase('Publié !')
      setLoading(false)
      setSuccess(true)
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? 'Une erreur est survenue')
      setLoading(false)
      setUploadPercent(0)
      setUploadPhase('')
    }
  }

  // ── success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SuccessCheck onDone={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  // ── can advance? ───────────────────────────────────────────────────────────

  const canNext =
    (step === 1 && videoUri !== null) ||
    (step === 2 && title.trim().length > 0) ||
    (step === 3 && startPrice !== '' && floorPrice !== '' && !floorGtStart) ||
    step === TOTAL_STEPS

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleCancel} style={s.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerStep}>{step} / {TOTAL_STEPS}</Text>
          <Text style={s.headerTitle}>{STEP_TITLES[step - 1]}</Text>
        </View>
        <View style={s.headerBtn} />
      </View>

      {/* Progress bar */}
      <ProgressBar step={step} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <Step1
              videoUri={videoUri}
              thumbnailUri={thumbnailUri}
              onCamera={launchCamera}
              onGallery={launchGallery}
              onClear={() => { setVideoUri(null); setThumbnailUri(null); setVideoDurationSeconds(30) }}
            />
          )}
          {step === 2 && (
            <Step2
              title={title} onTitle={setTitle}
              description={description} onDescription={setDescription}
              category={category} onCategory={setCategory}
              thumbnailUri={thumbnailUri}
            />
          )}
          {step === 3 && (
            <Step3
              startPrice={startPrice} onStart={setStartPrice}
              floorPrice={floorPrice} onFloor={setFloorPrice}
              preset={preset} onPreset={setPreset}
              floorGtStart={floorGtStart}
              sp={sp} fp={fp}
              dropPerMin={dropPerMin}
              durationLabel={durationLabel}
            />
          )}
          {step === 4 && (
            <Step4
              title={title}
              thumbnailUri={thumbnailUri}
              sp={sp} fp={fp}
              preset={preset}
              durationLabel={durationLabel}
              loading={loading}
              uploadPhase={uploadPhase}
              uploadPercent={uploadPercent}
              onPublish={handlePublish}
            />
          )}
        </ScrollView>

        {/* Bottom navigation */}
        {step < TOTAL_STEPS ? (
          <View style={s.navRow}>
            {step > 1 ? (
              <TouchableOpacity style={s.prevBtn} onPress={goPrev} activeOpacity={0.8}>
                <Ionicons name="chevron-back" size={18} color={colors.text} />
                <Text style={s.prevText}>Précédent</Text>
              </TouchableOpacity>
            ) : <View style={s.prevBtn} />}

            <TouchableOpacity
              style={[s.nextBtn, !canNext && s.nextBtnDisabled]}
              onPress={goNext}
              disabled={!canNext}
              activeOpacity={0.85}
            >
              <Text style={[s.nextText, !canNext && s.nextTextDisabled]}>Suivant</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={canNext ? '#0F0F0F' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const STEP_TITLES = ['Vidéo', 'Détails', 'Tarification', 'Publier']

// ─── Step 1: Capture / Upload ─────────────────────────────────────────────────

function Step1({
  videoUri,
  thumbnailUri,
  onCamera,
  onGallery,
  onClear,
}: {
  videoUri: string | null
  thumbnailUri: string | null
  onCamera: () => void
  onGallery: () => void
  onClear: () => void
}) {
  if (videoUri) {
    return (
      <View>
        <View style={s.videoWrap}>
          <AvVideo
            source={{ uri: videoUri }}
            style={s.videoPreview}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            useNativeControls
            isLooping
          />
          <TouchableOpacity style={s.clearBtn} onPress={onClear}>
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={s.readyPill}>
            <Ionicons name="checkmark-circle" size={13} color="#0F0F0F" />
            <Text style={s.readyText}>Vidéo prête</Text>
          </View>
        </View>
        {thumbnailUri && (
          <View style={s.thumbRow}>
            <Image source={{ uri: thumbnailUri }} style={s.thumbImg} />
            <View>
              <Text style={s.thumbLabel}>Miniature générée</Text>
              <Text style={s.thumbSub}>Aperçu automatique depuis ta vidéo</Text>
            </View>
          </View>
        )}
        <Text style={s.hintText}>Appuie sur "Suivant" pour continuer →</Text>
      </View>
    )
  }

  return (
    <View style={s.captureWrap}>
      <Text style={s.captureTitle}>Ajoute une vidéo</Text>
      <Text style={s.captureSub}>Max 60 secondes · Format vertical recommandé</Text>

      <TouchableOpacity style={s.captureBtn} onPress={onCamera} activeOpacity={0.85}>
        <View style={s.captureBtnIcon}>
          <Ionicons name="videocam" size={32} color="#0F0F0F" />
        </View>
        <View style={s.captureBtnText}>
          <Text style={s.captureBtnTitle}>Filmer</Text>
          <Text style={s.captureBtnSub}>Ouvrir la caméra</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <TouchableOpacity style={s.captureBtn} onPress={onGallery} activeOpacity={0.85}>
        <View style={[s.captureBtnIcon, { backgroundColor: colors.surfaceHigh }]}>
          <Ionicons name="images" size={32} color={colors.primary} />
        </View>
        <View style={s.captureBtnText}>
          <Text style={s.captureBtnTitle}>Importer</Text>
          <Text style={s.captureBtnSub}>Depuis la galerie</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

// ─── Step 2: Details ──────────────────────────────────────────────────────────

function Step2({
  title, onTitle,
  description, onDescription,
  category, onCategory,
  thumbnailUri,
}: {
  title: string; onTitle: (s: string) => void
  description: string; onDescription: (s: string) => void
  category: string; onCategory: (s: string) => void
  thumbnailUri: string | null
}) {
  return (
    <View style={s.formWrap}>
      {thumbnailUri && (
        <Image source={{ uri: thumbnailUri }} style={s.detailThumb} />
      )}

      <Text style={s.fieldLabel}>Titre *</Text>
      <TextInput
        style={s.titleInput}
        placeholder="Ex: Nike Air Max 90 Taille 42"
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={(t) => onTitle(t.slice(0, 80))}
        returnKeyType="next"
        autoFocus
      />
      <Text style={s.counter}>{title.length}/80</Text>

      <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>Description</Text>
      <TextInput
        style={s.descInput}
        placeholder="État, détails, défauts éventuels..."
        placeholderTextColor={colors.textSecondary}
        value={description}
        onChangeText={(t) => onDescription(t.slice(0, 300))}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <Text style={s.counter}>{description.length}/300</Text>

      <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>Catégorie</Text>
      <CategoryPicker value={category} onChange={onCategory} />
    </View>
  )
}

// ─── Step 3: Pricing ──────────────────────────────────────────────────────────

function Step3({
  startPrice, onStart,
  floorPrice, onFloor,
  preset, onPreset,
  floorGtStart,
  sp, fp,
  dropPerMin,
  durationLabel,
}: {
  startPrice: string; onStart: (s: string) => void
  floorPrice: string; onFloor: (s: string) => void
  preset: SpeedPreset; onPreset: (p: SpeedPreset) => void
  floorGtStart: boolean
  sp: number; fp: number
  dropPerMin: string
  durationLabel: string
}) {
  const hasPrices = sp > 0 && fp >= 0 && sp > fp

  return (
    <View style={s.formWrap}>
      {/* Price inputs */}
      <View style={s.priceRow}>
        <View style={s.priceCol}>
          <Text style={s.priceColLabel}>Prix de départ</Text>
          <View style={[s.priceBox, floorGtStart && { borderColor: colors.error }]}>
            <Text style={s.chfTag}>CHF</Text>
            <TextInput
              style={s.priceInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              value={startPrice}
              onChangeText={onStart}
            />
          </View>
        </View>
        <View style={s.priceArrow}>
          <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} />
        </View>
        <View style={s.priceCol}>
          <Text style={s.priceColLabel}>Prix plancher</Text>
          <View style={[s.priceBox, floorGtStart && { borderColor: colors.error }]}>
            <Text style={s.chfTag}>CHF</Text>
            <TextInput
              style={s.priceInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              value={floorPrice}
              onChangeText={onFloor}
            />
          </View>
          <Text style={s.floorHint}>Prix minimum accepté</Text>
        </View>
      </View>

      {/* Shipping reminder */}
      <View style={s.shippingBanner}>
        <Ionicons name="cube-outline" size={14} color="#00D2B8" style={{ marginTop: 1 }} />
        <Text style={s.shippingBannerText}>
          <Text style={s.shippingBold}>Livraison offerte obligatoire.</Text>
          {' '}Inclus les frais d'envoi dans ton prix plancher (env. CHF 7 via La Poste).
        </Text>
      </View>

      {floorGtStart && (
        <Text style={s.priceError}>Le prix plancher doit être inférieur au prix de départ</Text>
      )}

      {/* Speed presets */}
      <Text style={[s.fieldLabel, { marginTop: spacing.lg }]}>Vitesse de vente</Text>
      <View style={s.presetRow}>
        {PRESETS.map((p) => {
          const active = preset === p.key
          const accent = PRESET_ACCENT[p.key]
          return (
            <TouchableOpacity
              key={p.key}
              style={[s.presetCard, active && { borderColor: accent, backgroundColor: `${accent}18` }]}
              onPress={() => onPreset(p.key)}
              activeOpacity={0.8}
            >
              <Text style={s.presetEmoji}>{p.emoji}</Text>
              <Text style={[s.presetLabel, active && { color: accent }]}>{p.label}</Text>
              <Text style={s.presetTagline}>{p.tagline}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Live chart preview */}
      {hasPrices && (
        <View style={s.chartCard}>
          <View style={s.chartHeader}>
            <Text style={s.chartTitle}>Aperçu de la descente</Text>
            <View style={s.chartPricePills}>
              <Text style={s.chartPriceFrom}>CHF {sp.toFixed(0)}</Text>
              <Ionicons name="arrow-forward" size={12} color={colors.textSecondary} />
              <Text style={s.chartPriceTo}>CHF {fp.toFixed(0)}</Text>
            </View>
          </View>
          <PriceCurve startPrice={sp} floorPrice={fp} preset={preset} />
          <Text style={s.chartSummary}>
            Le prix passera de{' '}
            <Text style={s.chartBold}>CHF {sp.toFixed(2)}</Text>
            {' '}à{' '}
            <Text style={s.chartBold}>CHF {fp.toFixed(2)}</Text>
            {' '}en{' '}
            <Text style={s.chartBold}>{durationLabel}</Text>
            {', '}−CHF{' '}
            <Text style={s.chartBold}>{dropPerMin}</Text>
            /min
          </Text>
        </View>
      )}
    </View>
  )
}

// ─── Step 4: Publish ──────────────────────────────────────────────────────────

function Step4({
  title, thumbnailUri, sp, fp, preset, durationLabel, loading, uploadPhase, uploadPercent, onPublish,
}: {
  title: string
  thumbnailUri: string | null
  sp: number
  fp: number
  preset: SpeedPreset
  durationLabel: string
  loading: boolean
  uploadPhase: string
  uploadPercent: number
  onPublish: () => void
}) {
  const accent = PRESET_ACCENT[preset]
  const presetMeta = PRESETS.find((p) => p.key === preset)!

  return (
    <View style={s.publishWrap}>
      <Text style={s.publishHeadline}>Prêt à publier ?</Text>
      <Text style={s.publishSub}>Vérifiez les informations avant de lancer l'enchère.</Text>

      {/* Summary card */}
      <View style={s.summaryCard}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={s.summaryThumb} />
        ) : (
          <View style={[s.summaryThumb, s.summaryThumbFallback]}>
            <Ionicons name="videocam-outline" size={28} color={colors.border} />
          </View>
        )}
        <View style={s.summaryInfo}>
          <Text style={s.summaryTitle} numberOfLines={2}>{title}</Text>
          <View style={s.summaryRow}>
            <Text style={s.summaryPrice}>CHF {sp.toFixed(2)}</Text>
            <Ionicons name="arrow-down" size={12} color={colors.textSecondary} />
            <Text style={s.summaryFloor}>CHF {fp.toFixed(2)}</Text>
          </View>
          <View style={[s.summaryBadge, { backgroundColor: `${accent}22` }]}>
            <Text style={[s.summaryBadgeText, { color: accent }]}>
              {presetMeta.emoji} {presetMeta.label} · {durationLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Publish button */}
      <TouchableOpacity
        style={[s.publishBtn, loading && s.publishBtnLoading]}
        onPress={onPublish}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <View style={s.publishLoadingWrap}>
            <View style={s.publishProgressRow}>
              <Text style={s.publishBtnText}>{uploadPhase}</Text>
              <Text style={s.publishPercentText}>{uploadPercent}%</Text>
            </View>
            <View style={s.publishProgressTrack}>
              <View style={[s.publishProgressFill, { width: `${uploadPercent}%` }]} />
            </View>
          </View>
        ) : (
          <>
            <Ionicons name="rocket" size={20} color="#0F0F0F" style={{ marginRight: 8 }} />
            <Text style={s.publishBtnText}>Publier le drop</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={s.publishDisclaimer}>
        En publiant, votre enchère sera immédiatement visible par tous les utilisateurs.
      </Text>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerStep: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textSecondary, letterSpacing: 0.5 },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.text, marginTop: 2 },

  // Progress
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 10 },
  progressSegmentOuter: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  progressSegment: { flex: 1, borderRadius: 2 },

  // Scroll
  scroll: { paddingHorizontal: spacing.md, paddingBottom: 100 },

  // Nav
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  prevBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4 },
  prevText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.text },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: 12,
  },
  nextBtnDisabled: { backgroundColor: colors.surfaceHigh },
  nextText: { fontFamily: fontFamily.bold, fontSize: 15, color: '#0F0F0F' },
  nextTextDisabled: { color: colors.textSecondary },

  // Step 1 – capture
  captureWrap: { paddingTop: spacing.lg },
  captureTitle: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.text, marginBottom: 6 },
  captureSub: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xl },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 14,
  },
  captureBtnIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnText: { flex: 1 },
  captureBtnTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.text },
  captureBtnSub: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Step 1 – video preview
  videoWrap: {
    marginTop: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
  },
  videoPreview: { width: '100%', height: '100%' },
  clearBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 999,
    padding: 6,
  },
  readyPill: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  readyText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#0F0F0F' },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  thumbImg: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.surfaceHigh },
  thumbLabel: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.text },
  thumbSub: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  hintText: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },

  // Step 2
  formWrap: { paddingTop: spacing.md },
  detailThumb: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceHigh,
  },
  fieldLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  titleInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontSize: 17,
  },
  descInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    height: 100,
  },
  counter: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },

  // Category
  catTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  catTriggerText: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.text },
  catBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  catSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  catHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginVertical: 10 },
  catSheetTitle: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text, marginBottom: 12 },
  catItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catItemActive: {},
  catItemText: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.text },
  catItemTextActive: { color: colors.primary, fontFamily: fontFamily.semiBold },

  // Step 3 – prices
  priceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: spacing.sm },
  priceCol: { flex: 1 },
  priceColLabel: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  chfTag: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.textSecondary, marginRight: 4 },
  priceInput: { flex: 1, fontFamily: fontFamily.bold, fontSize: 22, color: colors.text, paddingVertical: 12 },
  priceArrow: { alignSelf: 'center', marginTop: 24, paddingHorizontal: 2 },
  floorHint: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textSecondary, marginTop: 4 },
  priceError: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.error, marginTop: 8 },
  shippingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(0,210,184,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.20)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },
  shippingBannerText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  shippingBold: {
    fontFamily: fontFamily.semiBold,
    color: '#00D2B8',
  },

  // Presets
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  presetCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  presetEmoji: { fontSize: 22 },
  presetLabel: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.text, letterSpacing: 0.5 },
  presetTagline: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.textSecondary, textAlign: 'center' },

  // Chart
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chartTitle: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.text },
  chartPricePills: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartPriceFrom: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primary },
  chartPriceTo: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textSecondary },
  chartSummary: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.textSecondary, marginTop: 12, lineHeight: 18 },
  chartBold: { fontFamily: fontFamily.semiBold, color: colors.text },

  // Step 4
  publishWrap: { paddingTop: spacing.lg, alignItems: 'center' },
  publishHeadline: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.text, marginBottom: 6, textAlign: 'center' },
  publishSub: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    width: '100%',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  summaryThumb: { width: 80, height: 100, borderRadius: 10, backgroundColor: colors.surfaceHigh },
  summaryThumbFallback: { justifyContent: 'center', alignItems: 'center' },
  summaryInfo: { flex: 1, justifyContent: 'space-between' },
  summaryTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  summaryPrice: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.primary },
  summaryFloor: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textSecondary },
  summaryBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 8 },
  summaryBadgeText: { fontFamily: fontFamily.semiBold, fontSize: 11 },

  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 56,
    backgroundColor: colors.primary,
    borderRadius: 16,
    marginBottom: 14,
  },
  publishBtnLoading: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 20,
    height: 64,
  },
  publishLoadingWrap: { width: '100%' },
  publishProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  publishProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  publishProgressFill: {
    height: 4,
    backgroundColor: '#0F0F0F',
    borderRadius: 2,
  },
  publishPercentText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#0F0F0F',
  },
  publishBtnText: { fontFamily: fontFamily.bold, fontSize: 17, color: '#0F0F0F' },
  publishDisclaimer: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.lg,
  },

  // Success
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 16 },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.text },
  successSub: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
})
