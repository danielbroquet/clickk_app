import { View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

export default function CreateStoryScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0F0F0F' }}>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 16 }}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontFamily: 'Montserrat-Bold', fontSize: 20 }}>
          Créer une Story
        </Text>
        <Text style={{ color: '#A0A0A0', marginTop: 8 }}>Bientôt disponible</Text>
      </View>
    </SafeAreaView>
  )
}
