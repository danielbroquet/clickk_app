import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { colors, fontFamily, spacing } from '../../lib/theme'

export default function LoginScreen() {
  const router = useRouter()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focusEmail, setFocusEmail] = useState(false)
  const [focusPassword, setFocusPassword] = useState(false)

  const handleLogin = async () => {
    setEmailError('')
    setPasswordError('')
    let valid = true
    if (!email.trim()) { setEmailError('Email requis'); valid = false }
    if (!password) { setPasswordError('Mot de passe requis'); valid = false }
    if (!valid) return
    setLoading(true)
    const { error } = await signIn(email.trim(), password)
    setLoading(false)
    if (error) setPasswordError(error)
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoRow}>
          <Text style={styles.logoBlack}>click</Text>
          <Text style={styles.logoTeal}>«</Text>
        </View>
        <Text style={styles.slogan}>L'Instagram des bonnes affaires</Text>

        <View style={styles.fieldWrap}>
          <TextInput
            style={[styles.input, focusEmail && styles.inputFocus]}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusEmail(true)}
            onBlur={() => setFocusEmail(false)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {!!emailError && <Text style={styles.err}>{emailError}</Text>}
        </View>

        <View style={styles.fieldWrap}>
          <TextInput
            style={[styles.input, focusPassword && styles.inputFocus]}
            placeholder="Mot de passe"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusPassword(true)}
            onBlur={() => setFocusPassword(false)}
            secureTextEntry
          />
          {!!passwordError && <Text style={styles.err}>{passwordError}</Text>}
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={styles.btnText}>Se connecter</Text>}
        </TouchableOpacity>

        <View style={styles.linkRow}>
          <Text style={styles.linkGray}>Pas encore de compte ? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.linkTeal}>S'inscrire</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  logoRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', marginBottom: 8 },
  logoBlack: { fontFamily: fontFamily.bold, fontSize: 36, color: colors.text },
  logoTeal: { fontFamily: fontFamily.bold, fontSize: 36, color: colors.primary },
  slogan: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 32,
  },
  fieldWrap: { marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 52,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    paddingHorizontal: 16,
  },
  inputFocus: { borderColor: colors.primary },
  err: { color: colors.error, fontSize: 12, marginTop: 4, fontFamily: fontFamily.regular },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 100,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  btnText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.bg },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  linkGray: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
  linkTeal: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.primary },
})
