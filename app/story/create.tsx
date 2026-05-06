import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Video, ResizeMode } from 'expo-av'
import { useState, useEffect } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useTranslation } from '../../lib/i18n'

const C = {
  bg: '#0F0F0F',
  primary: '#00D2B8',
  surface: '#1A1A1A',
  text: '#FFFFFF',
  muted: '#717976',
  danger: '#FF4757',
  warn: '#FFA502',
  border: '#2A2A2A',
}

type Step = 1 | 2 | 3
type SpeedPreset = 'FLASH' | 'STANDARD' | 'RELAX'
type DropInterval = 30 | 60 | 120
type DurationHours = 24 | 72 | 168

export default function CreateStoryScreen() {
  const { t } = useTranslation()
  const { relaunchId } = useLocalSearchParams<{ relaunchId?: string }>()
  const { profile } = useAuth()

  useEffect(() => {
    if (profile && profile.role !== 'seller') {
      router.replace('/become-seller')
    }
  }, [profile])

  const [step, setStep] = useState<Step>(1)
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [reusedVideoUrl, setReusedVideoUrl] = useState<string | null>(null)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startPrice, setStartPrice] = useState('')
  const [floorPrice, setFloorPrice] = useState('')
  const [dropInterval, setDropInterval] = useState<DropInterval>(60)
  const [speedPreset, setSpeedPreset] = useState<SpeedPreset>('STANDARD')
  const [durationHours, setDurationHours] = useState<DurationHours>(72)
  const [publishing, setPublishing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [prefilling, setPrefilling] = useState(!!relaunchId)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) =>
      setUserId(data.user?.id ?? null)
    )
  }, [])

  useEffect(() => {
    if (!relaunchId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('stories')
        .select('title, description, video_url, thumbnail_url, start_price_chf, floor_price_chf, speed_preset, duration_hours')
        .eq('id', relaunchId)
        .maybeSingle()
      if (cancelled || !data) { setPrefilling(false); return }
      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setStartPrice(String(data.start_price_chf ?? ''))
      setFloorPrice(String(data.floor_price_chf ?? ''))
      if (data.speed_preset) setSpeedPreset(data.speed_preset as SpeedPreset)
      if (data.duration_hours) {
        const dh = data.duration_hours as number
        if (dh === 24 || dh === 72 || dh === 168) setDurationHours(dh as DurationHours)
      }
      if (data.video_url) {
        setReusedVideoUrl(data.video_url)
        setVideoUri(data.video_url)
      }
      if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url)
      setPrefilling(false)
    })()
    return () => { cancelled = true }
  }, [relaunchId])

  const pickVideo = async (fromCamera = false) => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
      videoMaxDuration: 60,
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts)

    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri)
      setReusedVideoUrl(null)
      setErrors(e => ({ ...e, video: '' }))
    }
  }

  const validateStep1 = () => {
    if (!videoUri) {
      setErrors(e => ({ ...e, video: t('story.create.error_video') }))
      return false
    }
    return true
  }

  const validateStep2 = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = t('story.create.error_title')
    const sp = parseFloat(startPrice)
    const fp = parseFloat(floorPrice)
    if (!startPrice || isNaN(sp) || sp <= 0) errs.startPrice = t('story.create.error_price')
    if (!floorPrice || isNaN(fp) || fp <= 0 || fp >= sp)
      errs.floorPrice = t('story.create.error_price')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  const handleBack = () => {
    if (step === 1) router.back()
    else setStep((step - 1) as Step)
  }

  const handlePublish = async () => {
    if (!userId || !videoUri) return

    const { data: sellerProfile } = await supabase
      .from('seller_profiles')
      .select('stripe_onboarding_complete, stripe_account_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!sellerProfile?.stripe_onboarding_complete || !sellerProfile?.stripe_account_id) {
      setErrors(e => ({
        ...e,
        publish: "Ton compte vendeur n'est pas encore configuré. Termine l'inscription Stripe avant de publier.",
      }))
      return
    }

    setPublishing(true)
    setErrors(e => ({ ...e, publish: '' }))

    try {
      let finalVideoUrl: string
      let finalThumbnailUrl: string | null

      // If relaunching and video is already a remote URL, skip upload
      if (relaunchId && reusedVideoUrl && videoUri === reusedVideoUrl) {
        finalVideoUrl = reusedVideoUrl
        finalThumbnailUrl = thumbnailUrl
      } else {
        const path = `${userId}/${Date.now()}.mp4`
        let localUri = videoUri
        if (localUri.startsWith('ph://') || !localUri.startsWith('file://')) {
          const cacheUri = FileSystem.cacheDirectory + `upload_${Date.now()}.mp4`
          await FileSystem.copyAsync({ from: localUri, to: cacheUri })
          localUri = cacheUri
        }
        const base64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: 'base64',
        })
        const { error: uploadError } = await supabase.storage
          .from('stories')
          .upload(path, decode(base64), { contentType: 'video/mp4' })

        if (uploadError) throw uploadError

        const { data: { publicUrl: newUrl } } = supabase.storage
          .from('stories')
          .getPublicUrl(path)
        finalVideoUrl = newUrl
        finalThumbnailUrl = null
      }

      const expiresAt = new Date(
        Date.now() + durationHours * 60 * 60 * 1000
      ).toISOString()

      const { error: insertError } = await supabase.from('stories').insert({
        seller_id: userId,
        title,
        description,
        video_url: finalVideoUrl,
        thumbnail_url: finalThumbnailUrl,
        start_price_chf: parseFloat(startPrice),
        floor_price_chf: parseFloat(floorPrice),
        current_price_chf: parseFloat(startPrice),
        price_drop_seconds: 1,
        last_drop_at: new Date().toISOString(),
        speed_preset: speedPreset,
        duration_hours: durationHours,
        expires_at: expiresAt,
        status: 'active',
      })

      if (insertError) throw insertError

      // If this was a relaunch, hard-delete the old archived drop
      if (relaunchId) {
        await supabase
          .from('stories')
          .delete()
          .eq('id', relaunchId)
          .eq('seller_id', userId)
          .eq('status', 'expired')
      }

      router.replace('/(tabs)/index')
    } catch (err: any) {
      setPublishing(false)
      setErrors(e => ({ ...e, publish: err.message ?? t('story.create.error_upload') }))
    }
  }

  const videoFilename = videoUri ? videoUri.split('/').pop() ?? 'video.mp4' : ''
  const sp = parseFloat(startPrice)
  const fp = parseFloat(floorPrice)
  const showPricePreview = !isNaN(sp) && !isNaN(fp) && sp > 0 && fp > 0

  // ── Relaunch mode: single-page pre-filled form ──────────────────────────────
  if (relaunchId) {
    if (prefilling) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={[styles.flex, { justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        </SafeAreaView>
      )
    }

    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerSide}>
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Relancer le drop</Text>
            <View style={styles.headerSide} />
          </View>

          <RelaunchForm
            thumbnailUrl={thumbnailUrl}
            videoUri={videoUri}
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            startPrice={startPrice}
            setStartPrice={setStartPrice}
            floorPrice={floorPrice}
            setFloorPrice={setFloorPrice}
            speedPreset={speedPreset}
            setSpeedPreset={setSpeedPreset}
            durationHours={durationHours}
            setDurationHours={setDurationHours}
            errors={errors}
            publishing={publishing}
            onPublish={handlePublish}
            onPickVideo={() => pickVideo(false)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── Normal creation: 3-step wizard ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.headerSide}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('story.create.title')}</Text>
          <View style={styles.headerSide}>
            <Text style={styles.stepIndicator}>{step}/3</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressRow}>
          {([1, 2, 3] as Step[]).map(s => (
            <View
              key={s}
              style={[
                styles.progressSegment,
                s < step && { backgroundColor: C.primary },
                s === step && { backgroundColor: C.primary, opacity: 0.5 },
                s > step && { backgroundColor: C.border },
              ]}
            />
          ))}
        </View>

        {/* Step content */}
        {step === 1 && (
          <Step1
            videoUri={videoUri}
            videoFilename={videoFilename}
            error={errors.video}
            onPickVideo={() => pickVideo(false)}
            onRecordVideo={() => pickVideo(true)}
            onNext={handleNext}
          />
        )}
        {step === 2 && (
          <Step2
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            startPrice={startPrice}
            setStartPrice={setStartPrice}
            floorPrice={floorPrice}
            setFloorPrice={setFloorPrice}
            errors={errors}
            showPricePreview={showPricePreview}
            sp={sp}
            fp={fp}
            onNext={handleNext}
          />
        )}
        {step === 3 && (
          <Step3
            dropInterval={dropInterval}
            setDropInterval={setDropInterval}
            speedPreset={speedPreset}
            setSpeedPreset={setSpeedPreset}
            durationHours={durationHours}
            setDurationHours={setDurationHours}
            title={title}
            startPrice={startPrice}
            floorPrice={floorPrice}
            videoUri={videoUri}
            publishing={publishing}
            publishError={errors.publish}
            onPublish={handlePublish}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Relaunch Form ────────────────────────────────────────────────────────────

function RelaunchForm({
  thumbnailUrl,
  videoUri,
  title, setTitle,
  description, setDescription,
  startPrice, setStartPrice,
  floorPrice, setFloorPrice,
  speedPreset, setSpeedPreset,
  durationHours, setDurationHours,
  errors,
  publishing,
  onPublish,
  onPickVideo,
}: {
  thumbnailUrl: string | null
  videoUri: string | null
  title: string; setTitle: (v: string) => void
  description: string; setDescription: (v: string) => void
  startPrice: string; setStartPrice: (v: string) => void
  floorPrice: string; setFloorPrice: (v: string) => void
  speedPreset: SpeedPreset; setSpeedPreset: (v: SpeedPreset) => void
  durationHours: DurationHours; setDurationHours: (v: DurationHours) => void
  errors: Record<string, string>
  publishing: boolean
  onPublish: () => void
  onPickVideo: () => void
}) {
  const durations: DurationHours[] = [24, 72, 168]
  const speeds: { key: SpeedPreset; icon: string; label: string; sub: string }[] = [
    { key: 'FLASH',    icon: 'flash-outline', label: 'Flash',    sub: '−20% / drop' },
    { key: 'STANDARD', icon: 'time-outline',  label: 'Standard', sub: '−10% / drop' },
    { key: 'RELAX',    icon: 'leaf-outline',  label: 'Relax',    sub: '−5% / drop'  },
  ]
  const sp = parseFloat(startPrice)
  const fp = parseFloat(floorPrice)
  const previewOk = !isNaN(sp) && !isNaN(fp) && sp > 0 && fp > 0

  const preview = thumbnailUrl ?? videoUri

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.stepContent, { paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Video preview */}
        <View style={rlStyles.mediaRow}>
          <View style={rlStyles.thumbWrap}>
            {preview ? (
              <Image source={{ uri: preview }} style={rlStyles.thumb} resizeMode="cover" />
            ) : (
              <View style={[rlStyles.thumb, rlStyles.thumbPlaceholder]}>
                <Ionicons name="videocam-outline" size={28} color={C.muted} />
              </View>
            )}
            <View style={rlStyles.videoOverlay}>
              <Ionicons name="play-circle" size={28} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
          <View style={rlStyles.mediaInfo}>
            <Text style={rlStyles.mediaLabel}>Vidéo du drop</Text>
            <Text style={rlStyles.mediaHint} numberOfLines={2}>
              {videoUri ? 'Vidéo originale utilisée' : 'Aucune vidéo'}
            </Text>
            <TouchableOpacity style={rlStyles.changeVideoBtn} onPress={onPickVideo}>
              <Ionicons name="swap-horizontal" size={13} color={C.primary} />
              <Text style={rlStyles.changeVideoBtnText}>Changer la vidéo</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
          Vidéo du drop original · Tape "Changer" pour en choisir une autre
        </Text>

        {/* Title */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Titre</Text>
        <TextInput
          style={[styles.input, !!errors.title && styles.inputError]}
          placeholder="Nom du produit"
          placeholderTextColor={C.muted}
          value={title}
          onChangeText={setTitle}
        />
        {!!errors.title && <Text style={styles.errorText}>{errors.title}</Text>}

        {/* Description */}
        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          placeholder="Décrivez le produit (optionnel)"
          placeholderTextColor={C.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Prices */}
        <View style={rlStyles.pricesRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Prix de départ</Text>
            <View style={[styles.priceRow, { marginTop: 6 }, !!errors.startPrice && styles.inputError]}>
              <Text style={styles.chfPrefix}>CHF</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="0.00"
                placeholderTextColor={C.muted}
                value={startPrice}
                onChangeText={setStartPrice}
                keyboardType="numeric"
              />
            </View>
            {!!errors.startPrice && <Text style={styles.errorText}>{errors.startPrice}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Prix plancher</Text>
            <View style={[styles.priceRow, { marginTop: 6 }, !!errors.floorPrice && styles.inputError]}>
              <Text style={styles.chfPrefix}>CHF</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="0.00"
                placeholderTextColor={C.muted}
                value={floorPrice}
                onChangeText={setFloorPrice}
                keyboardType="numeric"
              />
            </View>
            {!!errors.floorPrice && <Text style={styles.errorText}>{errors.floorPrice}</Text>}
          </View>
        </View>

        {previewOk && (
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Prix de départ</Text>
              <Text style={[styles.previewValue, { color: C.primary }]}>CHF {sp.toFixed(2)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Prix plancher</Text>
              <Text style={[styles.previewValue, { color: C.muted }]}>CHF {fp.toFixed(2)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Economie max</Text>
              <Text style={[styles.previewValue, { color: C.warn }]}>CHF {(sp - fp).toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Speed */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Amplitude de baisse</Text>
        {speeds.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.speedCard, speedPreset === s.key && styles.speedCardActive]}
            onPress={() => setSpeedPreset(s.key)}
          >
            <Ionicons name={s.icon as any} size={20} color={speedPreset === s.key ? C.primary : C.muted} />
            <View style={styles.speedCardText}>
              <Text style={[styles.speedCardLabel, speedPreset === s.key && { color: C.primary }]}>
                {s.label}
              </Text>
              <Text style={styles.speedCardSub}>{s.sub}</Text>
            </View>
            {speedPreset === s.key && (
              <Ionicons name="checkmark-circle" size={18} color={C.primary} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        ))}

        {/* Duration */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Durée du drop</Text>
        <View style={styles.segmentedRow}>
          {durations.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.segment, durationHours === d && styles.segmentActive]}
              onPress={() => setDurationHours(d)}
            >
              <Text style={[styles.segmentText, durationHours === d && styles.segmentTextActive]}>
                {d === 168 ? '7j' : `${d}h`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!errors.publish && (
          <Text style={[styles.errorText, { marginTop: 12 }]}>{errors.publish}</Text>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.publishBtn, publishing && { opacity: 0.7 }]}
          onPress={onPublish}
          disabled={publishing}
        >
          {publishing ? (
            <>
              <ActivityIndicator color="#0F0F0F" />
              <Text style={[styles.publishBtnText, { marginLeft: 10 }]}>Publication...</Text>
            </>
          ) : (
            <Text style={styles.publishBtnText}>Publier le drop</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const rlStyles = StyleSheet.create({
  mediaRow: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  thumbWrap: {
    width: 72,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: { width: 72, height: 90 },
  thumbPlaceholder: {
    backgroundColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoOverlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  mediaInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  mediaLabel: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
  },
  mediaHint: {
    color: C.muted,
    fontSize: 12,
  },
  changeVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  changeVideoBtnText: {
    color: C.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  pricesRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
})

// ─── Step 1 ──────────────────────────────────────────────────────────────────

function Step1({
  videoUri,
  videoFilename,
  error,
  onPickVideo,
  onRecordVideo,
  onNext,
}: {
  videoUri: string | null
  videoFilename: string
  error?: string
  onPickVideo: () => void
  onRecordVideo: () => void
  onNext: () => void
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.step1Content}
        keyboardShouldPersistTaps="handled"
      >
        {!videoUri ? (
          <View style={styles.step1EmptyWrap}>
            <TouchableOpacity style={styles.dashedBox} onPress={onPickVideo}>
              <Ionicons name="videocam-outline" size={48} color={C.muted} />
              <Text style={styles.dashedBoxTitle}>{t('story.create.pick_video')}</Text>
              <Text style={styles.dashedBoxTip}>{t('story.create.video_tip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlinedBtn} onPress={onRecordVideo}>
              <Text style={styles.outlinedBtnText}>{t('story.create.record_video')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Video
              source={{ uri: videoUri }}
              style={styles.videoPreview}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted
            />
            <View style={styles.videoMeta}>
              <Ionicons name="checkmark-circle" size={18} color={C.primary} />
              <Text style={styles.videoFilename} numberOfLines={1}>{videoFilename}</Text>
              <TouchableOpacity onPress={onPickVideo}>
                <Text style={styles.changeBtn}>Changer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onNext}>
          <Text style={styles.primaryBtnText}>{t('common.next')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────

function Step2({
  title, setTitle,
  description, setDescription,
  startPrice, setStartPrice,
  floorPrice, setFloorPrice,
  errors,
  showPricePreview, sp, fp,
  onNext,
}: {
  title: string; setTitle: (v: string) => void
  description: string; setDescription: (v: string) => void
  startPrice: string; setStartPrice: (v: string) => void
  floorPrice: string; setFloorPrice: (v: string) => void
  errors: Record<string, string>
  showPricePreview: boolean
  sp: number; fp: number
  onNext: () => void
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text style={styles.fieldLabel}>{t('story.create.listing_title')}</Text>
        <TextInput
          style={[styles.input, !!errors.title && styles.inputError]}
          placeholder={t('story.create.listing_title_placeholder')}
          placeholderTextColor={C.muted}
          value={title}
          onChangeText={setTitle}
        />
        {!!errors.title && <Text style={styles.errorText}>{errors.title}</Text>}

        {/* Description */}
        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t('story.create.description')}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          placeholder={t('story.create.description_placeholder')}
          placeholderTextColor={C.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Start price */}
        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t('story.create.start_price')}</Text>
        <View style={[styles.priceRow, !!errors.startPrice && styles.inputError]}>
          <Text style={styles.chfPrefix}>CHF</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor={C.muted}
            value={startPrice}
            onChangeText={setStartPrice}
            keyboardType="numeric"
          />
        </View>
        {!!errors.startPrice && <Text style={styles.errorText}>{errors.startPrice}</Text>}

        {/* Floor price */}
        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t('story.create.floor_price')}</Text>
        <Text style={styles.subLabel}>{t('story.create.floor_price_tip')}</Text>
        <View style={[styles.priceRow, !!errors.floorPrice && styles.inputError]}>
          <Text style={styles.chfPrefix}>CHF</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor={C.muted}
            value={floorPrice}
            onChangeText={setFloorPrice}
            keyboardType="numeric"
          />
        </View>
        {!!errors.floorPrice && <Text style={styles.errorText}>{errors.floorPrice}</Text>}

        {/* Price preview */}
        {showPricePreview && (
          <View style={styles.previewCard}>
            <PriceRow label="Prix de départ" value={`CHF ${sp.toFixed(2)}`} valueColor={C.primary} />
            <PriceRow label="Prix plancher" value={`CHF ${fp.toFixed(2)}`} valueColor={C.muted} />
            <PriceRow label="Économie max" value={`CHF ${(sp - fp).toFixed(2)}`} valueColor={C.warn} />
          </View>
        )}
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onNext}>
          <Text style={styles.primaryBtnText}>{t('common.next')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function PriceRow({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={[styles.previewValue, { color: valueColor }]}>{value}</Text>
    </View>
  )
}

// ─── Step 3 ──────────────────────────────────────────────────────────────────

function Step3({
  dropInterval, setDropInterval,
  speedPreset, setSpeedPreset,
  durationHours, setDurationHours,
  title, startPrice, floorPrice, videoUri,
  publishing, publishError,
  onPublish,
}: {
  dropInterval: DropInterval; setDropInterval: (v: DropInterval) => void
  speedPreset: SpeedPreset; setSpeedPreset: (v: SpeedPreset) => void
  durationHours: DurationHours; setDurationHours: (v: DurationHours) => void
  title: string; startPrice: string; floorPrice: string; videoUri: string | null
  publishing: boolean; publishError?: string
  onPublish: () => void
}) {
  const { t } = useTranslation()
  const intervals: DropInterval[] = [30, 60, 120]
  const durations: DurationHours[] = [24, 72, 168]

  const speeds: { key: SpeedPreset; icon: string; label: string; sub: string }[] = [
    { key: 'FLASH',    icon: 'flash-outline', label: 'Flash',    sub: '−20% / drop' },
    { key: 'STANDARD', icon: 'time-outline',  label: 'Standard', sub: '−10% / drop' },
    { key: 'RELAX',    icon: 'leaf-outline',  label: 'Relax',    sub: '−5% / drop'  },
  ]

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Interval */}
        <Text style={styles.fieldLabel}>{t('story.create.price_drop_interval')}</Text>
        <View style={styles.segmentedRow}>
          {intervals.map(iv => (
            <TouchableOpacity
              key={iv}
              style={[styles.segment, dropInterval === iv && styles.segmentActive]}
              onPress={() => setDropInterval(iv)}
            >
              <Text style={[styles.segmentText, dropInterval === iv && styles.segmentTextActive]}>
                {iv}s
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Speed */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Amplitude de baisse</Text>
        {speeds.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.speedCard, speedPreset === s.key && styles.speedCardActive]}
            onPress={() => setSpeedPreset(s.key)}
          >
            <Ionicons name={s.icon as any} size={22} color={speedPreset === s.key ? C.primary : C.muted} />
            <View style={styles.speedCardText}>
              <Text style={[styles.speedCardLabel, speedPreset === s.key && { color: C.primary }]}>
                {s.label}
              </Text>
              <Text style={styles.speedCardSub}>{s.sub}</Text>
            </View>
            {speedPreset === s.key && (
              <Ionicons name="checkmark-circle" size={18} color={C.primary} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>
        ))}

        {/* Duration */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>{t('story.create.duration')}</Text>
        <View style={styles.segmentedRow}>
          {durations.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.segment, durationHours === d && styles.segmentActive]}
              onPress={() => setDurationHours(d)}
            >
              <Text style={[styles.segmentText, durationHours === d && styles.segmentTextActive]}>
                {d === 168 ? '7j' : `${d}h`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Récapitulatif</Text>
          <SummaryRow label="Vidéo" value={<Ionicons name="checkmark" size={16} color={C.primary} />} />
          <SummaryRow label="Titre" value={title} truncate />
          <SummaryRow label="Prix départ" value={`CHF ${startPrice}`} highlight />
          <SummaryRow label="Prix plancher" value={`CHF ${floorPrice}`} muted />
          <SummaryRow label="Baisse toutes les" value={`${dropInterval}s`} muted />
          <SummaryRow label="Expire dans" value={`${durationHours}h`} muted />
        </View>

        {!!publishError && (
          <Text style={[styles.errorText, { marginTop: 8 }]}>{publishError}</Text>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.publishBtn, publishing && { opacity: 0.7 }]}
          onPress={onPublish}
          disabled={publishing}
        >
          {publishing ? (
            <>
              <ActivityIndicator color="#0F0F0F" />
              <Text style={[styles.publishBtnText, { marginLeft: 10 }]}>
                {t('story.create.publishing')}
              </Text>
            </>
          ) : (
            <Text style={styles.publishBtnText}>{t('story.create.publish')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

function SummaryRow({
  label, value, truncate, highlight, muted,
}: {
  label: string
  value: string | React.ReactNode
  truncate?: boolean
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text
          style={[
            styles.summaryValue,
            highlight && { color: C.primary },
            muted && { color: C.muted },
          ]}
          numberOfLines={truncate ? 1 : undefined}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerSide: { width: 48, alignItems: 'flex-end' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: C.text,
    fontSize: 16,
    fontWeight: '600',
  },
  stepIndicator: { color: C.muted, fontSize: 13 },

  // Progress
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 4,
    marginBottom: 8,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.border,
  },

  // Step 1
  step1Content: { flexGrow: 1, padding: 16 },
  step1EmptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dashedBox: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    borderStyle: 'dashed',
    padding: 40,
    alignItems: 'center',
    width: '100%',
  },
  dashedBoxTitle: {
    color: C.text,
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  dashedBoxTip: {
    color: C.muted,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  outlinedBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.primary,
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outlinedBtnText: { color: C.primary, fontSize: 15, fontWeight: '600' },
  videoPreview: {
    height: 420,
    borderRadius: 16,
    backgroundColor: C.surface,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  videoFilename: { flex: 1, color: C.muted, fontSize: 13 },
  changeBtn: { color: C.primary, fontSize: 14, fontWeight: '600' },

  // Shared step content
  stepContent: { padding: 16, paddingBottom: 32 },

  // Fields
  fieldLabel: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  subLabel: { color: C.muted, fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    color: C.text,
    fontSize: 15,
    marginTop: 6,
  },
  inputMulti: { height: 88, textAlignVertical: 'top' },
  inputError: { borderColor: C.danger },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  chfPrefix: { color: C.muted, fontSize: 15, marginRight: 8 },
  priceInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 14 },
  errorText: { color: C.danger, fontSize: 12, marginTop: 4 },

  // Price preview
  previewCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewLabel: { color: C.muted, fontSize: 13 },
  previewValue: { fontSize: 13, fontWeight: '600' },

  // Segmented control
  segmentedRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  segment: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  segmentText: { color: C.text, fontSize: 14, fontWeight: '500' },
  segmentTextActive: { color: '#0F0F0F', fontWeight: '700' },

  // Speed cards
  speedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 14,
  },
  speedCardActive: { borderWidth: 1.5, borderColor: C.primary },
  speedCardText: { flex: 1 },
  speedCardLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  speedCardSub: { color: C.muted, fontSize: 12, marginTop: 2 },

  // Summary
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  summaryTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: { color: C.muted, fontSize: 13 },
  summaryValue: { color: C.text, fontSize: 13, maxWidth: '60%' },

  // Bottom bar
  bottomBar: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  primaryBtn: {
    backgroundColor: C.primary,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0F0F0F', fontSize: 16, fontWeight: '700' },
  publishBtn: {
    backgroundColor: C.primary,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishBtnText: { color: '#0F0F0F', fontSize: 17, fontWeight: '700' },
})
