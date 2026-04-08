import { useState } from 'react'
import { View, Text, TextInput, Pressable, Platform, ActivityIndicator, KeyboardAvoidingView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { ArrowLeft, Check } from 'lucide-react-native'

export default function PersonalInfoScreen() {
  const router = useRouter()
  const profile = useAuthStore(s => s.profile)
  const session = useAuthStore(s => s.session)
  const updateProfile = useAuthStore(s => s.updateProfile)
  const loading = useAuthStore(s => s.loading)
  const c = useThemeColors()

  const [name, setName] = useState(profile?.display_name ?? '')
  const [nameFocused, setNameFocused] = useState(false)
  const [saved, setSaved] = useState(false)

  const email = session?.user?.email ?? profile?.email ?? ''
  const hasChanges = name.trim() !== (profile?.display_name ?? '')

  const handleSave = async () => {
    if (!hasChanges || !name.trim()) return
    try {
      await updateProfile({ display_name: name.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save', text2: 'Please try again' })
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
        }}>
          <Pressable
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(settings)')}
            style={{ padding: 8 }}
          >
            <ArrowLeft size={22} color={c.text} />
          </Pressable>
          <Text style={{
            fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text,
            flex: 1, textAlign: 'center', marginRight: 30,
          }}>
            Personal Info
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 16, flex: 1 }}>
          {/* Name */}
          <Text style={{
            fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
            letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
          }}>
            Display Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={c.placeholder}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            autoCorrect={false}
            style={{
              fontFamily: 'Geist-Regular', fontSize: 16, color: c.text,
              borderWidth: 1, borderColor: nameFocused ? c.borderFocus : c.border,
              borderRadius: 10, paddingHorizontal: 14, height: 48,
              marginBottom: 24,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
          />

          {/* Email (read-only) */}
          <Text style={{
            fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
            letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
          }}>
            Email
          </Text>
          <View style={{
            borderWidth: 1, borderColor: c.border, borderRadius: 10,
            paddingHorizontal: 14, height: 48, justifyContent: 'center',
            backgroundColor: c.surface,
          }}>
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 16, color: c.textMuted }}>
              {email}
            </Text>
          </View>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted,
            marginTop: 6,
          }}>
            Email cannot be changed
          </Text>

          <View style={{ flex: 1 }} />

          {/* Save Button */}
          <Pressable
            onPress={handleSave}
            disabled={!hasChanges || loading}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, backgroundColor: hasChanges ? c.accent : c.surface,
              borderRadius: 12, paddingVertical: 16, marginBottom: 24,
              opacity: !hasChanges ? 0.4 : pressed ? 0.85 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={c.accentText} size="small" />
            ) : saved ? (
              <>
                <Check size={18} color={c.success} />
                <Text style={{ fontFamily: 'Geist-Medium', fontSize: 16, color: c.success }}>
                  Saved
                </Text>
              </>
            ) : (
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 16,
                color: hasChanges ? c.accentText : c.textMuted,
              }}>
                Save Changes
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
