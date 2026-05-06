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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { ArrowLeft, Send } from 'lucide-react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'

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
          source={{ uri: story.video_url }}
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

function MessageBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
          {msg.content}
        </Text>
      </View>
      <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther]}>
        {formatTime(msg.created_at)}
      </Text>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''

  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConv, setLoadingConv] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

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
      .select('id, content, sender_id, created_at, read_at')
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
            <MessageBubble msg={item} isMe={item.sender_id === currentUserId} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyText}>Commencez la conversation</Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={1}
            // auto-grows up to 4 lines via maxHeight
            returnKeyType="default"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.7}
          >
            <Send size={20} color={canSend ? colors.bg : colors.textSecondary} />
          </TouchableOpacity>
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
})
