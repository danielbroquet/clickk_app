import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  ActivityIndicator,
  Animated,
  PanResponder,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { ArrowLeft, Send } from 'lucide-react-native'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'
import { toCdnUrl } from '../../lib/cdn'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  id: string
  display_name: string | null
  username?: string | null
  avatar_url: string | null
}

interface StorySnippet {
  id: string
  title: string
  current_price_chf: number
  video_url: string
}

interface ConversationDetail {
  id: string
  buyer_id: string
  seller_id: string
  story: StorySnippet | null
  buyer: Participant
  seller: Participant
}

interface Message {
  id: string
  content: string
  sender_id: string
  created_at: string
  read_at: string | null
  message_type: 'text' | 'image' | 'audio'
  media_url: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

// ── Story mini-card ───────────────────────────────────────────────────────────

function StoryCard({ story }: { story: StorySnippet }) {
  return (
    <TouchableOpacity
      style={styles.storyCard}
      onPress={() => router.push(`/story/${story.id}`)}
      activeOpacity={0.8}
    >
      {story.video_url ? (
        <Image
          source={{ uri: toCdnUrl(story.video_url) ?? '' }}
          style={styles.storyThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.storyThumb, styles.storyThumbFallback]} />
      )}
      <View style={styles.storyInfo}>
        <Text style={styles.storyTitle} numberOfLines={1}>
          {story.title}
        </Text>
        <Text style={styles.storyPrice}>
          CHF {story.current_price_chf.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe, t }: { msg: Message; isMe: boolean; t: (key: string) => string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [playing, setPlaying] = useState(false)

  const playAudio = async () => {
    if (!msg.media_url) return
    if (sound) {
      if (playing) {
        await sound.pauseAsync()
        setPlaying(false)
      } else {
        await sound.playAsync()
        setPlaying(true)
      }
      return
    }
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: msg.media_url },
      { shouldPlay: true }
    )
    setSound(newSound)
    setPlaying(true)
    newSound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        setPlaying(false)
        setSound(null)
      }
    })
  }

  useEffect(() => {
    return () => { sound?.unloadAsync() }
  }, [sound])

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {msg.message_type === 'image' && msg.media_url ? (
          <Image
            source={{ uri: msg.media_url }}
            style={{ width: 200, height: 150, borderRadius: 8 }}
            resizeMode="cover"
          />
        ) : msg.message_type === 'audio' && msg.media_url ? (
          <TouchableOpacity
            onPress={playAudio}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 4 }}
          >
            <Ionicons
              name={playing ? 'pause-circle' : 'play-circle'}
              size={32}
              color={isMe ? '#0F0F0F' : colors.primary}
            />
            <View>
              <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther, { fontSize: 13 }]}>
                {t('conversation.voice_message')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 2, marginTop: 3 }}>
                {[...Array(12)].map((_, i) => (
                  <View key={i} style={{
                    width: 2, borderRadius: 1,
                    height: Math.random() * 14 + 4,
                    backgroundColor: isMe ? 'rgba(0,0,0,0.3)' : colors.primary,
                    opacity: playing ? 1 : 0.5,
                  }} />
                ))}
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
            {msg.content}
          </Text>
        )}
      </View>
      <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther]}>
        {formatTime(msg.created_at)}
      </Text>
    </View>
  )
}

// ── Swipeable message bubble ──────────────────────────────────────────────────

function SwipeableMessageBubble({ msg, isMe, onDelete, t }: {
  msg: Message
  isMe: boolean
  currentUserId: string
  onDelete: (id: string) => void
  t: (key: string) => string
}) {
  const translateX = useRef(new Animated.Value(0)).current

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        isMe && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(Math.max(g.dx, -80))
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          Alert.alert(
            t('conversation.delete_message_title'),
            t('conversation.delete_message_body'),
            [
              { text: t('common.cancel'), style: 'cancel', onPress: () => {
                Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
              }},
              { text: t('common.confirm'), style: 'destructive', onPress: () => onDelete(msg.id) },
            ]
          )
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    })
  ).current

  if (!isMe) {
    return <MessageBubble msg={msg} isMe={false} t={t} />
  }

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={{
        position: 'absolute',
        right: 16,
        top: 0,
        bottom: 0,
        width: 60,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <MessageBubble msg={msg} isMe={true} t={t} />
      </Animated.View>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const { t } = useTranslation()
  const currentUserId = session?.user?.id ?? ''

  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConv, setLoadingConv] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const [recording, setRecording] = useState<Audio.Recording | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [sendingMedia, setSendingMedia] = useState(false)
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const listRef = useRef<FlatList<Message>>(null)

  // ── Fetch conversation ─────────────────────────────────────────────────────

  const fetchConversation = useCallback(async () => {
    if (!conversationId) return
    const { data, error: err } = await supabase
      .from('conversations')
      .select(`
        id, buyer_id, seller_id,
        story:story_id ( id, title, current_price_chf, video_url ),
        buyer:buyer_id ( id, display_name, username, avatar_url ),
        seller:seller_id ( id, display_name, username, avatar_url )
      `)
      .eq('id', conversationId)
      .single()

    if (err) { setError(err.message); return }
    setConv(data as unknown as ConversationDetail)
  }, [conversationId])

  // ── Fetch messages ─────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return
    const { data, error: err } = await supabase
      .from('messages')
      .select('id, content, sender_id, created_at, read_at, message_type, media_url')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (err) { setError(err.message); return }
    setMessages((data as Message[]) ?? [])
  }, [conversationId])

  // ── Mark as read ───────────────────────────────────────────────────────────

  const markRead = useCallback(async () => {
    if (!conversationId || !currentUserId) return
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', currentUserId)
      .is('read_at', null)
  }, [conversationId, currentUserId])

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([fetchConversation(), fetchMessages()])
      .then(() => markRead())
      .finally(() => setLoadingConv(false))
  }, [fetchConversation, fetchMessages, markRead])

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // mark incoming message read immediately
          if (newMsg.sender_id !== currentUserId) {
            supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', newMsg.id)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, currentUserId])

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
    }
  }, [messages.length])

  // ── Send ───────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: trimmed,
      })
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    } finally {
      setSending(false)
    }
  }

  // ── Media upload ───────────────────────────────────────────────────────────

  const uploadMedia = useCallback(async (
    localUri: string,
    type: 'image' | 'audio'
  ): Promise<string | null> => {
    try {
      const ext = type === 'audio' ? 'm4a' : 'jpg'
      const path = `${currentUserId}/${Date.now()}.${ext}`
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64',
      })
      const contentType = type === 'audio' ? 'audio/m4a' : 'image/jpeg'
      const { error } = await supabase.storage
        .from('message-media')
        .upload(path, decode(base64), { contentType })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('message-media')
        .getPublicUrl(path)
      return publicUrl
    } catch (err) {
      console.error('[uploadMedia] error:', err)
      return null
    }
  }, [currentUserId])

  const sendMedia = useCallback(async (
    mediaUri: string,
    type: 'image' | 'audio'
  ) => {
    if (!conversationId || !currentUserId) return
    setSendingMedia(true)
    const mediaUrl = await uploadMedia(mediaUri, type)
    if (!mediaUrl) {
      Alert.alert('Erreur', t('conversation.media_error'))
      setSendingMedia(false)
      return
    }
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: type === 'audio' ? '🎤 Message vocal' : '📷 Photo',
        message_type: type,
        media_url: mediaUrl,
      })
      .select('id, content, sender_id, created_at, read_at, message_type, media_url')
      .maybeSingle()
    if (!error && data) {
      setMessages(prev => [...prev, data as Message])
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
    setSendingMedia(false)
  }, [conversationId, currentUserId, uploadMedia])

  // ── Voice recording ────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync()
      if (!granted) {
        Alert.alert('Permission refusée', t('conversation.mic_permission'))
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      )
      setRecording(rec)
      setIsRecording(true)
      setRecordingDuration(0)
      durationInterval.current = setInterval(() => {
        setRecordingDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      Alert.alert('Erreur', "Impossible de démarrer l'enregistrement.")
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!recording) return
    try {
      if (durationInterval.current) clearInterval(durationInterval.current)
      await recording.stopAndUnloadAsync()
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false })
      const uri = recording.getURI()
      setRecording(null)
      setIsRecording(false)
      setRecordingDuration(0)
      if (uri) await sendMedia(uri, 'audio')
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'envoyer le message vocal.")
    }
  }, [recording, sendMedia])

  const cancelRecording = useCallback(async () => {
    if (!recording) return
    if (durationInterval.current) clearInterval(durationInterval.current)
    await recording.stopAndUnloadAsync()
    setRecording(null)
    setIsRecording(false)
    setRecordingDuration(0)
  }, [recording])

  // ── Photo handlers ─────────────────────────────────────────────────────────

  const handlePickImage = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) {
      Alert.alert('Permission refusée', t('conversation.gallery_permission'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    })
    if (!result.canceled && result.assets[0]) {
      await sendMedia(result.assets[0].uri, 'image')
    }
  }, [sendMedia])

  const handleTakePhoto = useCallback(async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync()
    if (!granted) {
      Alert.alert('Permission refusée', t('conversation.camera_permission'))
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    })
    if (!result.canceled && result.assets[0]) {
      await sendMedia(result.assets[0].uri, 'image')
    }
  }, [sendMedia])

  // ── Delete message ─────────────────────────────────────────────────────────

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
    await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', currentUserId)
  }, [currentUserId])

  // ── Derived ────────────────────────────────────────────────────────────────

  const otherUser = conv
    ? conv.buyer_id === currentUserId
      ? conv.seller
      : conv.buyer
    : null

  // ── Loading / error ────────────────────────────────────────────────────────

  if (loadingConv) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  if (error || !conv) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error ?? 'Conversation introuvable'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const canSend = text.trim().length > 0 && !sending

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => {
            if (otherUser?.id) router.push(`/profile/${otherUser.id}`)
          }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser?.display_name ?? otherUser?.username ?? 'Utilisateur'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </View>
          {conv.story && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {conv.story.title}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={conv.story ? <StoryCard story={conv.story} /> : null}
          renderItem={({ item }) => (
            <SwipeableMessageBubble
              msg={item}
              isMe={item.sender_id === currentUserId}
              currentUserId={currentUserId}
              onDelete={handleDeleteMessage}
              t={t}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyText}>{t('conversation.no_messages')}</Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          {isRecording ? (
            <View style={styles.recordingBar}>
              <TouchableOpacity onPress={cancelRecording} hitSlop={8}>
                <Ionicons name="close-circle" size={28} color={colors.error} />
              </TouchableOpacity>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>
                  {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:
                  {String(recordingDuration % 60).padStart(2, '0')}
                </Text>
                <Text style={styles.recordingHint}>Glisse pour annuler</Text>
              </View>
              <TouchableOpacity onPress={stopRecording} hitSlop={8}>
                <Ionicons name="stop-circle" size={36} color={colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                onPress={handlePickImage}
                disabled={sendingMedia}
                hitSlop={8}
                style={{ paddingHorizontal: 4 }}
              >
                <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTakePhoto}
                disabled={sendingMedia}
                hitSlop={8}
                style={{ paddingHorizontal: 4 }}
              >
                <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
              </TouchableOpacity>

              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={text}
                onChangeText={setText}
                placeholder={t('conversation.placeholder')}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={1}
                returnKeyType="default"
                blurOnSubmit={false}
              />

              {text.trim().length > 0 ? (
                <TouchableOpacity
                  style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.7}
                >
                  <Send size={20} color={canSend ? colors.bg : colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={startRecording}
                  disabled={sendingMedia}
                  hitSlop={8}
                  style={{ paddingHorizontal: 4 }}
                >
                  {sendingMedia ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="mic-outline" size={26} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 36

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.error, textAlign: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  headerInfo: { flex: 1 },
  headerName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  headerSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Story card
  storyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storyThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
  },
  storyThumbFallback: { backgroundColor: colors.surfaceHigh },
  storyInfo: { flex: 1, marginLeft: 12 },
  storyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text,
  },
  storyPrice: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.primary,
    marginTop: 3,
  },

  // Messages
  messagesList: { paddingBottom: spacing.sm },
  emptyMessages: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Bubble
  bubbleRow: {
    marginHorizontal: spacing.md,
    marginVertical: 3,
  },
  bubbleRowMe: { alignItems: 'flex-end' },
  bubbleRowOther: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleMe: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMe: {
    fontFamily: fontFamily.regular,
    color: '#0F0F0F',
  },
  bubbleTextOther: {
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  bubbleTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    marginHorizontal: 2,
  },
  bubbleTimeMe: { textAlign: 'right' },
  bubbleTimeOther: { textAlign: 'left' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceHigh,
  },
  recordingBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingTime: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  recordingHint: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
})
