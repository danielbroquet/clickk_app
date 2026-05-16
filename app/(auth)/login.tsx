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
  Alert,
  StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as AppleAuthentication from 'expo-apple-authentication'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { colors, fontFamily, spacing } from '../../lib/theme'
import { useTranslation } from '../../lib/i18n'
import LanguageSelector from '../../components/LanguageSelector'

GoogleSignin.configure({
  webClientId: '568448664963-98ol47cd34u54vmi299m1pf114t64be2.apps.googleusercontent.com',
  iosClientId: '568448664963-4gdsohps2operj8u4mn3qrcoj8ede507.apps.googleusercontent.com',
})

export default function LoginScreen() {
  const router = useRouter()
  const { signIn } = useAuth()
  const { t } = useTranslation()

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
    if (!email.trim()) { setEmailError(t('auth.email_required')); valid = false }
    if (!password) { setPasswordError(t('auth.password_required')); valid = false }
    if (!valid) return
    setLoading(true)
    const { error } = await signIn(email.trim(), password)
    setLoading(false)
    if (error) {
      setPasswordError(error)
      return
    }
  }

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      const identityToken = credential.identityToken
      if (!identityToken) {
        Alert.alert('Error', 'No identity token received from Apple.')
        return
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
      })
      if (error) {
        Alert.alert('Error', error.message)
        return
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', e.message ?? 'Apple sign in failed.')
      }
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      GoogleSignin.configure({
        webClientId: '568448664963-98ol47cd34u54vmi299m1pf114t64be2.apps.googleusercontent.com',
        iosClientId: '568448664963-4gdsohps2operj8u4mn3qrcoj8ede507.apps.googleusercontent.com',
        scopes: ['email', 'profile'],
        offlineAccess: false,
      })

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false })
      }

      const response = await GoogleSignin.signIn()

      let idToken: string | null = null

      if (response && (response as any).type === 'success' && (response as any).data) {
        idToken = (response as any).data.idToken ?? null
      } else if ((response as any).idToken) {
        idToken = (response as any).idToken
      } else if ((response as any).data?.idToken) {
        idToken = (response as any).data.idToken
      }

      if (!idToken) {
        console.warn('Google Sign-In: no idToken in response', JSON.stringify(response))
        Alert.alert('Error', 'No ID token received from Google.')
        return
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })

      if (error) {
        Alert.alert('Error', error.message)
        return
      }
    } catch (e: any) {
      const cancelCodes = [
        '-5', '12501', 'SIGN_IN_CANCELLED',
        'CANCELLED', 'CANCELED', 'ERR_REQUEST_CANCELED',
        'USER_CANCELED', 'ASYNC_OP_CANCELED'
      ]
      const code = String(e?.code ?? '')
      if (!cancelCodes.includes(code)) {
        const msg = e?.message ?? 'Google sign in failed.'
        console.error('Google Sign-In error:', code, msg, JSON.stringify(e))
        Alert.alert('Error', msg)
      }
    }
  }

  return (
    <View style={styles.flex}>
      <LanguageSelector />
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
        <Text style={styles.slogan}>{t('auth.slogan')}</Text>

        <View style={styles.fieldWrap}>
          <TextInput
            style={[styles.input, focusEmail && styles.inputFocus]}
            placeholder={t('auth.email_placeholder')}
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
            placeholder={t('auth.password_placeholder')}
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
            : <Text style={styles.btnText}>{t('auth.login_btn')}</Text>}
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={100}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
        )}

        <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn} activeOpacity={0.85}>
          <View style={styles.googleLogoWrap}>
            <Text style={styles.googleLogoG}>G</Text>
          </View>
          <Text style={styles.googleBtnText}>{t('auth.google_btn')}</Text>
        </TouchableOpacity>

        <View style={styles.linkRow}>
          <Text style={styles.linkGray}>{t('auth.no_account')} </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.linkTeal}>{t('auth.register_link')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  appleBtn: { height: 52, marginTop: spacing.md },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 100,
    height: 52,
    marginTop: spacing.md,
  },
  googleLogoWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  googleLogoG: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#3c4043',
  },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  linkGray: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.textSecondary },
  linkTeal: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.primary },
})
