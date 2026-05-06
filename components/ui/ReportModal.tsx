import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, fontSize, spacing } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'

type ReportReason =
  | 'inappropriate'
  | 'violence'
  | 'fraud'
  | 'counterfeit'
  | 'illegal'
  | 'spam'
  | 'harassment'
  | 'other'

interface ReportModalProps {
  visible: boolean
  onClose: () => void
  targetType: 'story' | 'listing' | 'user' | 'message'
  targetId: string
}

const REASONS: { key: ReportReason; labelKey: string }[] = [
  { key: 'inappropriate', labelKey: 'report.reason_inappropriate' },
  { key: 'violence',      labelKey: 'report.reason_violence' },
  { key: 'fraud',         labelKey: 'report.reason_fraud' },
  { key: 'counterfeit',   labelKey: 'report.reason_counterfeit' },
  { key: 'illegal',       labelKey: 'report.reason_illegal' },
  { key: 'spam',          labelKey: 'report.reason_spam' },
  { key: 'harassment',    labelKey: 'report.reason_harassment' },
  { key: 'other',         labelKey: 'report.reason_other' },
]

export default function ReportModal({ visible, onClose, targetType, targetId }: ReportModalProps) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setSelectedReason(null)
    setDescription('')
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!selectedReason || !session?.user?.id) return
    setLoading(true)
    setError(null)

    const { error: insertError } = await supabase.from('reports').insert({
      reporter_id: session.user.id,
      target_type: targetType,
      target_id: targetId,
      reason: selectedReason,
      description: description.trim() || null,
    })

    setLoading(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setError(t('report.already_reported'))
      } else {
        setError(t('common.error'))
      }
      return
    }

    reset()
    onClose()
    Alert.alert(t('report.success_title'), t('report.success_body'))
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('report.title')}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>{t('report.subtitle')}</Text>

          {/* Reason list */}
          <View style={styles.reasonList}>
            {REASONS.map((item, index) => {
              const selected = selectedReason === item.key
              const isLast = index === REASONS.length - 1
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.reasonRow, !isLast && styles.reasonRowBorder]}
                  onPress={() => setSelectedReason(item.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                    {t(item.labelKey)}
                  </Text>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Description textarea */}
          <View style={styles.textareaWrapper}>
            <Text style={styles.textareaLabel}>{t('report.details_label')}</Text>
            <TextInput
              style={styles.textarea}
              placeholder={t('report.details_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={text => setDescription(text.slice(0, 500))}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{description.length}/500</Text>
          </View>

          {/* Inline error */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={15} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, (!selectedReason || loading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!selectedReason || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.submitText}>{t('report.submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.headline,
    color: colors.text,
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  subtitle: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.textSecondary,
  },
  reasonList: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  reasonRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reasonLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  reasonLabelSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  textareaWrapper: {
    gap: spacing.xs,
  },
  textareaLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  textarea: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    color: colors.text,
    minHeight: 100,
  },
  charCount: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 8,
    padding: spacing.sm,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.error,
    flex: 1,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.bg,
  },
})
