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
  PanResponder,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { Video as AvVideo, ResizeMode } from 'expo-av'
import Animated from 'react-native-reanimated'
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { useTranslation } from '../../../lib/i18n'
import { colors, fontFamily, spacing, fontSize } from '../../../lib/theme'

const { width: SW } = Dimensions.get('window')

// ─── Types & constants ────────────────────────────────────────────────────────

type SpeedPreset = 'FLASH' | 'STANDARD' | 'RELAX'

const DURATION: Record<SpeedPreset, { label: string; hours: number; ms: number }> = {
  FLASH:    { label: '1h',     hours: 1,   ms: 1   * 60 * 60 * 1000 },
  STANDARD: { label: '24h',   hours: 24,  ms: 24  * 60 * 60 * 1000 },
  RELAX:    { label: '7 jours', hours: 168, ms: 7 * 24 * 60 * 60 * 1000 },
}

const CATEGORY_KEYS: { value: string; emoji: string; labelKey: string }[] = [
  { value: 'sneakers',    emoji: '👟', labelKey: 'Sneakers' },
  { value: 'vetements',   emoji: '👕', labelKey: 'Vêtements' },
  { value: 'accessoires', emoji: '👜', labelKey: 'Accessoires' },
  { value: 'montres',     emoji: '⌚', labelKey: 'Montres' },
  { value: 'tech',        emoji: '📱', labelKey: 'Tech' },
  { value: 'gaming',      emoji: '🎮', labelKey: 'Gaming' },
  { value: 'maison',      emoji: '🏠', labelKey: 'Maison & Déco' },
  { value: 'livres',      emoji: '📚', labelKey: 'Livres & Culture' },
  { value: 'sport',       emoji: '⚽', labelKey: 'Sport & Outdoor' },
  { value: 'art',         emoji: '🎨', labelKey: 'Art & Collection' },
  { value: 'beaute',      emoji: '🧴', labelKey: 'Beauté' },
  { value: 'auto',        emoji: '🚗', labelKey: 'Auto & Moto' },
  { value: 'autre',       emoji: '🎁', labelKey: 'Autre' },
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

// ─── Category picker ──────────────────────────────────────────────────────────

function CategoryPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selected = CATEGORY_KEYS.find((c) => c.value === value)
  return (
    <>
      <TouchableOpacity style={s.catTrigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={[s.catTriggerText, !value && { color: colors.textSecondary }]}>
          {selected ? `${selected.emoji} ${selected.labelKey}` : t('story.create.category_placeholder')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.catBackdrop} onPress={() => setOpen(false)} />
        <View style={s.catSheet}>
          <View style={s.catHandle} />
          <Text style={s.catSheetTitle}>{t('story.create.field_category')}</Text>
          {CATEGORY_KEYS.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[s.catItem, value === c.value && s.catItemActive]}
              onPress={() => { onChange(c.value); setOpen(false) }}
            >
              <Text style={[s.catItemText, value === c.value && s.catItemTextActive]}>{c.emoji} {c.labelKey}</Text>
              {value === c.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </>
  )
}

// ─── Frame picker modal ───────────────────────────────────────────────────────

function FramePickerModal({
  visible,
  videoUri,
  videoDurationSeconds,
  onConfirm,
  onCancel,
}: {
  visible: boolean
  videoUri: string
  videoDurationSeconds: number
  onConfirm: (thumbUri: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null)
  const [capturingFrame, setCapturingFrame] = useState(false)
  const [sliderValue, setSliderValue] = useState(0) // seconds
  const trackWidth = useRef(0)
  const thumbX = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const captureFrame = useCallback(async (seconds: number) => {
    if (!videoUri) return
    setCapturingFrame(true)
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: Math.round(seconds * 1000),
        quality: 0.8,
      })
      setPreviewThumbnail(uri)
    } catch {
      // keep last preview
    } finally {
      setCapturingFrame(false)
    }
  }, [videoUri])

  // Capture initial frame when modal opens
  useEffect(() => {
    if (!visible) return
    setSliderValue(0)
    thumbX.current = 0
    captureFrame(0)
  }, [visible, captureFrame])

  const onSliderMove = useCallback((newSeconds: number) => {
    const clamped = Math.min(Math.max(newSeconds, 0), videoDurationSeconds)
    setSliderValue(clamped)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      captureFrame(clamped)
    }, 300)
  }, [videoDurationSeconds, captureFrame])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const w = trackWidth.current
        if (w <= 0) return
        const tapX = e.nativeEvent.locationX
        thumbX.current = Math.min(Math.max(tapX, 0), w)
        const secs = (thumbX.current / w) * videoDurationSeconds
        onSliderMove(secs)
      },
      onPanResponderMove: (_, gs) => {
        const w = trackWidth.current
        if (w <= 0) return
        const newX = Math.min(Math.max(thumbX.current + gs.dx, 0), w)
        const secs = (newX / w) * videoDurationSeconds
        setSliderValue(secs)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(() => {
          captureFrame(secs)
          thumbX.current = newX
        }, 300)
      },
      onPanResponderRelease: (_, gs) => {
        const w = trackWidth.current
        if (w <= 0) return
        const newX = Math.min(Math.max(thumbX.current + gs.dx, 0), w)
        thumbX.current = newX
        const secs = (newX / w) * videoDurationSeconds
        setSliderValue(secs)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        captureFrame(secs)
      },
    })
  ).current

  const thumbPosition = trackWidth.current > 0
    ? (sliderValue / Math.max(videoDurationSeconds, 1)) * trackWidth.current
    : 0

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={fp.root}>
        <Text style={fp.title}>{t('story.create.frame_picker_title')}</Text>
        <Text style={fp.subtitle}>
          {t('story.create.frame_picker_subtitle')}
        </Text>

        {/* Preview */}
        <View style={fp.previewWrap}>
          {previewThumbnail ? (
            <Image source={{ uri: previewThumbnail }} style={fp.previewImg} resizeMode="cover" />
          ) : (
            <View style={[fp.previewImg, fp.previewPlaceholder]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          {capturingFrame && (
            <View style={fp.capturingOverlay}>
              <ActivityIndicator color="#FFFFFF" size="large" />
            </View>
          )}
        </View>

        {/* Slider */}
        <View style={fp.sliderSection}>
          <View
            style={fp.trackContainer}
            onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width }}
            {...panResponder.panHandlers}
          >
            <View style={fp.track}>
              <View style={[fp.trackFill, { width: `${(sliderValue / Math.max(videoDurationSeconds, 1)) * 100}%` }]} />
            </View>
            <View style={[fp.thumb, { left: thumbPosition - 12 }]} />
          </View>
          <View style={fp.sliderLabels}>
            <Text style={fp.sliderLabel}>0s</Text>
            <Text style={fp.sliderLabelCenter}>{formatSec(sliderValue)}</Text>
            <Text style={fp.sliderLabel}>{formatSec(videoDurationSeconds)}</Text>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[fp.confirmBtn, (!previewThumbnail || capturingFrame) && { opacity: 0.5 }]}
          onPress={() => previewThumbnail && onConfirm(previewThumbnail)}
          disabled={!previewThumbnail || capturingFrame}
          activeOpacity={0.85}
        >
          <Text style={fp.confirmBtnText}>{t('story.create.frame_picker_confirm')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={fp.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={fp.cancelBtnText}>{t('story.create.frame_picker_change')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

// ─── R2 upload helper ─────────────────────────────────────────────────────────

async function uploadToR2(opts: {
  session: { access_token: string }
  bucket: 'story-videos' | 'story-thumbnails' | 'listing-images'
  filename: string
  base64: string
  contentType: string
}): Promise<string> {
  const { session, bucket, filename, base64, contentType } = opts
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/r2-presign`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucket, filename, contentType }),
    }
  )
  const { presignedUrl, publicUrl, error } = await res.json()
  if (error) throw new Error(error)
  const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: binary,
  })
  if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`)
  return publicUrl
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreateDropScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const { t } = useTranslation()
  const { relaunchId } = useLocalSearchParams<{ relaunchId?: string }>()
  const isRelaunch = !!relaunchId

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
  const [showFramePicker, setShowFramePicker] = useState(false)
  // Step 2
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [, setCondition] = useState('')
  const [generating, setGenerating] = useState(false)

  // Step 3
  const [startPrice, setStartPrice] = useState('')
  const [floorPrice, setFloorPrice] = useState('')
  const [preset, setPreset] = useState<SpeedPreset>('STANDARD')
  const [, setDurationHours] = useState<number | null>(null)

  // Relaunch: prefill all fields from previous drop
  useEffect(() => {
    if (!relaunchId) return
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from('stories')
        .select('title, description, category, condition, start_price_chf, floor_price_chf, price_drop_seconds, duration_hours, speed_preset, thumbnail_url, video_url')
        .eq('id', relaunchId)
        .maybeSingle()
      if (!mounted || !data) return
      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setCategory(data.category ?? '')
      setCondition((data as any).condition ?? '')
      setStartPrice(data.start_price_chf?.toString() ?? '')
      setFloorPrice(data.floor_price_chf?.toString() ?? '')
      const sp = (data.speed_preset as SpeedPreset) ?? 'STANDARD'
      setPreset(sp && DURATION[sp] ? sp : 'STANDARD')
      setDurationHours(data.duration_hours ?? 72)
      if (data.video_url) setVideoUri(data.video_url)
      if (data.thumbnail_url) setThumbnailUri(data.thumbnail_url)
    })()
    return () => { mounted = false }
  }, [relaunchId])

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
      const { uri: t } = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.6 })
      return t
    } catch { return null }
  }

  const getFileSizeMB = async (uri: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true }) as FileSystem.FileInfo & { size?: number }
      if (!info.exists || typeof info.size !== 'number') return 0
      return info.size / (1024 * 1024)
    } catch {
      return 0
    }
  }

  const handleVideoSelected = async (asset: ImagePicker.ImagePickerAsset) => {
    const assetDurationMs = asset.duration ?? null

    if (assetDurationMs != null && assetDurationMs > 30000) {
      Alert.alert(t('story.create.video_too_long_title'), t('story.create.video_too_long_message'))
      setVideoUri(null)
      setThumbnailUri(null)
      return
    }

    const durationSec = assetDurationMs != null && assetDurationMs > 0
      ? Math.min(Math.max(Math.round(assetDurationMs / 1000), 1), 30)
      : 30
    setVideoDurationSeconds(durationSec)
    setVideoUri(asset.uri)
    setShowFramePicker(true)

    const sizeMB = await getFileSizeMB(asset.uri)
    if (sizeMB > 30) {
      Alert.alert(
        t('story.create.video_heavy_title'),
        t('story.create.video_heavy_message', { size: sizeMB.toFixed(0) }),
        [
          { text: t('story.create.video_heavy_change'), style: 'cancel', onPress: () => { setVideoUri(null); setThumbnailUri(null) } },
          { text: t('story.create.video_heavy_continue'), onPress: () => {} },
        ]
      )
    }
  }

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('story.create.camera_denied_title'), t('story.create.camera_denied_message'))
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1.0,
      videoMaxDuration: 30,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
      allowsEditing: true,
      videoExportPreset: ImagePicker.VideoExportPreset.HighQuality,
    })
    if (!result.canceled && result.assets[0]) await handleVideoSelected(result.assets[0])
  }

  const launchGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1.0,
      videoMaxDuration: 30,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
      allowsEditing: true,
      videoExportPreset: ImagePicker.VideoExportPreset.HighQuality,
    })
    if (!result.canceled && result.assets[0]) await handleVideoSelected(result.assets[0])
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      let imageBase64: string | null = null

      const isLocal = (uri: string) =>
        uri.startsWith('file://') || uri.startsWith('ph://')

      if (thumbnailUri && isLocal(thumbnailUri)) {
        imageBase64 = await FileSystem.readAsStringAsync(thumbnailUri, { encoding: 'base64' })
      } else if (videoUri && isLocal(videoUri)) {
        try {
          const { uri: frameUri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000, quality: 0.6 })
          imageBase64 = await FileSystem.readAsStringAsync(frameUri, { encoding: 'base64' })
        } catch {
          imageBase64 = null
        }
      } else if (thumbnailUri && thumbnailUri.startsWith('https://')) {
        const cacheUri = FileSystem.cacheDirectory + `thumb_ai_${Date.now()}.jpg`
        const { uri: downloaded } = await FileSystem.downloadAsync(thumbnailUri, cacheUri)
        imageBase64 = await FileSystem.readAsStringAsync(downloaded, { encoding: 'base64' })
      }

      const body = imageBase64
        ? JSON.stringify({ imageBase64, mimeType: 'image/jpeg' })
        : JSON.stringify({ textOnly: true, hint: title || 'item for sale' })

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-drop-info`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body,
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erreur')

      if (data.title) setTitle(data.title)
      if (data.description) setDescription(data.description)
      if (data.category) setCategory(data.category)
    } catch (err: unknown) {
      Alert.alert(t('story.create.ai_error_title'), err instanceof Error ? err.message : t('story.create.ai_error_message'))
    } finally {
      setGenerating(false)
    }
  }, [thumbnailUri, videoUri, title, t])

  // ── navigation ─────────────────────────────────────────────────────────────

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const goPrev = () => setStep((s) => Math.max(s - 1, 1))

  const handleCancel = () => {
    Alert.alert(
      t('story.create.cancel_confirm_title'),
      t('story.create.cancel_confirm_message'),
      [
        { text: t('story.create.cancel_confirm_continue'), style: 'cancel' },
        { text: t('story.create.cancel_confirm_discard'), style: 'destructive', onPress: () => router.back() },
      ]
    )
  }

  // ── publish ────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    const phases = {
      preparing: t('story.create.upload_phase_preparing'),
      copying: t('story.create.upload_phase_copying'),
      reading: t('story.create.upload_phase_reading'),
      sending: t('story.create.upload_phase_sending'),
      thumbnail: t('story.create.upload_phase_thumbnail'),
      finalizing: t('story.create.upload_phase_finalizing'),
      published: t('story.create.upload_phase_published'),
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Alert.alert(t('common.error'), t('common.error'))

    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('stripe_onboarding_complete, stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const isOnboarded =
      (sellerProfile?.stripe_onboarding_complete && sellerProfile?.stripe_account_id) ||
      profileData?.role === 'seller'

    if (!isOnboarded) {
      Alert.alert(
        t('story.create.seller_incomplete_title'),
        t('story.create.seller_incomplete_message'),
        [
          { text: t('story.create.seller_incomplete_later'), style: 'cancel' },
          { text: t('story.create.seller_incomplete_setup'), onPress: () => router.push('/become-seller') },
        ]
      )
      return
    }

    setLoading(true)
    setUploadPercent(0)
    setUploadPhase(phases.preparing)
    try {
      const isLocalVideo =
        !!videoUri && (videoUri.startsWith('file://') || videoUri.startsWith('ph://'))
      const isRelaunchReuse = !!relaunchId && !isLocalVideo

      let publicUrl: string
      let thumbnailPublicUrl: string | null = null

      if (isRelaunchReuse) {
        setUploadPercent(75)
        publicUrl = videoUri!
        thumbnailPublicUrl = thumbnailUri ?? null
      } else {
        // Step 1 — copy to cache if needed (5%)
        let localUri = videoUri!
        if (localUri.startsWith('ph://') || !localUri.startsWith('file://')) {
          setUploadPhase(phases.copying)
          setUploadPercent(5)
          const cacheUri = FileSystem.cacheDirectory + `upload_${Date.now()}.mp4`
          await FileSystem.copyAsync({ from: localUri, to: cacheUri })
          localUri = cacheUri
        }

        // Step 2 — read video (15%)
        setUploadPhase(phases.reading)
        setUploadPercent(15)
        const preflight = await FileSystem.getInfoAsync(localUri, { size: true }) as FileSystem.FileInfo & { size?: number }
        if (preflight.exists && typeof preflight.size === 'number' && preflight.size / (1024 * 1024) > 100) {
          throw new Error(t('story.create.upload_too_large'))
        }
        const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' })

        // Step 3 — upload video (60%)
        setUploadPhase(phases.sending)
        setUploadPercent(30)
        const { data: { session: uploadSession } } = await supabase.auth.getSession()
        if (!uploadSession) throw new Error('Not authenticated')

        publicUrl = await uploadToR2({
          session: uploadSession,
          bucket: 'story-videos',
          filename: `${Date.now()}.mp4`,
          base64,
          contentType: 'video/mp4',
        })
        setUploadPercent(60)

        // Step 4 — upload thumbnail (75%)
        if (thumbnailUri && (thumbnailUri.startsWith('file://') || thumbnailUri.startsWith('ph://'))) {
          try {
            setUploadPhase(phases.thumbnail)
            setUploadPercent(65)
            const thumbBase64 = await FileSystem.readAsStringAsync(thumbnailUri, { encoding: 'base64' })
            thumbnailPublicUrl = await uploadToR2({
              session: uploadSession,
              bucket: 'story-thumbnails',
              filename: `${Date.now()}_thumb.jpg`,
              base64: thumbBase64,
              contentType: 'image/jpeg',
            })
            setUploadPercent(75)
          } catch {}
        } else if (thumbnailUri) {
          thumbnailPublicUrl = thumbnailUri
          setUploadPercent(75)
        } else {
          setUploadPercent(75)
        }
      }

      // Step 5 — insert record (100%)
      setUploadPhase(phases.finalizing)
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

      if (relaunchId) {
        await supabase
          .from('stories')
          .delete()
          .eq('id', relaunchId)
          .eq('seller_id', user.id)
          .eq('status', 'expired')
      }

      setUploadPercent(100)
      setUploadPhase(phases.published)
      setSuccess(true)
      await new Promise(resolve => setTimeout(resolve, 1500))
      try {
        router.replace('/(tabs)')
      } catch {
        try {
          router.push('/(tabs)')
        } catch {
          // silently fail — user can navigate manually
        }
      }
    } catch (err: unknown) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('common.error'))
      setUploadPercent(0)
      setUploadPhase('')
    } finally {
      setLoading(false)
    }
  }

  // ── can advance? ───────────────────────────────────────────────────────────

  const canNext =
    (step === 1 && videoUri !== null) ||
    (step === 2 && title.trim().length > 0) ||
    (step === 3 && startPrice !== '' && floorPrice !== '' && !floorGtStart) ||
    step === TOTAL_STEPS

  // ─── render ────────────────────────────────────────────────────────────────

  if (isRelaunch) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={handleCancel} style={s.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>{t('story.create.relaunch_title')}</Text>
          </View>
          <View style={s.headerBtn} />
        </View>

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
            <StepRelaunch
              videoUri={videoUri}
              thumbnailUri={thumbnailUri}
              onReplaceVideo={launchGallery}
              onCameraVideo={launchCamera}
              title={title} onTitle={setTitle}
              description={description} onDescription={setDescription}
              category={category} onCategory={setCategory}
              startPrice={startPrice} onStart={setStartPrice}
              floorPrice={floorPrice} onFloor={setFloorPrice}
              preset={preset} onPreset={setPreset}
              floorGtStart={floorGtStart}
              loading={loading}
              uploadPhase={uploadPhase}
              uploadPercent={uploadPercent}
              onPublish={handlePublish}
              onCancel={handleCancel}
            />
          </ScrollView>
        </KeyboardAvoidingView>
        {videoUri && (
          <FramePickerModal
            visible={showFramePicker}
            videoUri={videoUri}
            videoDurationSeconds={videoDurationSeconds}
            onConfirm={(thumbUri) => {
              setThumbnailUri(thumbUri)
              setShowFramePicker(false)
            }}
            onCancel={() => {
              setShowFramePicker(false)
              setVideoUri(null)
              setThumbnailUri(null)
            }}
          />
        )}
        {success && (
          <View style={s.successOverlay}>
            <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
            <Text style={s.successOverlayText}>{t('story.create.drop_published')}</Text>
          </View>
        )}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleCancel} style={s.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerStep}>{step} / {TOTAL_STEPS}</Text>
          <Text style={s.headerTitle}>{[t('story.create.step_video'), t('story.create.step_details'), t('story.create.step_pricing'), t('story.create.step_publish')][step - 1]}</Text>
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
              onGenerate={handleGenerate}
              generating={generating}
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
                <Text style={s.prevText}>{t('story.create.previous')}</Text>
              </TouchableOpacity>
            ) : <View style={s.prevBtn} />}

            <TouchableOpacity
              style={[s.nextBtn, !canNext && s.nextBtnDisabled]}
              onPress={goNext}
              disabled={!canNext}
              activeOpacity={0.85}
            >
              <Text style={[s.nextText, !canNext && s.nextTextDisabled]}>{t('common.next')}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={canNext ? '#0F0F0F' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {videoUri && (
        <FramePickerModal
          visible={showFramePicker}
          videoUri={videoUri}
          videoDurationSeconds={videoDurationSeconds}
          onConfirm={(thumbUri) => {
            setThumbnailUri(thumbUri)
            setShowFramePicker(false)
          }}
          onCancel={() => {
            setShowFramePicker(false)
            setVideoUri(null)
            setThumbnailUri(null)
          }}
        />
      )}
      {success && (
        <View style={s.successOverlay}>
          <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
          <Text style={s.successOverlayText}>{t('story.create.drop_published')}</Text>
        </View>
      )}
    </SafeAreaView>
  )
}


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
  const { t } = useTranslation()

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
            <Text style={s.readyText}>{t('story.create.video_ready')}</Text>
          </View>
        </View>
        {thumbnailUri && (
          <View style={s.thumbRow}>
            <Image source={{ uri: thumbnailUri }} style={s.thumbImg} />
            <View>
              <Text style={s.thumbLabel}>{t('story.create.thumbnail_generated')}</Text>
              <Text style={s.thumbSub}>{t('story.create.thumbnail_sub')}</Text>
            </View>
          </View>
        )}
        <Text style={s.hintText}>{t('story.create.hint_next')}</Text>
      </View>
    )
  }

  return (
    <View style={s.captureWrap}>
      <Text style={s.captureTitle}>{t('story.create.add_video')}</Text>
      <Text style={s.captureSub}>{t('story.create.add_video_sub')}</Text>

      <TouchableOpacity style={s.captureBtn} onPress={onCamera} activeOpacity={0.85}>
        <View style={s.captureBtnIcon}>
          <Ionicons name="videocam" size={32} color="#0F0F0F" />
        </View>
        <View style={s.captureBtnText}>
          <Text style={s.captureBtnTitle}>{t('story.create.record')}</Text>
          <Text style={s.captureBtnSub}>{t('story.create.record_sub')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      <TouchableOpacity style={s.captureBtn} onPress={onGallery} activeOpacity={0.85}>
        <View style={[s.captureBtnIcon, { backgroundColor: colors.surfaceHigh }]}>
          <Ionicons name="images" size={32} color={colors.primary} />
        </View>
        <View style={s.captureBtnText}>
          <Text style={s.captureBtnTitle}>{t('story.create.import')}</Text>
          <Text style={s.captureBtnSub}>{t('story.create.import_sub')}</Text>
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
  onGenerate,
  generating,
}: {
  title: string; onTitle: (s: string) => void
  description: string; onDescription: (s: string) => void
  category: string; onCategory: (s: string) => void
  thumbnailUri: string | null
  onGenerate: () => void
  generating: boolean
}) {
  const { t } = useTranslation()

  return (
    <View style={s.formWrap}>
      {thumbnailUri && (
        <Image source={{ uri: thumbnailUri }} style={s.detailThumb} />
      )}

      {thumbnailUri && (
        <>
          <TouchableOpacity
            style={[s.generateBtn, generating && { opacity: 0.7 }]}
            onPress={onGenerate}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? (
              <>
                <ActivityIndicator size="small" color="#0F0F0F" />
                <Text style={s.generateBtnText}>{t('story.create.generate_ai_loading')}</Text>
              </>
            ) : (
              <Text style={s.generateBtnText}>{t('story.create.generate_ai')}</Text>
            )}
          </TouchableOpacity>
          <Text style={s.generateBtnSub}>
            {t('story.create.generate_ai_sub')}
          </Text>
        </>
      )}

      <Text style={s.fieldLabel}>{t('story.create.field_title')}</Text>
      <TextInput
        style={s.titleInput}
        placeholder={t('story.create.listing_title_placeholder')}
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={(v) => onTitle(v.slice(0, 80))}
        returnKeyType="next"
        autoFocus
      />
      <Text style={s.counter}>{title.length}/80</Text>

      <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>{t('story.create.field_description')}</Text>
      <TextInput
        style={s.descInput}
        placeholder={t('story.create.description_placeholder')}
        placeholderTextColor={colors.textSecondary}
        value={description}
        onChangeText={(v) => onDescription(v.slice(0, 300))}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <Text style={s.counter}>{description.length}/300</Text>

      <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>{t('story.create.field_category')}</Text>
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
  const { t } = useTranslation()
  const hasPrices = sp > 0 && fp >= 0 && sp > fp

  const PRESETS: { key: SpeedPreset; emoji: string; label: string; tagline: string }[] = [
    { key: 'FLASH',    emoji: '⚡', label: 'FLASH',    tagline: '1h · ' + t('story.create.speed_fast')    },
    { key: 'STANDARD', emoji: '🎯', label: 'STANDARD', tagline: '24h · ' + t('story.create.speed_standard') },
    { key: 'RELAX',    emoji: '🌙', label: 'RELAX',    tagline: '7j · ' + t('story.create.speed_slow')    },
  ]

  return (
    <View style={s.formWrap}>
      {/* Price inputs */}
      <View style={s.priceRow}>
        <View style={s.priceCol}>
          <Text style={s.priceColLabel}>{t('story.create.price_start')}</Text>
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
          <Text style={s.priceColLabel}>{t('story.create.price_floor')}</Text>
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
          <Text style={s.floorHint}>{t('story.create.price_floor_hint')}</Text>
        </View>
      </View>

      {/* Shipping reminder */}
      <View style={s.shippingBanner}>
        <Ionicons name="cube-outline" size={14} color="#00D2B8" style={{ marginTop: 1 }} />
        <Text style={s.shippingBannerText}>
          <Text style={s.shippingBold}>{t('story.create.shipping_banner')}</Text>
          {' '}{t('story.create.shipping_banner_detail')}
        </Text>
      </View>

      {floorGtStart && (
        <Text style={s.priceError}>{t('story.create.price_floor_error')}</Text>
      )}

      {/* Speed presets */}
      <Text style={[s.fieldLabel, { marginTop: spacing.lg }]}>{t('story.create.speed_title')}</Text>
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
            <Text style={s.chartTitle}>{t('story.create.chart_title')}</Text>
            <View style={s.chartPricePills}>
              <Text style={s.chartPriceFrom}>CHF {sp.toFixed(0)}</Text>
              <Ionicons name="arrow-forward" size={12} color={colors.textSecondary} />
              <Text style={s.chartPriceTo}>CHF {fp.toFixed(0)}</Text>
            </View>
          </View>
          <PriceCurve startPrice={sp} floorPrice={fp} preset={preset} />
          <Text style={s.chartSummary}>
            {t('story.create.chart_summary_prefix')}{' '}
            <Text style={s.chartBold}>CHF {sp.toFixed(2)}</Text>
            {' '}{t('story.create.chart_summary_to')}{' '}
            <Text style={s.chartBold}>CHF {fp.toFixed(2)}</Text>
            {' '}{t('story.create.chart_summary_in')}{' '}
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
  const { t } = useTranslation()
  const accent = PRESET_ACCENT[preset]

  return (
    <View style={s.publishWrap}>
      <Text style={s.publishHeadline}>{t('story.create.publish_ready_title')}</Text>
      <Text style={s.publishSub}>{t('story.create.publish_ready_sub')}</Text>

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
              {preset === 'FLASH' ? '⚡' : preset === 'STANDARD' ? '🎯' : '🌙'} {preset} · {durationLabel}
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
            <Text style={s.publishBtnText}>{t('story.create.publish_btn')}</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={s.publishDisclaimer}>
        {t('story.create.publish_disclaimer')}
      </Text>
    </View>
  )
}

// ─── Step Relaunch: one-shot review ───────────────────────────────────────────

function StepRelaunch({
  videoUri,
  thumbnailUri,
  onReplaceVideo,
  onCameraVideo,
  title, onTitle,
  description, onDescription,
  category, onCategory,
  startPrice, onStart,
  floorPrice, onFloor,
  preset, onPreset,
  floorGtStart,
  loading,
  uploadPhase,
  uploadPercent,
  onPublish,
  onCancel,
}: {
  videoUri: string | null
  thumbnailUri: string | null
  onReplaceVideo: () => void
  onCameraVideo: () => void
  title: string; onTitle: (s: string) => void
  description: string; onDescription: (s: string) => void
  category: string; onCategory: (s: string) => void
  startPrice: string; onStart: (s: string) => void
  floorPrice: string; onFloor: (s: string) => void
  preset: SpeedPreset; onPreset: (p: SpeedPreset) => void
  floorGtStart: boolean
  loading: boolean
  uploadPhase: string
  uploadPercent: number
  onPublish: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  const showVideoActions = () => {
    Alert.alert(
      t('story.create.step_video'),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('story.create.record'), onPress: onCameraVideo },
        { text: t('story.create.import_sub'), onPress: onReplaceVideo },
      ]
    )
  }

  const canPublish =
    !loading &&
    title.trim().length > 0 &&
    startPrice !== '' &&
    floorPrice !== '' &&
    !floorGtStart &&
    !!videoUri

  return (
    <View style={s.formWrap}>
      <Text style={s.relaunchHeadline}>{t('story.create.relaunch_title')}</Text>
      <Text style={s.relaunchSub}>
        {t('story.create.relaunch_sub')}
      </Text>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={showVideoActions}
        style={s.relaunchVideoWrap}
      >
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={s.relaunchVideoImg} />
        ) : (
          <View style={[s.relaunchVideoImg, { justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="videocam-outline" size={32} color={colors.border} />
          </View>
        )}
        <View style={s.relaunchVideoOverlay}>
          <Ionicons name="create-outline" size={14} color="#FFFFFF" />
          <Text style={s.relaunchVideoOverlayText}>{t('story.create.relaunch_change_video')}</Text>
        </View>
      </TouchableOpacity>

      <Text style={s.fieldLabel}>{t('story.create.field_title')}</Text>
      <TextInput
        style={s.titleInput}
        placeholder={t('story.create.listing_title')}
        placeholderTextColor={colors.textSecondary}
        value={title}
        onChangeText={(v) => onTitle(v.slice(0, 80))}
        returnKeyType="next"
      />
      <Text style={s.counter}>{title.length}/80</Text>

      <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>{t('story.create.field_description')}</Text>
      <TextInput
        style={s.descInput}
        placeholder={t('story.create.description')}
        placeholderTextColor={colors.textSecondary}
        value={description}
        onChangeText={(v) => onDescription(v.slice(0, 300))}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <Text style={s.counter}>{description.length}/300</Text>

      <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>{t('story.create.field_category')}</Text>
      <CategoryPicker value={category} onChange={onCategory} />

      <View style={[s.priceRow, { marginTop: spacing.lg }]}>
        <View style={s.priceCol}>
          <Text style={s.priceColLabel}>{t('story.create.price_start')}</Text>
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
          <Text style={s.priceColLabel}>{t('story.create.price_floor')}</Text>
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
        </View>
      </View>
      {floorGtStart && (
        <Text style={s.priceError}>{t('story.create.price_floor_error')}</Text>
      )}

      <Text style={[s.fieldLabel, { marginTop: spacing.lg }]}>{t('story.create.speed_title')}</Text>
      <View style={s.presetRow}>
        {[
          { key: 'FLASH' as SpeedPreset, emoji: '⚡', label: 'FLASH', tagline: '1h · ' + t('story.create.speed_fast') },
          { key: 'STANDARD' as SpeedPreset, emoji: '🎯', label: 'STANDARD', tagline: '24h · ' + t('story.create.speed_standard') },
          { key: 'RELAX' as SpeedPreset, emoji: '🌙', label: 'RELAX', tagline: '7j · ' + t('story.create.speed_slow') },
        ].map((p) => {
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

      <TouchableOpacity
        style={[s.publishBtn, { marginTop: spacing.xl, width: '100%' }, loading && s.publishBtnLoading, !canPublish && { opacity: 0.5 }]}
        onPress={onPublish}
        disabled={!canPublish}
        activeOpacity={0.85}
      >
        {loading ? (
          <View style={s.publishLoadingWrap}>
            <View style={s.publishProgressRow}>
              <Text style={s.publishBtnText}>{uploadPhase || t('story.create.publishing')}</Text>
              <Text style={s.publishPercentText}>{uploadPercent}%</Text>
            </View>
            <View style={s.publishProgressTrack}>
              <View style={[s.publishProgressFill, { width: `${uploadPercent}%` }]} />
            </View>
          </View>
        ) : (
          <>
            <Ionicons name="rocket" size={20} color="#0F0F0F" style={{ marginRight: 8 }} />
            <Text style={s.publishBtnText}>{t('story.create.publish_btn')}</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={s.relaunchCancelBtn}
        onPress={onCancel}
        disabled={loading}
        activeOpacity={0.8}
      >
        <Text style={s.relaunchCancelText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
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

  // Relaunch banner
  relaunchBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(0,210,184,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.20)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  relaunchBannerText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  relaunchBannerAction: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  relaunchBannerActionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: '#00D2B8',
  },

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
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginBottom: 8,
  },
  generateBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#0F0F0F',
  },
  generateBtnSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
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


  // Relaunch review
  relaunchHeadline: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text,
    marginTop: spacing.sm,
  },
  relaunchSub: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  relaunchVideoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    marginBottom: spacing.md,
  },
  relaunchVideoImg: {
    width: '100%',
    height: '100%',
  },
  relaunchVideoOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  relaunchVideoOverlayText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  relaunchCancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  relaunchCancelText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },

  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  successOverlayText: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: '#FFFFFF',
  },
})

// ─── Frame picker styles ──────────────────────────────────────────────────────

const fp = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 19,
  },
  previewWrap: {
    width: '100%',
    height: 420,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 28,
  },
  previewImg: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderSection: {
    width: '100%',
    marginBottom: 32,
  },
  trackContainer: {
    width: '100%',
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  track: {
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  sliderLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  sliderLabelCenter: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primary,
  },
  confirmBtn: {
    width: '100%',
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#0F0F0F',
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
})
