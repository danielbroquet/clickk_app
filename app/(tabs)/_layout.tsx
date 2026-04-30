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

interface SellOption {
  icon: string
  title: string
  subtitle: string
}

const SELL_OPTIONS: SellOption[] = [
  { icon: '📸', title: i18n.t('sell.option_story_title'), subtitle: i18n.t('sell.option_story_sub') },
  { icon: '🏪', title: i18n.t('sell.option_listing_title'), subtitle: i18n.t('sell.option_listing_sub') },
]

export default function TabLayout() {
  const [showSellModal, setShowSellModal] = useState(false)
  const { unreadCount } = useUnreadMessages()
  const { profile, session } = useAuth()
  const isSeller = profile?.role === 'seller'
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
            title: 'Feed',
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
            title: 'Inbox',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={22} color={color} />
            ),
            tabBarBadge: totalInboxBadge > 0 ? totalInboxBadge : undefined,
            tabBarBadgeStyle: {
              backgroundColor: '#00D2B8',
              color: '#0F0F0F',
              fontSize: 10,
            },
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
            {SELL_OPTIONS.map((opt, index) => (
              <TouchableOpacity
                key={opt.title}
                style={styles.option}
                onPress={() => {
                  setShowSellModal(false)
                  if (index === 0) {
                    router.push('/story/create')
                  } else {
                    router.push('/listing/create')
                  }
                }}
              >
                <Text style={styles.optionIcon}>{opt.icon}</Text>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{opt.title}</Text>
                  <Text style={styles.optionSub}>{opt.subtitle}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {isSeller && (
              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  setShowSellModal(false)
                  router.push('/(seller)/listings')
                }}
              >
                <Ionicons name="list-outline" size={24} color={colors.primary} style={{ marginRight: spacing.md }} />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{i18n.t('sell.my_listings')}</Text>
                  <Text style={styles.optionSub}>{i18n.t('sell.my_listings_sub')}</Text>
                </View>
              </TouchableOpacity>
            )}
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
  optionIcon: { fontSize: 24, marginRight: spacing.md },
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
})
