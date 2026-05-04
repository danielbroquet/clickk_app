import React, { useState } from 'react'
import { useUnreadMessages } from '../../hooks/useUnreadMessages'
import { useAuth } from '../../lib/auth'
import { useUnreadNotifCount } from './inbox'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native'
import { Tabs, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, spacing } from '../../lib/theme'
import i18n from '../../lib/i18n'

function SellButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.sellBtn} onPress={onPress}>
      <Ionicons name="add" size={28} color="#FFFFFF" />
    </TouchableOpacity>
  )
}

export default function TabLayout() {
  const [showSellModal, setShowSellModal] = useState(false)
  const { unreadCount } = useUnreadMessages()
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''
  const unreadNotifCount = useUnreadNotifCount(userId)
  const totalInboxBadge = unreadCount + unreadNotifCount

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Drops',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Découvrir',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sell"
          options={{
            title: '',
            tabBarButton: () => (
              <SellButton onPress={() => setShowSellModal(true)} />
            ),
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Messages',
            tabBarIcon: ({ focused, color }) => (
              <View>
                <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
                {totalInboxBadge > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{totalInboxBadge > 99 ? '99+' : totalInboxBadge}</Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="watchlist"
          options={{
            title: 'Watchlist',
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            ),
          }}
        />


      </Tabs>

      <Modal
        visible={showSellModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSellModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowSellModal(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{i18n.t('sell.modal_title')}</Text>
            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                setShowSellModal(false)
                router.push('/story/create')
              }}
            >
              <Ionicons name="videocam-outline" size={24} color={colors.primary} style={{ marginRight: spacing.md }} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{i18n.t('sell.option_story_title')}</Text>
                <Text style={styles.optionSub}>{i18n.t('sell.option_story_sub')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowSellModal(false)}
            >
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 68,
    paddingBottom: 8,
  },
  tabLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
  },
  sellBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: 12,
  },
  optionText: { flex: 1 },
  optionTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text },
  optionSub: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  cancelText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: colors.text },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF4757',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: fontFamily.bold,
    lineHeight: 11,
  },
})
