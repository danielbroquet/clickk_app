import { useEffect, useState, useCallback } from 'react'
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
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, Stack } from 'expo-router'
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

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Address | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('shipping_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
    setAddresses((data as Address[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setDefault = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('shipping_addresses')
      .update({ is_default: false })
      .eq('user_id', user.id)
    await supabase
      .from('shipping_addresses')
      .update({ is_default: true })
      .eq('id', id)
    load()
  }

  const remove = async (id: string) => {
    Alert.alert('Supprimer', 'Retirer cette adresse ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('shipping_addresses').delete().eq('id', id)
          load()
        },
      },
    ])
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

  if (editing || creating) {
    return (
      <AddressForm
        initial={editing}
        onCancel={() => {
          setEditing(null)
          setCreating(false)
        }}
        onSaved={() => {
          setEditing(null)
          setCreating(false)
          load()
        }}
      />
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes adresses</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {addresses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={52} color={C.muted} />
            <Text style={styles.emptyTitle}>Aucune adresse enregistrée</Text>
            <Text style={styles.emptyText}>
              Ton adresse sera automatiquement enregistrée après ton premier achat.
            </Text>
          </View>
        ) : (
          addresses.map((a) => (
            <View key={a.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{a.full_name}</Text>
                {a.is_default && (
                  <View style={styles.defaultTag}>
                    <Text style={styles.defaultTagText}>Par défaut</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardLine}>
                {a.line1}{a.line2 ? `, ${a.line2}` : ''}
              </Text>
              <Text style={styles.cardLine}>
                {a.postal_code} {a.city}, {a.country}
              </Text>
              {a.phone && <Text style={styles.cardLineMuted}>{a.phone}</Text>}

              <View style={styles.cardActions}>
                {!a.is_default && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setDefault(a.id)}
                  >
                    <Text style={styles.actionText}>Définir par défaut</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setEditing(a)}
                >
                  <Ionicons name="create-outline" size={14} color={C.text} />
                  <Text style={styles.actionText}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => remove(a.id)}
                >
                  <Ionicons name="trash-outline" size={14} color={C.danger} />
                  <Text style={[styles.actionText, { color: C.danger }]}>
                    Supprimer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setCreating(true)}
        >
          <Ionicons name="add" size={18} color={C.primary} />
          <Text style={styles.addBtnText}>Ajouter une adresse</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function AddressForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Address | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [line1, setLine1] = useState(initial?.line1 ?? '')
  const [line2, setLine2] = useState(initial?.line2 ?? '')
  const [postalCode, setPostalCode] = useState(initial?.postal_code ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validate = () => {
    if (!fullName.trim()) return 'Nom requis'
    if (!line1.trim()) return 'Adresse requise'
    if (!postalCode.trim()) return 'NPA requis'
    if (!city.trim()) return 'Ville requise'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) {
      setError(err)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      const payload = {
        full_name: fullName.trim(),
        line1: line1.trim(),
        line2: line2.trim() || null,
        postal_code: postalCode.trim(),
        city: city.trim(),
        country: 'CH',
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (initial) {
        const { error: updErr } = await supabase
          .from('shipping_addresses')
          .update(payload)
          .eq('id', initial.id)
        if (updErr) throw updErr
      } else {
        const { count } = await supabase
          .from('shipping_addresses')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        const { error: insErr } = await supabase
          .from('shipping_addresses')
          .insert({
            ...payload,
            user_id: user.id,
            is_default: (count ?? 0) === 0,
          })
        if (insErr) throw insErr
      }

      onSaved()
    } catch (e: any) {
      setError(e.message ?? 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {initial ? 'Modifier' : 'Nouvelle adresse'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.fieldLabel}>Nom et prénom</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            placeholderTextColor={C.muted}
            placeholder="Marc Dupont"
          />

          <Text style={styles.fieldLabel}>Adresse</Text>
          <TextInput
            style={styles.input}
            value={line1}
            onChangeText={setLine1}
            placeholderTextColor={C.muted}
            placeholder="Rue du Lac 12"
          />

          <Text style={styles.fieldLabel}>Complément (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={line2}
            onChangeText={setLine2}
            placeholderTextColor={C.muted}
            placeholder="Appartement, étage"
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>NPA</Text>
              <TextInput
                style={styles.input}
                value={postalCode}
                onChangeText={setPostalCode}
                keyboardType="number-pad"
                placeholderTextColor={C.muted}
                placeholder="1003"
              />
            </View>
            <View style={{ flex: 2, marginLeft: 10 }}>
              <Text style={styles.fieldLabel}>Ville</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholderTextColor={C.muted}
                placeholder="Lausanne"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Téléphone (optionnel)</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={C.muted}
            placeholder="+41 79 000 00 00"
          />

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.ctaText}>Enregistrer</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '600' },
  content: { padding: 20, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyText: { color: C.muted, fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardName: { color: C.text, fontSize: 15, fontWeight: '600' },
  defaultTag: {
    backgroundColor: 'rgba(0,210,184,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  defaultTagText: { color: C.primary, fontSize: 10, fontWeight: '700' },
  cardLine: { color: C.muted, fontSize: 13, lineHeight: 18 },
  cardLineMuted: { color: C.muted, fontSize: 12, marginTop: 2 },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.bg,
    borderRadius: 6,
  },
  actionText: { color: C.text, fontSize: 12, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,210,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,210,184,0.25)',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  addBtnText: { color: C.primary, fontSize: 14, fontWeight: '600' },
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
  error: { color: C.danger, fontSize: 13, marginTop: 14, textAlign: 'center' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  cta: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#000', fontSize: 16, fontWeight: '700' },
})
