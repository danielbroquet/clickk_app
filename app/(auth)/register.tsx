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

export default function RegisterScreen() {
  const router = useRouter()
  const { signUp } = useAuth()

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [focus, setFocus] = useState<Record<string, boolean>>({})

  const handleRegister = async () => {
    const errs: Record<string, string> = {}
    if (!email.trim()) errs.email = 'Email requis'
    if (!/^[a-z0-9_]{3,}$/.test(username))
      errs.username = 'Username invalide (min 3 cars, minuscules)'
    if (password.length < 8) errs.password = 'Mot de passe trop court'
    if (confirm !== password) errs.confirm = 'Les mots de passe ne correspondent pas'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    const { error } = await signUp(email.trim(), password, username)
    setLoading(false)
    if (error) setErrors({ submit: error })
  }

  const setF = (key: string, val: boolean) => setFocus(prev => ({ ...prev, [key]: val }))

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
        <Text style={styles.slogan}>Crée ton compte</Text>

        <View style={styles.fieldWrap}>
          <TextInput
            style={[styles.input, focus.email && styles.inputFocus]}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setF('email', true)}
            onBlur={() => setF('email', false)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {!!errors.email && <Text style={styles.err}>{errors.email}</Text>}
        </View>

        <View style={styles.fieldWrap}>
          <View style={[styles.input, styles.prefixRow, focus.username && styles.inputFocus]}>
            <Text style={styles.prefix}>@</Text>
            <TextInput
              style={styles.prefixInput}
              placeholder="username"
              placeholderTextColor={colors.textSecondary}
              value={username}
              onChangeText={v => setUsername(v.toLowerCase())}
              onFocus={() => setF('username', true)}
              onBlur={() => setF('username', false)}
              autoCapitalize="none"
            />
          </View>
          {!!errors.username && <Text style={styles.err}>{errors.username}</Text>}
        </View>

        <View style={styles.fieldWrap}>
          <TextInput
            style={[styles.input, focus.password && styles.inputFocus]}
            placeholder="Mot de passe"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setF('password', true)}
            onBlur={() => setF('password', false)}
            secureTextEntry
          />
          {!!errors.password && <Text style={styles.err}>{errors.password}</Text>}
        </View>

        <View style={styles.fieldWrap}>
          <TextInput
            style={[styles.input, focus.confirm && styles.inputFocus]}
            placeholder="Confirmer le mot de passe"
            placeholderTextColor={colors.textSecondary}
            value={confirm}
            onChangeText={setConfirm}
            onFocus={() => setF('confirm', true)}
            onBlur={() => setF('confirm', false)}
            secureTextEntry
          />
          {!!errors.confirm && <Text style={styles.err}>{errors.confirm}</Text>}
        </View>

        {!!errors.submit && <Text style={[styles.err, { marginBottom: 8 }]}>{errors.submit}</Text>}

        <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
          {loading
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={styles.btnText}>Créer mon compte</Text>}
        </TouchableOpacity>

        <View style={styles.linkRow}>
          <Text style={styles.linkGray}>Déjà un compte ? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.linkTeal}>Se connecter</Text>
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
  prefixRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0 },
  prefix: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textSecondary,
    paddingLeft: 16,
    paddingRight: 4,
  },
  prefixInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    height: 52,
  },
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
