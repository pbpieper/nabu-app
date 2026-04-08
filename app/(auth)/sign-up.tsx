import { useState, useRef } from 'react'
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, type TextInput as TI,
} from 'react-native'
import { Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeStore } from '@src/stores/useThemeStore'

export default function SignUpScreen() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const emailRef = useRef<TI>(null)
  const passRef = useRef<TI>(null)
  const signUp = useAuthStore(s => s.signUp)
  const loading = useAuthStore(s => s.loading)
  const dark = useThemeStore(s => s.resolvedTheme) === 'dark'

  const c = {
    bg: dark ? '#09090B' : '#FFFFFF',
    border: dark ? '#27272A' : '#E4E4E7',
    borderFocus: dark ? '#52525B' : '#A1A1AA',
    text: dark ? '#FAFAFA' : '#09090B',
    muted: dark ? '#71717A' : '#71717A',
    placeholder: dark ? '#3F3F46' : '#A1A1AA',
    btnBg: dark ? '#FAFAFA' : '#18181B',
    btnText: dark ? '#18181B' : '#FAFAFA',
  }

  const handleSignUp = async () => {
    if (!email || !password) return
    try {
      await signUp(email, password, name || undefined)
      Toast.show({ type: 'success', text1: 'Account created', text2: 'Check your email to verify' })
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Sign up failed', text2: err.message })
    }
  }

  const disabled = loading || !email || !password

  const inputStyle = (focused: boolean) => ({
    fontFamily: 'Geist-Regular' as const, fontSize: 15, color: c.text,
    borderWidth: 1, borderColor: focused ? c.borderFocus : c.border,
    borderRadius: 8, paddingHorizontal: 14, height: 44, marginBottom: 20,
    backgroundColor: 'transparent' as const,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{
          flex: 1, justifyContent: 'center',
          paddingHorizontal: 24, maxWidth: 400, width: '100%', alignSelf: 'center',
        }}>

          {/* Header */}
          <Text style={{
            fontFamily: 'Geist-Medium', fontSize: 13, color: c.muted,
            letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8,
          }}>
            Nabu
          </Text>
          <Text style={{
            fontFamily: 'Geist-SemiBold', fontSize: 26, color: c.text,
            letterSpacing: -0.5, marginBottom: 6,
          }}>
            Create an account
          </Text>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 15, color: c.muted,
            marginBottom: 36,
          }}>
            Enter your details to get started
          </Text>

          {/* Name */}
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.text, marginBottom: 6 }}>
            Name
          </Text>
          <TextInput
            value={name} onChangeText={setName}
            placeholder="Your name (optional)"
            placeholderTextColor={c.placeholder}
            textContentType="name" returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            style={inputStyle(false)}
          />

          {/* Email */}
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.text, marginBottom: 6 }}>
            Email
          </Text>
          <TextInput
            ref={emailRef}
            value={email} onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.placeholder}
            autoCapitalize="none" keyboardType="email-address"
            textContentType="emailAddress" returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            style={inputStyle(false)}
          />

          {/* Password */}
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.text, marginBottom: 6 }}>
            Password
          </Text>
          <TextInput
            ref={passRef}
            value={password} onChangeText={setPassword}
            placeholder="Min 6 characters"
            placeholderTextColor={c.placeholder}
            secureTextEntry textContentType="newPassword"
            returnKeyType="go" onSubmitEditing={handleSignUp}
            style={inputStyle(false)}
          />

          {/* Submit */}
          <Pressable
            onPress={handleSignUp}
            disabled={disabled}
            style={({ pressed }) => ({
              backgroundColor: c.btnBg, borderRadius: 8, height: 44,
              alignItems: 'center', justifyContent: 'center',
              opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
              marginTop: 8,
            })}
          >
            {loading ? (
              <ActivityIndicator color={c.btnText} size="small" />
            ) : (
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.btnText }}>
                Create Account
              </Text>
            )}
          </Pressable>

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 4 }}>
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.muted }}>
              Already have an account?
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={{
                  fontFamily: 'Geist-Medium', fontSize: 14, color: c.text,
                  textDecorationLine: 'underline',
                }}>
                  Sign in
                </Text>
              </Pressable>
            </Link>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
