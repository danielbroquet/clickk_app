import { useState, useEffect, useCallback, useRef } from 'react'
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
  Alert,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useTranslation } from '../../lib/i18n'

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

function formatRelativeDate(iso: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('feed.now')
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h`
  const days = Math.floor(hrs / 24)
  return `${days} j`
}

export default function CommentsScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>()
  const { session, profile: authProfile } = useAuth()
  const { t } = useTranslation()
  const currentUserId = session?.user?.id ?? ''
  const currentUserProfile = {
    username: authProfile?.username ?? null,
    avatar_url: authProfile?.avatar_url ?? null,
  }

  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [count, setCount] = useState(0)
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [repliesMap, setRepliesMap] = useState<Record<string, Comment[]>>({})
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set())
  const listRef = useRef<FlatList<Comment>>(null)
  const inputRef = useRef<TextInput>(null)

  const fetchComments = useCallback(async () => {
    if (!storyId) return
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
    const { count: total } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('story_id', storyId)
    setCount(total ?? 0)

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
    if (!storyId) return
    fetchComments()

    const channel = supabase
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
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [storyId, fetchComments, currentUserId])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !currentUserId || sending) return
    const pendingReplyTo = replyTo

    inputRef.current?.focus()
    setSending(true)
    setInput('')
    setReplyTo(null)

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    }

    const tempId = `temp-${Date.now()}`

    if (!pendingReplyTo) {
      const optimisticComment: Comment = {
        id: tempId,
        content: text,
        created_at: new Date().toISOString(),
        user_id: currentUserId,
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
      setComments(prev => [optimisticComment, ...prev])
      setCount(n => n + 1)
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      }, 100)
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
      if (!pendingReplyTo) {
        setComments(prev => prev.filter(c => c.id !== tempId))
        setCount(n => Math.max(0, n - 1))
      }
      setInput(text)
      inputRef.current?.focus()
      return
    }

    if (pendingReplyTo) {
      setComments(prev => prev.map(c =>
        c.id === pendingReplyTo.id ? { ...c, replies_count: c.replies_count + 1 } : c
      ))
      fetchReplies(pendingReplyTo.id)
    } else {
      setComments(prev => prev.map(c =>
        c.id === tempId
          ? { ...c, id: data.id, created_at: data.created_at }
          : c
      ))
    }

    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleDelete = (c: Comment) => {
    Alert.alert(t('feed.delete_comment_title'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: async () => {
          setComments(prev => prev.filter(x => x.id !== c.id))
          setCount(n => Math.max(0, n - 1))
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
              {formatRelativeDate(comment.created_at, t)}
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

        <View style={{ alignItems: 'center', marginLeft: 12 }}>
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
                ? t('feed.hide_replies')
                : item.replies_count > 1
                  ? t('feed.show_replies_plural', { count: item.replies_count })
                  : t('feed.show_replies', { count: item.replies_count })}
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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('comments.title')}{count > 0 ? ` · ${count}` : ''}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color="#00D2B8" />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.centerFill}>
            <Ionicons name="chatbubble-outline" size={48} color="#444" />
            <Text style={styles.emptyTitle}>{t('comments.empty')}</Text>
            <Text style={styles.emptySub}>{t('comments.first')}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 8 }}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D2B8" />
            }
          />
        )}

        {replyTo && (
          <View style={styles.replyBanner}>
            <Text style={{ color: '#A0A0A0', fontSize: 12 }}>
              Réponse à <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>@{replyTo.username}</Text>
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Ionicons name="close" size={16} color="#A0A0A0" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputBar}>
          {currentUserProfile.avatar_url ? (
            <Image source={{ uri: currentUserProfile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.inputAvatarFallback}>
              <Text style={styles.inputAvatarInitial}>
                {(currentUserProfile.username ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={t('comments.placeholder')}
            placeholderTextColor="#666"
            value={input}
            onChangeText={setInput}
            maxLength={300}
            multiline
            blurOnSubmit={false}
            editable={!!currentUserId && !sending}
          />
          {input.trim().length > 0 && (
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={handleSend}
              disabled={sending}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#0F0F0F" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#0F0F0F" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F0F' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
    backgroundColor: '#0F0F0F',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  emptyTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginTop: 8 },
  emptySub: { color: '#888', fontSize: 13 },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#1A1A1A',
    justifyContent: 'space-between',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
    backgroundColor: '#0F0F0F',
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
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
