import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Video, ResizeMode } from 'expo-av'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ListRenderItem,
  Dimensions,
  Platform,
  ActionSheetIOS,
  Modal,
  Pressable,
  Alert,
  RefreshControl,
  Share,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from '../../lib/i18n'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useStoryPurchase } from '../../lib/stripe'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useFollow } from '../../hooks/useFollow'
import { useDropPresence } from '../../hooks/useDropPresence'
import ReportModal from '../../components/ui/ReportModal'
import { SaleToast, SaleToastPayload } from '../../components/ui/SaleToast'
import { getOrCreateConversation } from '../../lib/utils'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface FeedStory {
  id: string
  seller_id: string
  title: string
  description: string | null
  category: string | null
  start_price_chf: number
  floor_price_chf: number
  current_price_chf: number
  video_url: string
  thumbnail_url: string | null
  status: string
  buyer_id: string | null
  created_at: string
  expires_at: string
  price_drop_seconds: number | null
  seller: { id: string; username: string; avatar_url: string | null } | null
}

const PAGE_SIZE = 15

const STORY_SELECT = `
  id, seller_id, title, description, category, start_price_chf, floor_price_chf, current_price_chf,
  video_url, thumbnail_url, status, buyer_id, created_at, expires_at, price_drop_seconds,
  seller:seller_id ( id, username, avatar_url )
`

function computePrice(s: FeedStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  const elapsed = Date.now() - new Date(s.created_at).getTime()
  if (total <= 0) return s.floor_price_chf
  const r = Math.min(Math.max(elapsed / total, 0), 1)
  return Math.max(s.start_price_chf - (s.start_price_chf - s.floor_price_chf) * r, s.floor_price_chf)
}

function computeProgress(s: FeedStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  const elapsed = Date.now() - new Date(s.created_at).getTime()
  if (total <= 0) return 1
  return Math.min(Math.max(elapsed / total, 0), 1)
}

function dropPerMinute(s: FeedStory): number {
  const total = new Date(s.expires_at).getTime() - new Date(s.created_at).getTime()
  if (total <= 0) return 0
  const span = s.start_price_chf - s.floor_price_chf
  return span / (total / 60000)
}

interface Comment {
  id: string
  content: string
  created_at: string
  user_id: string
  parent_comment_id: string | null
  likes_count: number
  dislikes_count: number
  replies_count: number
  profiles: { username: string | null; avatar_url: string | null }
  userLike?: 1 | -1 | null
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'maintenant'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h`
  const days = Math.floor(hrs / 24)
  return `${days} j`
}

function formatTimeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `il y a ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expiré'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function RecentViewersPill({ count }: { count: number }) {
  if (count < 2) return null
  let label: string
  if (count >= 51) label = 'Populaire'
  else if (count >= 11) label = '+10 personnes regardent'
  else label = `${count} personnes regardent`
  const icon = count >= 51 ? '🔥' : '👁'
  return (
    <View style={styles.recentViewersPill}>
      <Text style={styles.recentViewersText}>{icon} {label}</Text>
    </View>
  )
}

function CommentsSheet({
  visible,
  onClose,
  storyId,
  currentUserId,
  currentUserProfile,
  initialCount,
  onCommentAdded,
  onCommentDeleted,
}: {
  visible: boolean
  onClose: () => void
  storyId: string
  currentUserId: string
  currentUserProfile: { username: string | null; avatar_url: string | null }
  initialCount: number
  onCommentAdded: (c: Comment) => void
  onCommentDeleted: (id: string) => void
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [repliesMap, setRepliesMap] = useState<Record<string, Comment[]>>({})
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set())
  const listRef = useRef<FlatList<Comment>>(null)
  const inputRef = useRef<TextInput>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => setCount(initialCount), [initialCount])

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, parent_comment_id, likes_count, dislikes_count, replies_count')
      .eq('story_id', storyId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    const rows = data ?? []
    if (rows.length === 0) {
      setComments([])
      setLoading(false)
      setRefreshing(false)
      return
    }
    const userIds = [...new Set(rows.map((r: any) => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds)
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
    const withProfiles = rows.map((r: any) => ({
      id: r.id,
      content: r.content,
      created_at: r.created_at,
      user_id: r.user_id,
      parent_comment_id: r.parent_comment_id,
      likes_count: r.likes_count ?? 0,
      dislikes_count: r.dislikes_count ?? 0,
      replies_count: r.replies_count ?? 0,
      profiles: profileMap.get(r.user_id) ?? { username: null, avatar_url: null },
    }))
    const commentIds = withProfiles.map((c: any) => c.id)
    const { data: myLikes } = await supabase
      .from('comment_likes')
      .select('comment_id, value')
      .in('comment_id', commentIds)
      .eq('user_id', currentUserId)
    const likeMap = new Map((myLikes ?? []).map((l: any) => [l.comment_id, l.value]))
    const final = withProfiles.map((c: any) => ({ ...c, userLike: likeMap.get(c.id) ?? null }))
    setComments(final as Comment[])
    setLoading(false)
    setRefreshing(false)
  }, [storyId, currentUserId])

  const fetchReplies = useCallback(async (parentId: string) => {
    setLoadingReplies(prev => new Set(prev).add(parentId))
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, parent_comment_id, likes_count, dislikes_count, replies_count')
      .eq('parent_comment_id', parentId)
      .order('created_at', { ascending: true })
      .limit(50)
    const rows = data ?? []
    const userIds = [...new Set(rows.map((r: any) => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds)
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]))
    const { data: myLikes } = await supabase
      .from('comment_likes')
      .select('comment_id, value')
      .in('comment_id', rows.map((r: any) => r.id))
      .eq('user_id', currentUserId)
    const likeMap = new Map((myLikes ?? []).map((l: any) => [l.comment_id, l.value]))
    const withProfiles = rows.map((r: any) => ({
      ...r,
      likes_count: r.likes_count ?? 0,
      dislikes_count: r.dislikes_count ?? 0,
      replies_count: r.replies_count ?? 0,
      profiles: profileMap.get(r.user_id) ?? { username: null, avatar_url: null },
      userLike: likeMap.get(r.id) ?? null,
    }))
    setRepliesMap(prev => ({ ...prev, [parentId]: withProfiles }))
    setExpandedReplies(prev => new Set(prev).add(parentId))
    setLoadingReplies(prev => { const s = new Set(prev); s.delete(parentId); return s })
  }, [currentUserId])

  const handleVote = useCallback(async (commentId: string, value: 1 | -1, isReply?: boolean) => {
    const update = (prev: Comment[]) => prev.map(c => {
      if (c.id !== commentId) return c
      const wasLiked = c.userLike === value
      const newUserLike = wasLiked ? null : value
      const likeDelta = value === 1 ? (wasLiked ? -1 : 1) : 0
      const dislikeDelta = value === -1 ? (wasLiked ? -1 : 1) : 0
      const removePrevLike = c.userLike === 1 && value === -1 ? -1 : 0
      const removePrevDislike = c.userLike === -1 && value === 1 ? -1 : 0
      return {
        ...c,
        userLike: newUserLike,
        likes_count: c.likes_count + likeDelta + removePrevLike,
        dislikes_count: c.dislikes_count + dislikeDelta + removePrevDislike,
      }
    })
    setComments(update)
    if (isReply) {
      setRepliesMap(prev => {
        const updated = { ...prev }
        for (const key in updated) {
          updated[key] = updated[key].map(c => {
            if (c.id !== commentId) return c
            const wasLiked = c.userLike === value
            return { ...c, userLike: wasLiked ? null : value }
          })
        }
        return updated
      })
    }
    const existing = await supabase
      .from('comment_likes')
      .select('id, value')
      .eq('comment_id', commentId)
      .eq('user_id', currentUserId)
      .maybeSingle()
    if (existing.data) {
      if (existing.data.value === value) {
        await supabase.from('comment_likes').delete().eq('id', existing.data.id)
      } else {
        await supabase.from('comment_likes').delete().eq('id', existing.data.id)
        await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: currentUserId, value })
      }
    } else {
      await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: currentUserId, value })
    }
  }, [currentUserId])

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    fetchComments()

    channelRef.current = supabase
      .channel(`comments:${storyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `story_id=eq.${storyId}` },
        async (payload) => {
          const row = payload.new as any
          if (row.user_id === currentUserId) return
          if (row.parent_comment_id !== null) return
          const { data: prof } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', row.user_id)
            .maybeSingle()
          const newComment: Comment = {
            id: row.id,
            content: row.content,
            created_at: row.created_at,
            user_id: row.user_id,
            parent_comment_id: null,
            likes_count: 0,
            dislikes_count: 0,
            replies_count: 0,
            profiles: prof ?? { username: null, avatar_url: null },
            userLike: null,
          }
          setComments(prev => [newComment, ...prev])
          setCount(n => n + 1)
          onCommentAdded(newComment)
        },
      )
      .subscribe()

    return () => {
      channelRef.current?.unsubscribe()
      channelRef.current = null
    }
  }, [visible, storyId, fetchComments, currentUserId, onCommentAdded])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !currentUserId || sending) return
    const pendingReplyTo = replyTo
    setSending(true)
    setInput('')
    setReplyTo(null)
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }

    const { data: { session: liveSession } } = await supabase.auth.getSession()
    if (!liveSession) await supabase.auth.refreshSession()

    const insertPayload: any = {
      story_id: storyId,
      user_id: currentUserId,
      content: text,
    }
    if (pendingReplyTo) insertPayload.parent_comment_id = pendingReplyTo.id

    const { data, error } = await supabase
      .from('comments')
      .insert(insertPayload)
      .select('id, content, created_at, user_id, parent_comment_id, likes_count, dislikes_count, replies_count')
      .maybeSingle()

    setSending(false)

    if (error || !data) {
      setInput(text)
      return
    }

    if (pendingReplyTo) {
      setComments(prev => prev.map(c =>
        c.id === pendingReplyTo.id ? { ...c, replies_count: c.replies_count + 1 } : c
      ))
      fetchReplies(pendingReplyTo.id)
    } else {
      const newComment: Comment = {
        id: data.id,
        content: data.content,
        created_at: data.created_at,
        user_id: data.user_id,
        parent_comment_id: null,
        likes_count: 0,
        dislikes_count: 0,
        replies_count: 0,
        profiles: {
          username: currentUserProfile.username,
          avatar_url: currentUserProfile.avatar_url,
        },
        userLike: null,
      }
      setComments(prev => [newComment, ...prev])
      setCount(n => n + 1)
      onCommentAdded(newComment)
      listRef.current?.scrollToOffset({ offset: 0, animated: true })
    }
  }

  const handleDelete = (c: Comment) => {
    Alert.alert('Supprimer ce commentaire ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setComments(prev => prev.filter(x => x.id !== c.id))
          setCount(n => Math.max(0, n - 1))
          onCommentDeleted(c.id)
          await supabase.from('comments').delete().eq('id', c.id).eq('user_id', currentUserId)
        },
      },
    ])
  }

  const onRefresh = () => { setRefreshing(true); fetchComments() }

  function CommentRow({ comment, isReply, onReply, onVote }: {
    comment: Comment
    isReply: boolean
    onReply: () => void
    onVote: (value: 1 | -1) => void
  }) {
    return (
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginLeft: isReply ? 48 : 0,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', marginRight: 10, overflow: 'hidden' }}>
          {comment.profiles.avatar_url ? (
            <Image source={{ uri: comment.profiles.avatar_url }} style={{ width: 36, height: 36 }} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#00D2B8', fontWeight: '700', fontSize: 14 }}>
                {(comment.profiles.username ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: '#A0A0A0', fontSize: 12, fontWeight: '600', marginBottom: 2 }}>
            {comment.profiles.username ?? 'Utilisateur'}
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>
            {comment.content}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 }}>
            <Text style={{ color: '#666', fontSize: 11 }}>
              {formatRelativeDate(comment.created_at)}
            </Text>
            <TouchableOpacity onPress={onReply}>
              <Text style={{ color: '#A0A0A0', fontSize: 12, fontWeight: '600' }}>
                Répondre
              </Text>
            </TouchableOpacity>
            {comment.user_id === currentUserId && (
              <TouchableOpacity onPress={() => handleDelete(comment)}>
                <Ionicons name="trash-outline" size={13} color="#555" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 8, marginLeft: 12 }}>
          <TouchableOpacity onPress={() => onVote(1)} style={{ alignItems: 'center' }}>
            <Ionicons
              name={comment.userLike === 1 ? 'heart' : 'heart-outline'}
              size={20}
              color={comment.userLike === 1 ? '#FF4757' : '#A0A0A0'}
            />
            <Text style={{ color: '#A0A0A0', fontSize: 11, marginTop: 2 }}>
              {comment.likes_count > 0 ? comment.likes_count : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onVote(-1)} style={{ alignItems: 'center' }}>
            <Ionicons
              name={comment.userLike === -1 ? 'thumbs-down' : 'thumbs-down-outline'}
              size={18}
              color={comment.userLike === -1 ? '#00D2B8' : '#A0A0A0'}
            />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const renderItem = ({ item }: { item: Comment }) => (
    <View>
      <CommentRow
        comment={item}
        isReply={false}
        onReply={() => {
          setReplyTo({ id: item.id, username: item.profiles.username ?? 'utilisateur' })
          inputRef.current?.focus()
        }}
        onVote={(value) => handleVote(item.id, value, false)}
      />

      {item.replies_count > 0 && (
        <TouchableOpacity
          style={{ marginLeft: 64, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          onPress={() => {
            if (expandedReplies.has(item.id)) {
              setExpandedReplies(prev => { const s = new Set(prev); s.delete(item.id); return s })
            } else {
              fetchReplies(item.id)
            }
          }}
        >
          <View style={{ height: 1, width: 24, backgroundColor: '#444' }} />
          {loadingReplies.has(item.id) ? (
            <ActivityIndicator size="small" color="#00D2B8" />
          ) : (
            <Text style={{ color: '#A0A0A0', fontSize: 12, fontWeight: '600' }}>
              {expandedReplies.has(item.id)
                ? 'Masquer les réponses'
                : `Afficher ${item.replies_count} réponse${item.replies_count > 1 ? 's' : ''}`}
              {' '}{expandedReplies.has(item.id) ? '▲' : '▼'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {expandedReplies.has(item.id) && (repliesMap[item.id] ?? []).map(reply => (
        <CommentRow
          key={reply.id}
          comment={reply}
          isReply={true}
          onReply={() => {
            setReplyTo({ id: item.id, username: item.profiles.username ?? 'utilisateur' })
            inputRef.current?.focus()
          }}
          onVote={(value) => handleVote(reply.id, value, true)}
        />
      ))}
    </View>
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={onClose}
          />
          <View style={commentStyles.sheet}>
            {/* Header */}
            <View style={commentStyles.header}>
              <View style={commentStyles.handle} />
              <View style={commentStyles.headerInner}>
                <View style={{ width: 32 }} />
                <Text style={commentStyles.title}>
                  {t('comments.title')}{count > 0 ? ` · ${count}` : ''}
                </Text>
                <TouchableOpacity onPress={onClose} style={commentStyles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            {loading ? (
              <View style={commentStyles.centerFill}>
                <ActivityIndicator color="#00D2B8" />
              </View>
            ) : comments.length === 0 ? (
              <View style={commentStyles.centerFill}>
                <Ionicons name="chatbubble-outline" size={48} color="#444" />
                <Text style={commentStyles.emptyTitle}>{t('comments.empty')}</Text>
                <Text style={commentStyles.emptySub}>{t('comments.first')}</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={comments}
                keyExtractor={(c) => c.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingVertical: 8 }}
                style={{ flex: 1 }}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D2B8" />
                }
              />
            )}

            {/* Reply banner */}
            {replyTo && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor: '#1A1A1A',
                justifyContent: 'space-between',
              }}>
                <Text style={{ color: '#A0A0A0', fontSize: 12 }}>
                  Réponse à <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>@{replyTo.username}</Text>
                </Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Ionicons name="close" size={16} color="#A0A0A0" />
                </TouchableOpacity>
              </View>
            )}

            {/* Input bar */}
            <View style={[commentStyles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              {currentUserProfile.avatar_url ? (
                <Image source={{ uri: currentUserProfile.avatar_url }} style={commentStyles.avatar} />
              ) : (
                <View style={commentStyles.inputAvatarFallback}>
                  <Text style={commentStyles.inputAvatarInitial}>
                    {(currentUserProfile.username ?? 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <TextInput
                ref={inputRef}
                style={commentStyles.input}
                placeholder={t('comments.placeholder')}
                placeholderTextColor="#666"
                value={input}
                onChangeText={setInput}
                maxLength={300}
                multiline
                editable={!!currentUserId && !sending}
              />
              {input.trim().length > 0 && (
                <TouchableOpacity style={commentStyles.sendBtn} onPress={handleSend} disabled={sending}>
                  {sending ? (
                    <ActivityIndicator size="small" color="#0F0F0F" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color="#0F0F0F" />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function DropItem({
  story,
  active,
  tabFocused,
  onSwipeDown,
  currentUserId,
}: {
  story: FeedStory
  active: boolean
  tabFocused: boolean
  onSwipeDown: () => void
  currentUserId: string
}) {
  const { profile: authProfile } = useAuth()
  const currentUserProfile = {
    username: authProfile?.username ?? null,
    avatar_url: authProfile?.avatar_url ?? null,
  }
  const videoRef = useRef<Video>(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const viewerCount = useDropPresence(story.id, active && tabFocused)
  const { isWatchlisted, watchlistCount, toggleWatchlist } = useWatchlist(story.id)
  const sellerId = story.seller?.id ?? ''
  const { isFollowing, toggleFollow, loading: followLoading } = useFollow(sellerId)
  const sheetInsets = useSafeAreaInsets()
  const [menuVisible, setMenuVisible] = useState(false)
  const [reportVisible, setReportVisible] = useState(false)
  const [buyVisible, setBuyVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [snapshotPrice, setSnapshotPrice] = useState(0)

  const [price, setPrice] = useState(() => computePrice(story))
  const [progress, setProgress] = useState(() => computeProgress(story))
  const [countdown, setCountdown] = useState(() => formatCountdown(story.expires_at))
  const [localSold, setLocalSold] = useState(false)
  const [recentViewers, setRecentViewers] = useState<number>(0)

  // Comments
  const [commentsVisible, setCommentsVisible] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const carouselRef = useRef<Comment[]>([])
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [carouselVersion, setCarouselVersion] = useState(0)
  const carouselOpacity = useSharedValue(1)
  const carouselAnimStyle = useAnimatedStyle(() => ({ opacity: carouselOpacity.value }))

  const { handlePurchase, purchasing, instantLoading } = useStoryPurchase()

  const [chatLoading, setChatLoading] = useState(false)
  const handleMessage = useCallback(async () => {
    if (!currentUserId || !sellerId) return
    setChatLoading(true)
    try {
      const convId = await getOrCreateConversation(supabase, currentUserId, sellerId)
      setDetailVisible(false)
      router.push(`/conversation/${convId}`)
    } catch {
      // silently ignore
    } finally {
      setChatLoading(false)
    }
  }, [currentUserId, sellerId])

  const isSeller = currentUserId === story.seller_id
  const isSold = localSold || story.status === 'sold' || story.buyer_id !== null
  const disabled = isSeller || story.status !== 'active' || isSold

  useEffect(() => {
    if (!active) return
    const tick = () => {
      setPrice(computePrice(story))
      setProgress(computeProgress(story))
      setCountdown(formatCountdown(story.expires_at))
    }
    tick()
    const h = setInterval(tick, 250)
    return () => clearInterval(h)
  }, [active, story])

  // Keep sheet price updated even when not the active feed item
  useEffect(() => {
    if (!detailVisible) return
    const tick = () => {
      setPrice(computePrice(story))
      setCountdown(formatCountdown(story.expires_at))
    }
    tick()
    const h = setInterval(tick, 250)
    return () => clearInterval(h)
  }, [detailVisible, story])

  useEffect(() => {
    if (!active || !currentUserId) return
    supabase
      .from('story_views')
      .insert({ story_id: story.id, user_id: currentUserId })
      .then(() => {})
    ;(async () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('story_views')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', story.id)
        .gte('viewed_at', tenMinAgo)
      setRecentViewers(count ?? 0)
    })()
  }, [active, currentUserId, story.id])

  useEffect(() => {
    if (!videoRef.current) return
    if (active && tabFocused && !paused && !buyVisible) {
      videoRef.current.playAsync().catch(() => {})
    } else {
      videoRef.current.pauseAsync().catch(() => {})
    }
  }, [active, tabFocused, paused, buyVisible])

  // Fetch comments + count when drop becomes active
  useEffect(() => {
    if (!active) return
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from('comments')
        .select('id, content, created_at, user_id, profiles:user_id(username, avatar_url)')
        .eq('story_id', story.id)
        .order('created_at', { ascending: false })
        .limit(10)
      const { count } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', story.id)
      if (!mounted) return
      carouselRef.current = (data as unknown as Comment[]) ?? []
      setCarouselIdx(0)
      setCarouselVersion(v => v + 1)
      setCommentCount(count ?? 0)
    })()
    return () => { mounted = false }
  }, [active, story.id])

  // Carousel rotation every 3.5s with fade
  useEffect(() => {
    if (!active) return
    if (carouselRef.current.length < 2) return
    const h = setInterval(() => {
      carouselOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (!finished) return
      })
      setTimeout(() => {
        setCarouselIdx(i => (i + 1) % Math.max(carouselRef.current.length, 1))
        carouselOpacity.value = withTiming(1, { duration: 200 })
      }, 220)
    }, 3500)
    return () => clearInterval(h)
  }, [active, carouselVersion, carouselOpacity])

  const handleNewComment = useCallback((c: Comment) => {
    carouselRef.current = [c, ...carouselRef.current].slice(0, 10)
    setCarouselIdx(0)
    setCarouselVersion(v => v + 1)
    setCommentCount(n => n + 1)
    carouselOpacity.value = 1
  }, [carouselOpacity])

  const handleDeletedComment = useCallback((id: string) => {
    carouselRef.current = carouselRef.current.filter(c => c.id !== id)
    setCarouselIdx(0)
    setCarouselVersion(v => v + 1)
    setCommentCount(n => Math.max(0, n - 1))
  }, [])

  const pulse = useSharedValue(1)
  useEffect(() => {
    if (disabled) return
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    )
  }, [disabled, pulse])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  const touchStartY = useRef(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onTouchStart = (e: any) => {
    touchStartY.current = e.nativeEvent.pageY
    longPressTimer.current = setTimeout(() => {
      setPaused(true)
    }, 300)
  }

  const onTouchEnd = (e: any) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    const dy = e.nativeEvent.pageY - touchStartY.current
    if (paused) setPaused(false)
    if (dy > 120) onSwipeDown()
  }

  const onTouchMove = (e: any) => {
    const dy = Math.abs(e.nativeEvent.pageY - touchStartY.current)
    if (dy > 8 && longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const openMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Signaler', 'Bloquer le vendeur'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (i) => {
          if (i === 1) setReportVisible(true)
          if (i === 2 && story.seller?.id) router.push(`/profile/${story.seller.id}`)
        }
      )
    } else {
      setMenuVisible(true)
    }
  }

  const openBuy = () => {
    if (disabled) return
    setSnapshotPrice(price)
    setDetailVisible(false)
    setBuyVisible(true)
  }

  const confirmBuy = async () => {
    await handlePurchase(story.id, snapshotPrice, () => {
      setBuyVisible(false)
      setLocalSold(true)
      Alert.alert('Achat confirmé !', '', [{ text: 'OK' }])
    })
  }

  const openSellerProfile = () => {
    if (story.seller?.id && story.seller.id !== currentUserId) {
      router.push(`/profile/${story.seller.id}`)
    }
  }

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${story.title} — CHF ${price.toFixed(2)} sur CLICKK`,
      })
    } catch {
      // user cancelled or share not available — ignore
    }
  }

  const username = story.seller?.username ?? 'vendeur'
  const avatar = story.seller?.avatar_url
  const perMin = dropPerMinute(story)
  const ctaLabel = isSold
    ? 'Vendu'
    : isSeller
    ? 'Votre drop'
    : story.status !== 'active'
    ? 'Enchère terminée'
    : `Acheter maintenant — CHF ${price.toFixed(2)}`

  return (
    <View
      style={styles.drop}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <Video
        ref={videoRef}
        source={{ uri: story.video_url }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted={muted}
        shouldPlay={active && tabFocused && !paused && !buyVisible}
        posterSource={story.thumbnail_url ? { uri: story.thumbnail_url } : undefined}
        usePoster={!!story.thumbnail_url}
      />

      {paused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="pause" size={60} color="rgba(255,255,255,0.9)" />
        </View>
      )}

      <View style={styles.topRow} pointerEvents="box-none">
        <RecentViewersPill count={recentViewers} />
        {viewerCount > 1 ? (
          <View style={styles.watchingPill}>
            <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
            <Text style={styles.watchingText}>{viewerCount} watching</Text>
          </View>
        ) : (
          <View />
        )}
      </View>

      <TouchableOpacity
        onPress={() => setMuted((m) => !m)}
        style={styles.muteBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.actionsCol}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            console.log('[heart] isWatchlisted:', isWatchlisted, 'userId:', currentUserId, 'storyId:', story.id)
            toggleWatchlist()
          }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isWatchlisted ? 'heart' : 'heart-outline'}
            size={26}
            color={isWatchlisted ? '#FF4757' : '#FFFFFF'}
          />
        </TouchableOpacity>
        <Text style={styles.actionCount}>{watchlistCount > 0 ? watchlistCount : ''}</Text>

        <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsVisible(true)} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.actionCount}>{commentCount > 0 ? commentCount : ''}</Text>

        <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
          <Ionicons name="arrow-redo-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.actionCount}>Partager</Text>

        <TouchableOpacity style={styles.actionBtn} onPress={openMenu} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.bottomGradient}
        pointerEvents="box-none"
      >
        {carouselRef.current.length > 0 && (
          <TouchableOpacity
            style={styles.carouselContainer}
            activeOpacity={0.8}
            onPress={() => setCommentsVisible(true)}
          >
            <Animated.View style={carouselAnimStyle}>
              <Text style={styles.carouselText} numberOfLines={2}>
                <Text style={styles.carouselUser}>
                  @{carouselRef.current[carouselIdx]?.profiles?.username ?? 'user'}
                </Text>
                <Text style={styles.carouselSpacer}>  </Text>
                <Text>{carouselRef.current[carouselIdx]?.content ?? ''}</Text>
              </Text>
            </Animated.View>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.sellerRow} onPress={openSellerProfile} activeOpacity={0.8}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.sellerAvatar} />
          ) : (
            <View style={styles.sellerAvatarFallback}>
              <Text style={styles.sellerAvatarInitial}>{username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.sellerUsername}>@{username}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setDetailVisible(true)}
          style={styles.titleRow}
        >
          <Text style={styles.productTitle} numberOfLines={2}>
            {story.title}
          </Text>
        </TouchableOpacity>

        {!!story.description && (
          <TouchableOpacity activeOpacity={0.75} onPress={() => setDetailVisible(true)}>
            <Text style={styles.productDesc} numberOfLines={2}>
              {story.description}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.priceBlock}>
          <View style={styles.priceTopRow}>
            <Text style={styles.priceBig}>CHF {price.toFixed(2)}</Text>
            <View style={styles.freeShipBadge}>
              <Ionicons name="cube-outline" size={11} color="#00D2B8" />
              <Text style={styles.freeShipText}>Livraison offerte</Text>
            </View>
          </View>
          <View style={styles.priceMeta}>
            <Text style={styles.priceDrop}>↓ -CHF {perMin.toFixed(2)}/min</Text>
            <Text style={styles.priceMin}>Min: CHF {story.floor_price_chf.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <LinearGradient
            colors={['#00D2B8', '#FFA502']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>

        <Animated.View style={!disabled ? pulseStyle : undefined}>
          <TouchableOpacity
            style={[styles.buyBtn, disabled && styles.buyBtnDisabled]}
            activeOpacity={0.85}
            disabled={disabled}
            onPress={openBuy}
          >
            <Text style={[styles.buyBtnText, disabled && styles.buyBtnTextDisabled]}>
              {ctaLabel}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>

      {Platform.OS !== 'ios' && (
        <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
            <View style={styles.menuSheet}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false)
                  setTimeout(() => setReportVisible(true), 200)
                }}
              >
                <Ionicons name="flag-outline" size={18} color="#FFFFFF" />
                <Text style={styles.menuText}>Signaler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false)
                  if (story.seller?.id) router.push(`/profile/${story.seller.id}`)
                }}
              >
                <Ionicons name="person-remove-outline" size={18} color="#FF4757" />
                <Text style={[styles.menuText, { color: '#FF4757' }]}>Bloquer le vendeur</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
                <Text style={styles.menuCancelText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetType="story"
        targetId={story.id}
      />

      {/* ── Comments sheet ─────────────────────────────────────────────── */}
      <CommentsSheet
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        storyId={story.id}
        currentUserId={currentUserId}
        currentUserProfile={currentUserProfile}
        initialCount={commentCount}
        onCommentAdded={handleNewComment}
        onCommentDeleted={handleDeletedComment}
      />

      {/* ── Detail sheet ───────────────────────────────────────────────── */}
      <Modal
        visible={detailVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={[detailStyles.root, { paddingBottom: sheetInsets.bottom + 16 }]}>
          {/* Handle + close */}
          <View style={detailStyles.handleRow}>
            <View style={detailStyles.handle} />
            <TouchableOpacity
              style={detailStyles.closeBtn}
              onPress={() => setDetailVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={detailStyles.scrollContent}
          >
            {/* Seller row */}
            <View style={detailStyles.sellerRow}>
              <TouchableOpacity
                style={detailStyles.sellerLeft}
                onPress={() => {
                  setDetailVisible(false)
                  if (sellerId && sellerId !== currentUserId) {
                    router.push(`/profile/${sellerId}`)
                  }
                }}
                activeOpacity={0.8}
              >
                {story.seller?.avatar_url ? (
                  <Image source={{ uri: story.seller.avatar_url }} style={detailStyles.sellerAvatar} />
                ) : (
                  <View style={detailStyles.sellerAvatarFallback}>
                    <Text style={detailStyles.sellerAvatarInitial}>
                      {(story.seller?.username ?? 'V').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={detailStyles.sellerUsername}>@{story.seller?.username ?? 'vendeur'}</Text>
              </TouchableOpacity>

              {sellerId !== currentUserId && (
                <View style={detailStyles.sellerActions}>
                  <TouchableOpacity
                    style={[detailStyles.followBtn, isFollowing && detailStyles.followBtnActive]}
                    onPress={toggleFollow}
                    disabled={followLoading}
                    activeOpacity={0.8}
                  >
                    <Text style={[detailStyles.followBtnText, isFollowing && detailStyles.followBtnTextActive]}>
                      {isFollowing ? 'Abonné' : 'Suivre'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={detailStyles.messageBtn}
                    onPress={handleMessage}
                    disabled={chatLoading}
                    activeOpacity={0.8}
                  >
                    {chatLoading
                      ? <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
                      : <Ionicons name="chatbubble-outline" size={16} color="rgba(255,255,255,0.9)" />
                    }
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={detailStyles.divider} />

            {/* Category */}
            {!!story.category && (
              <View style={detailStyles.categoryBadge}>
                <Text style={detailStyles.categoryText}>
                  {story.category.charAt(0).toUpperCase() + story.category.slice(1)}
                </Text>
              </View>
            )}

            {/* Title */}
            <Text style={detailStyles.title}>{story.title}</Text>

            {/* Description */}
            {!!story.description && (
              <Text style={detailStyles.description}>{story.description}</Text>
            )}

            <View style={detailStyles.divider} />

            {/* Price section */}
            <Text style={detailStyles.priceLabel}>PRIX ACTUEL</Text>
            <Text style={detailStyles.priceBig}>CHF {price.toFixed(2)}</Text>
            <View style={[detailStyles.freeShipBadge, { alignSelf: 'flex-start', marginTop: 6 }]}>
              <Ionicons name="cube-outline" size={12} color="#00D2B8" />
              <Text style={detailStyles.freeShipText}>Livraison offerte</Text>
            </View>
            {dropPerMinute(story) > 0 && (
              <Text style={detailStyles.priceDrop}>
                ↓ baisse toutes les {story.price_drop_seconds ?? 60}s
              </Text>
            )}
            <Text style={detailStyles.priceFloor}>
              Prix plancher : CHF {story.floor_price_chf.toFixed(2)}
            </Text>

            <View style={detailStyles.divider} />

            {/* Expiry */}
            <Text style={detailStyles.expires}>
              Expire dans {countdown}
            </Text>
          </ScrollView>

          {/* Sticky footer */}
          <View style={detailStyles.footer}>
            <TouchableOpacity
              style={[detailStyles.buyBtn, disabled && detailStyles.buyBtnDisabled]}
              activeOpacity={0.85}
              disabled={disabled}
              onPress={openBuy}
            >
              <Text style={[detailStyles.buyBtnText, disabled && detailStyles.buyBtnTextDisabled]}>
                {isSold
                  ? 'Vendu'
                  : isSeller
                  ? 'Votre drop'
                  : story.status !== 'active'
                  ? 'Enchère terminée'
                  : `Acheter maintenant — CHF ${price.toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={buyVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setBuyVisible(false)}
      >
        <Pressable style={styles.buyBackdrop} onPress={() => setBuyVisible(false)} />
        <View style={styles.buySheet}>
          <View style={styles.buyHandle} />
          <Text style={styles.buySheetTitle}>Confirmer l'achat</Text>
          <View style={styles.buyPriceWrap}>
            <Text style={styles.buyChf}>CHF</Text>
            <Text style={styles.buyPriceValue}>{snapshotPrice.toFixed(2)}</Text>
          </View>
          <Text style={styles.buySubtitle}>Enchère hollandaise · Premier arrivé, premier servi</Text>
          <View style={styles.buyWarn}>
            <Ionicons name="information-circle-outline" size={18} color="#FFA502" />
            <Text style={styles.buyWarnText}>
              Ce prix n'est valable que quelques secondes. Le montant débité sera celui au moment de la confirmation.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.buyConfirm, (purchasing || instantLoading) && { opacity: 0.6 }]}
            onPress={confirmBuy}
            disabled={purchasing || instantLoading}
          >
            {purchasing || instantLoading ? (
              <ActivityIndicator color="#0F0F0F" />
            ) : (
              <Text style={styles.buyConfirmText}>
                CHF {snapshotPrice.toFixed(2)} — Confirmer
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.buyCancel} onPress={() => setBuyVisible(false)}>
            <Text style={styles.buyCancelText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

type FeedTab = 'foryou' | 'following'

const keyExtractor = (item: FeedStory) => item.id

export default function FeedScreen() {
  const { session } = useAuth()
  const currentUserId = session?.user?.id ?? ''
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ initialStoryId?: string }>()
  const [activeTab, setActiveTab] = useState<FeedTab>('foryou')

  // Per-tab state
  const [forYouStories, setForYouStories] = useState<FeedStory[]>([])
  const [forYouLoading, setForYouLoading] = useState(true)
  const [forYouLoaded, setForYouLoaded] = useState(false)
  const [forYouRefreshing, setForYouRefreshing] = useState(false)
  const [forYouCursor, setForYouCursor] = useState<string | null>(null)
  const [forYouHasMore, setForYouHasMore] = useState(true)
  const [forYouLoadingMore, setForYouLoadingMore] = useState(false)

  const [followingStories, setFollowingStories] = useState<FeedStory[]>([])
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followingLoaded, setFollowingLoaded] = useState(false)
  const [followingRefreshing, setFollowingRefreshing] = useState(false)
  const [followingCursor, setFollowingCursor] = useState<string | null>(null)
  const [followingHasMore, setFollowingHasMore] = useState(true)
  const [followingLoadingMore, setFollowingLoadingMore] = useState(false)

  const [activeIndex, setActiveIndex] = useState(0)
  const [tabFocused, setTabFocused] = useState(true)
  const [toast, setToast] = useState<SaleToastPayload | null>(null)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 })
  const flatListRef = useRef<FlatList<FeedStory>>(null)

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true)
      return () => setTabFocused(false)
    }, [])
  )

  // ── Fetch "Pour toi" ────────────────────────────────────────────────────────
  const fetchForYou = useCallback(async (mode: 'initial' | 'more' = 'initial') => {
    if (mode === 'more' && (!forYouHasMore || forYouLoadingMore)) return
    if (mode === 'more') setForYouLoadingMore(true)

    let q = supabase
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (mode === 'more' && forYouCursor) {
      q = q.lt('created_at', forYouCursor)
    }

    const { data, error } = await q

    if (!error && data) {
      const rows = data as unknown as FeedStory[]
      if (mode === 'initial') {
        setForYouStories(rows)
      } else {
        setForYouStories((prev) => {
          const seen = new Set(prev.map((s) => s.id))
          const fresh = rows.filter((s) => !seen.has(s.id))
          return [...prev, ...fresh]
        })
      }
      if (rows.length < PAGE_SIZE) setForYouHasMore(false)
      else setForYouHasMore(true)
      const last = rows[rows.length - 1]
      if (last) setForYouCursor(last.created_at)
    }

    if (mode === 'initial') {
      setForYouLoading(false)
      setForYouLoaded(true)
      setForYouRefreshing(false)
    } else {
      setForYouLoadingMore(false)
    }
  }, [forYouCursor, forYouHasMore, forYouLoadingMore])

  // ── Fetch "Abonnements" ─────────────────────────────────────────────────────
  const fetchFollowing = useCallback(async (mode: 'initial' | 'more' = 'initial') => {
    if (!currentUserId) {
      setFollowingLoading(false)
      setFollowingLoaded(true)
      setFollowingRefreshing(false)
      setFollowingHasMore(false)
      return
    }
    if (mode === 'more' && (!followingHasMore || followingLoadingMore)) return
    if (mode === 'more') setFollowingLoadingMore(true)

    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)

    const ids = (follows ?? []).map((f: { following_id: string }) => f.following_id)

    if (ids.length === 0) {
      setFollowingStories([])
      setFollowingLoading(false)
      setFollowingLoaded(true)
      setFollowingRefreshing(false)
      setFollowingHasMore(false)
      setFollowingLoadingMore(false)
      return
    }

    let q = supabase
      .from('stories')
      .select(STORY_SELECT)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .in('seller_id', ids)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (mode === 'more' && followingCursor) {
      q = q.lt('created_at', followingCursor)
    }

    const { data, error } = await q

    if (!error && data) {
      const rows = data as unknown as FeedStory[]
      if (mode === 'initial') {
        setFollowingStories(rows)
      } else {
        setFollowingStories((prev) => {
          const seen = new Set(prev.map((s) => s.id))
          const fresh = rows.filter((s) => !seen.has(s.id))
          return [...prev, ...fresh]
        })
      }
      if (rows.length < PAGE_SIZE) setFollowingHasMore(false)
      else setFollowingHasMore(true)
      const last = rows[rows.length - 1]
      if (last) setFollowingCursor(last.created_at)
    }

    if (mode === 'initial') {
      setFollowingLoading(false)
      setFollowingLoaded(true)
      setFollowingRefreshing(false)
    } else {
      setFollowingLoadingMore(false)
    }
  }, [currentUserId, followingCursor, followingHasMore, followingLoadingMore])

  // Initial load
  useEffect(() => { fetchForYou() }, [fetchForYou])

  // ── Handle initialStoryId from navigation params ────────────────────────────
  useEffect(() => {
    const targetId = params.initialStoryId
    if (!targetId || forYouLoading) return
    setActiveTab('foryou')

    const idx = forYouStories.findIndex((s) => s.id === targetId)
    if (idx !== -1) {
      setActiveIndex(idx)
      flatListRef.current?.scrollToIndex({ index: idx, animated: false })
      router.setParams({ initialStoryId: undefined })
      return
    }

    // Story not in current list — fetch it and prepend
    ;(async () => {
      const { data } = await supabase
        .from('stories')
        .select(STORY_SELECT)
        .eq('id', targetId)
        .maybeSingle()
      if (data) {
        setForYouStories((prev) => {
          if (prev.find((s) => s.id === targetId)) return prev
          return [data as unknown as FeedStory, ...prev]
        })
        setActiveIndex(0)
        flatListRef.current?.scrollToIndex({ index: 0, animated: false })
      }
      router.setParams({ initialStoryId: undefined })
    })()
  }, [params.initialStoryId, forYouLoading, forYouStories])

  // Load following tab on first switch to it
  useEffect(() => {
    if (activeTab === 'following' && !followingLoaded && !followingLoading) {
      setFollowingLoading(true)
      fetchFollowing()
    }
  }, [activeTab, followingLoaded, followingLoading, fetchFollowing])

  // Reset active index when switching tabs
  const handleTabSwitch = useCallback((tab: FeedTab) => {
    setActiveTab(tab)
    setActiveIndex(0)
  }, [])

  // ── Realtime sale toast ─────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('drop_sales')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stories' },
        async (payload) => {
          const next = payload.new as FeedStory
          const prev = payload.old as Partial<FeedStory>
          if (next.status !== 'sold' || prev.status === 'sold') return
          if (!next.buyer_id || next.buyer_id === currentUserId) return

          const { data: buyer } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', next.buyer_id)
            .maybeSingle()

          setToast({
            id: `${next.id}-${Date.now()}`,
            username: buyer?.username ?? 'someone',
            priceChf: next.current_price_chf ?? 0,
          })
        }
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [currentUserId])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0)
    }
  }).current

  const handleSwipeDown = useCallback(() => {
    console.log('[feed] swipe down -> main menu (TBD)')
  }, [])

  const activeStories = activeTab === 'foryou' ? forYouStories : followingStories
  const isLoading = activeTab === 'foryou' ? forYouLoading : followingLoading

  const preloadStories = useMemo(
    () => activeStories.slice(activeIndex + 1, activeIndex + 3),
    [activeStories, activeIndex]
  )

  const renderItem: ListRenderItem<FeedStory> = useCallback(
    ({ item, index }) => (
      <DropItem
        story={item}
        active={index === activeIndex}
        tabFocused={tabFocused}
        onSwipeDown={handleSwipeDown}
        currentUserId={currentUserId}
      />
    ),
    [activeIndex, tabFocused, currentUserId, handleSwipeDown]
  )

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: SCREEN_HEIGHT, offset: SCREEN_HEIGHT * index, index }),
    []
  )

  // ── Tab header overlay ──────────────────────────────────────────────────────
  const tabHeader = (
    <View style={[styles.tabHeaderWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.tabRow} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => handleTabSwitch('following')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, activeTab !== 'following' && styles.tabLabelInactive]}>
            Abonnements
          </Text>
          {activeTab === 'following' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => handleTabSwitch('foryou')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, activeTab !== 'foryou' && styles.tabLabelInactive]}>
            Pour toi
          </Text>
          {activeTab === 'foryou' && <View style={styles.tabUnderline} />}
        </TouchableOpacity>
      </View>

    </View>
  )

  // ── Loading state ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <ActivityIndicator size="large" color="#00D2B8" />
        </View>
        {tabHeader}
      </View>
    )
  }

  // ── Following empty state ───────────────────────────────────────────────────
  if (activeTab === 'following' && activeStories.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color="#555" />
          <Text style={styles.emptyText}>Tu ne suis encore personne.</Text>
          <TouchableOpacity
            style={styles.discoverBtn}
            onPress={() => handleTabSwitch('foryou')}
            activeOpacity={0.85}
          >
            <Text style={styles.discoverBtnText}>Découvrir des vendeurs</Text>
          </TouchableOpacity>
        </View>
        {tabHeader}
      </View>
    )
  }

  // ── For You empty state ─────────────────────────────────────────────────────
  if (activeTab === 'foryou' && activeStories.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.empty}>
          <Ionicons name="flash-outline" size={48} color="#555" />
          <Text style={styles.emptyText}>Aucun drop actif</Text>
        </View>
        {tabHeader}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={flatListRef}
        key={activeTab}
        data={activeStories}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        getItemLayout={getItemLayout}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        onEndReached={() => {
          if (activeTab === 'foryou') {
            fetchForYou('more')
          } else {
            fetchFollowing('more')
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          (activeTab === 'foryou' ? forYouLoadingMore : followingLoadingMore) ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#00D2B8" />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={activeTab === 'foryou' ? forYouRefreshing : followingRefreshing}
            onRefresh={() => {
              if (activeTab === 'foryou') {
                setForYouCursor(null)
                setForYouHasMore(true)
                setForYouRefreshing(true)
                fetchForYou('initial')
              } else {
                setFollowingCursor(null)
                setFollowingHasMore(true)
                setFollowingRefreshing(true)
                fetchFollowing('initial')
              }
            }}
            tintColor="#00D2B8"
          />
        }
      />

      {tabHeader}

      {toast && <SaleToast key={toast.id} payload={toast} onDismiss={() => setToast(null)} />}

      <View style={styles.preloadHidden} pointerEvents="none">
        {preloadStories.map((s) => (
          <Video
            key={`pre-${s.id}`}
            source={{ uri: s.video_url }}
            style={styles.preloadVideo}
            shouldPlay={false}
            isMuted
            resizeMode={ResizeMode.COVER}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  empty: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { color: '#999', fontSize: 15, fontWeight: '600' },

  drop: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
    overflow: 'hidden',
  },

  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },

  topRow: {
    position: 'absolute',
    top: 96,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  recentViewersPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
  },
  recentViewersText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  watchingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  watchingText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  muteBtn: {
    position: 'absolute',
    top: 100,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  actionsCol: {
    position: 'absolute',
    right: 12,
    bottom: 260,
    alignItems: 'center',
    gap: 4,
    zIndex: 5,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCount: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },

  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 100,
    zIndex: 4,
  },
  carouselContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: SCREEN_WIDTH * 0.7,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  carouselText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 17,
  },
  carouselUser: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  carouselSpacer: { color: 'transparent' },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sellerAvatar: { width: 28, height: 28, borderRadius: 14 },
  sellerAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarInitial: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  sellerUsername: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  titleChevron: {
    marginTop: 3,
  },
  productTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    flex: 1,
  },
  productDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },

  priceBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  priceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceBig: { color: '#00D2B8', fontSize: 36, fontWeight: '500', letterSpacing: -1 },
  freeShipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,210,184,0.10)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  freeShipText: {
    color: '#00D2B8',
    fontSize: 10,
    fontWeight: '600',
  },
  priceMeta: { alignItems: 'flex-end', marginBottom: 6 },
  priceDrop: { color: '#FFA502', fontSize: 12, fontWeight: '600' },
  priceMin: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },

  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: { height: '100%', borderRadius: 2 },

  buyBtn: {
    height: 48,
    backgroundColor: '#00D2B8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnDisabled: { backgroundColor: '#2A2A2A' },
  buyBtnText: { color: '#0F0F0F', fontSize: 15, fontWeight: '700' },
  buyBtnTextDisabled: { color: '#777' },

  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  menuCancel: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  menuCancelText: { color: '#999', fontSize: 14 },

  buyBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  buySheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 36,
  },
  buyHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 18,
  },
  buySheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  buyPriceWrap: {
    alignItems: 'center',
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  buyChf: { color: '#717976', fontSize: 16 },
  buyPriceValue: { color: '#00D2B8', fontSize: 40, fontWeight: '700' },
  buySubtitle: { color: '#717976', fontSize: 12, textAlign: 'center', marginTop: 4 },
  buyWarn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#0F0F0F',
    padding: 14,
    borderRadius: 12,
    marginTop: 18,
    alignItems: 'flex-start',
  },
  buyWarnText: { color: '#717976', fontSize: 12, flex: 1, lineHeight: 17 },
  buyConfirm: {
    height: 54,
    backgroundColor: '#00D2B8',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  buyConfirmText: { color: '#0F0F0F', fontSize: 16, fontWeight: '700' },
  buyCancel: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
  buyCancelText: { color: '#717976', fontSize: 14 },

  preloadHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    bottom: -100,
    right: -100,
  },
  preloadVideo: { width: 1, height: 1 },

  // ── Feed tabs ───────────────────────────────────────────────────────────────
  tabHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  inboxBtn: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  inboxBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF4757',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  inboxBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingBottom: 10,
  },
  tabBtn: {
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  tabLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabLabelInactive: {
    opacity: 0.5,
    fontWeight: '500',
  },
  tabUnderline: {
    marginTop: 3,
    height: 2,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },

  discoverBtn: {
    marginTop: 16,
    backgroundColor: '#00D2B8',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  discoverBtnText: {
    color: '#0F0F0F',
    fontSize: 14,
    fontWeight: '700',
  },
})

const detailStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    marginBottom: 4,
    position: 'relative',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 10,
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // Seller row
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  sellerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sellerAvatar: { width: 32, height: 32, borderRadius: 16 },
  sellerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerAvatarInitial: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  sellerUsername: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#00D2B8',
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#00D2B8',
  },
  followBtnText: { color: '#0F0F0F', fontSize: 12, fontWeight: '700' },
  followBtnTextActive: { color: '#00D2B8' },

  sellerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333',
    marginVertical: 16,
  },

  // Category
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.4)',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  categoryText: {
    color: '#00D2B8',
    fontSize: 12,
    fontWeight: '600',
  },

  // Text content
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 12,
  },
  description: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    lineHeight: 25,
  },

  // Price section
  priceLabel: {
    color: '#717976',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  priceBig: {
    color: '#00D2B8',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  freeShipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,210,184,0.10)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  freeShipText: {
    color: '#00D2B8',
    fontSize: 11,
    fontWeight: '600',
  },
  priceDrop: {
    color: '#FFA502',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  priceFloor: {
    color: '#717976',
    fontSize: 12,
  },

  expires: {
    color: '#717976',
    fontSize: 12,
    fontWeight: '500',
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
  },
  buyBtn: {
    height: 52,
    backgroundColor: '#00D2B8',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtnDisabled: { backgroundColor: '#2A2A2A' },
  buyBtnText: { color: '#0F0F0F', fontSize: 15, fontWeight: '700' },
  buyBtnTextDisabled: { color: '#555' },
})

const commentStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A1A1A' },
  sheet: { height: '85%', backgroundColor: '#1A1A1A', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  header: { paddingTop: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2A2A' },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginBottom: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  closeBtn: { padding: 4 },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  emptyTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginTop: 8 },
  emptySub: { color: '#888', fontSize: 13 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00D2B8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#0F0F0F', fontSize: 12, fontWeight: '700' },
  body: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  username: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  timeAgo: { color: '#888', fontSize: 11 },
  content: { color: '#FFFFFF', fontSize: 14, lineHeight: 21 },
  deleteBtn: { padding: 4, marginLeft: 4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#2A2A2A', marginLeft: 54 },
  replyBtn: { marginTop: 4 },
  replyBtnText: { fontSize: 12, color: '#888', fontWeight: '600' },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#222',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  replyBannerText: { fontSize: 13, color: '#aaa' },
  replyBannerUsername: { color: '#00D2B8', fontWeight: '700' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  inputAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00D2B8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputAvatarInitial: { color: '#0F0F0F', fontSize: 12, fontWeight: '700' },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 14,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00D2B8',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
