import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

type Address = {
  id: string
  full_name: string
  line1: string
  line2: string | null
  postal_code: string
  city: string
  country: string
  phone: string | null
  is_default: boolean
}

const C = {
  bg: '#0F0F0F',
  primary: '#00D2B8',
  surface: '#1A1A1A',
  text: '#FFFFFF',
  muted: '#717976',
  danger: '#FF4757',
  border: '#2A2A2A',
}

export default function ShippingAddressScreen() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>()

  const [existing, setExisting] = useState<Address[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'pick' | 'form'>('form')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/(auth)/login')
        return
      }

      const { data } = await supabase
        .from('shipping_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      const addresses = (data as Address[]) || []
      setExisting(addresses)
      if (addresses.length > 0) {
        setMode('pick')
        setSelectedId(addresses[0].id)
      }
      setLoading(false)
    })()
  }, [])

  const validate = () => {
    if (!fullName.trim()) return 'Nom et prénom requis'
    if (!line1.trim()) return 'Adresse requise'
    if (!postalCode.trim()) return 'Code postal requis'
    if (!city.trim()) return 'Ville requise'
    return null
  }

  const attachToStory = async (addressId: string) => {
    if (!storyId) return
    const { error: err } = await supabase
      .from('stories')
      .update({ shipping_address_id: addressId })
      .eq('id', storyId)
    if (err) throw err
  }

  const handleConfirmPick = async () => {
    if (!selectedId) return
    setSaving(true)
    setError(null)
    try {
      await attachToStory(selectedId)
      router.replace('/(tabs)/profile')
    } catch (e: any) {
      setError(e.message ?? 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNew = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const isFirst = existing.length === 0

      const { data: created, error: insertErr } = await supabase
        .from('shipping_addresses')
        .insert({
          user_id: user.id,
          full_name: fullName.trim(),
          line1: line1.trim(),
          line2: line2.trim() || null,
          postal_code: postalCode.trim(),
          city: city.trim(),
          country: 'CH',
          phone: phone.trim() || null,
          is_default: isFirst,
        })
        .select('id')
        .maybeSingle()

      if (insertErr) throw insertErr
      if (!created?.id) throw new Error('save_failed')

      await attachToStory(created.id)
      router.replace('/(tabs)/profile')
    } catch (e: any) {
      setError(e.message ?? 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Ionicons name="checkmark-circle" size={20} color={C.primary} />
          <Text style={styles.headerBadgeText}>Achat confirmé</Text>
        </View>
        <Text style={styles.title}>Où on t'envoie ça ?</Text>
        <Text style={styles.subtitle}>
          Indique ton adresse pour que le vendeur puisse expédier ton colis.
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {mode === 'pick' && existing.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Tes adresses</Text>
              {existing.map((a) => {
                const active = a.id === selectedId
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.addressCard, active && styles.addressCardActive]}
                    onPress={() => setSelectedId(a.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.radioOuter}>
                      {active && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressName}>{a.full_name}</Text>
                      <Text style={styles.addressLine}>
                        {a.line1}{a.line2 ? `, ${a.line2}` : ''}
                      </Text>
                      <Text style={styles.addressLine}>
                        {a.postal_code} {a.city}, {a.country}
                      </Text>
                      {a.is_default && (
                        <Text style={styles.addressDefault}>Par défaut</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )
              })}

              <TouchableOpacity
                style={styles.newBtn}
                onPress={() => setMode('form')}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={18} color={C.primary} />
                <Text style={styles.newBtnText}>Ajouter une nouvelle adresse</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'form' && (
            <>
              {existing.length > 0 && (
                <TouchableOpacity
                  style={styles.backToPick}
                  onPress={() => setMode('pick')}
                >
                  <Ionicons name="chevron-back" size={16} color={C.muted} />
                  <Text style={styles.backToPickText}>Choisir une adresse existante</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.sectionLabel}>Nouvelle adresse</Text>

              <Text style={styles.fieldLabel}>Nom et prénom</Text>
              <TextInput
                style={styles.input}
                placeholder="Marc Dupont"
                placeholderTextColor={C.muted}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Adresse</Text>
              <TextInput
                style={styles.input}
                placeholder="Rue du Lac 12"
                placeholderTextColor={C.muted}
                value={line1}
                onChangeText={setLine1}
              />

              <Text style={styles.fieldLabel}>Complément (optionnel)</Text>
              <TextInput
                style={styles.input}
                placeholder="Appartement, étage, code..."
                placeholderTextColor={C.muted}
                value={line2}
                onChangeText={setLine2}
              />

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>NPA</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1003"
                    placeholderTextColor={C.muted}
                    value={postalCode}
                    onChangeText={setPostalCode}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 2, marginLeft: 10 }}>
                  <Text style={styles.fieldLabel}>Ville</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Lausanne"
                    placeholderTextColor={C.muted}
                    value={city}
                    onChangeText={setCity}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Téléphone (optionnel)</Text>
              <TextInput
                style={styles.input}
                placeholder="+41 79 000 00 00"
                placeholderTextColor={C.muted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <View style={styles.countryHint}>
                <Ionicons name="flag-outline" size={14} color={C.muted} />
                <Text style={styles.countryHintText}>
                  Livraison en Suisse uniquement pour le moment
                </Text>
              </View>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, saving && { opacity: 0.6 }]}
            onPress={mode === 'pick' ? handleConfirmPick : handleSaveNew}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  {mode === 'pick' ? 'Confirmer cette adresse' : 'Enregistrer et confirmer'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#000" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,210,184,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  headerBadgeText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  title: { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 20 },
  content: { padding: 20, paddingBottom: 40 },
  sectionLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  addressCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  addressCardActive: {
    borderColor: C.primary,
    backgroundColor: 'rgba(0,210,184,0.06)',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.primary,
  },
  addressName: { color: C.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  addressLine: { color: C.muted, fontSize: 13, lineHeight: 18 },
  addressDefault: {
    color: C.primary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 10,
  },
  newBtnText: { color: C.primary, fontSize: 14, fontWeight: '600' },
  backToPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 12,
  },
  backToPickText: { color: C.muted, fontSize: 13 },
  fieldLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
  },
  row: { flexDirection: 'row' },
  countryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 2,
  },
  countryHintText: { color: C.muted, fontSize: 12 },
  error: {
    color: C.danger,
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  cta: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaText: { color: '#000', fontSize: 16, fontWeight: '700' },
})
