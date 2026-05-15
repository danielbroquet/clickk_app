import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native'
import { Globe, Check } from 'lucide-react-native'
import { setAppLanguage, SUPPORTED_LOCALES, LOCALE_LABELS, useTranslation } from '../lib/i18n'
import type { Locale } from '../lib/i18n'
import { colors, fontFamily, spacing } from '../lib/theme'

export default function LanguageSelector() {
  const { locale } = useTranslation()
  const [visible, setVisible] = useState(false)

  const handleSelect = (l: Locale) => {
    setAppLanguage(l)
    setVisible(false)
  }

  return (
    <>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
      >
        <Globe size={14} color={colors.primary} strokeWidth={2} />
        <Text style={styles.pillText}>{locale.toUpperCase()}</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            {SUPPORTED_LOCALES.map((l, idx) => (
              <TouchableOpacity
                key={l}
                style={[styles.option, idx < SUPPORTED_LOCALES.length - 1 && styles.optionBorder]}
                onPress={() => handleSelect(l)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, l === locale && styles.optionTextActive]}>
                  {LOCALE_LABELS[l]}
                </Text>
                {l === locale && <Check size={16} color={colors.primary} strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,210,184,0.12)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    width: '100%',
    maxWidth: 320,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  optionTextActive: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
  },
})
