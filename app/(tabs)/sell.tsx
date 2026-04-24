import { View, StyleSheet } from 'react-native'
import { colors } from '../../lib/theme'

// Placeholder screen — sell modal is handled in tabs _layout.tsx
export default function SellScreen() {
  return <View style={styles.container} />
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
})
