import React, { useState } from 'react'
import { useUnreadMessages } from '../../hooks/useUnreadMessages'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  StyleSheet,
  Pressable,
} from 'react-native'
import { Tabs, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, fontFamily, spacing } from '../../lib/theme'

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
  { icon: '📸', title: 'Créer une Story', subtitle: 'Enchère hollandaise — prix descendant' },
  { icon: '🏪', title: 'Publier un article', subtitle: 'Vente directe dans ton shop' },
  { icon: '🔨', title: 'Créer une enchère', subtitle: 'Les acheteurs misent en temps réel' },
]

export default function TabLayout() {
  const [showSellModal, setShowSellModal] = useState(false)
  const { unreadCount } = useUnreadMessages()

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sell"
          options={{
            tabBarButton: () => (
              <SellButton onPress={() => setShowSellModal(true)} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? 'notifications' : 'notifications-outline'}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? 'chatbubble' : 'chatbubble-outline'}
                size={24}
                color={color}
              />
            ),
            tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: '#00D2B8',
              color: '#0F0F0F',
              fontSize: 10,
            },
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
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
            <Text style={styles.sheetTitle}>Que veux-tu vendre ?</Text>
            {SELL_OPTIONS.map((opt, index) => (
              <TouchableOpacity
                key={opt.title}
                style={styles.option}
                onPress={() => {
                  if (index === 0) {
                    setShowSellModal(false)
                    router.push('/story/create')
                  } else if (index === 1) {
                    setShowSellModal(false)
                    router.push('/listing/create')
                  } else {
                    setShowSellModal(false)
                    Alert.alert('Bientôt disponible', 'Les enchères classiques arrivent prochainement.')
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
    height: 60,
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
