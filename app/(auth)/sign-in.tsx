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

export default function SignInScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [passFocused, setPassFocused] = useState(false)
  const passRef = useRef<TI>(null)
  const signIn = useAuthStore(s => s.signIn)
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
    link: dark ? '#A1A1AA' : '#52525B',
  }

  const handleSignIn = async () => {
    if (!email || !password) return
    try { await signIn(email, password) }
    catch (err: any) {
      Toast.show({ type: 'error', text1: 'Sign in failed', text2: err.message })
    }
  }

  const disabled = loading || !email || !password

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
            Welcome back
          </Text>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 15, color: c.muted,
            marginBottom: 36,
          }}>
            Sign in to your account to continue
          </Text>

          {/* Email */}
          <Text style={{
            fontFamily: 'Geist-Medium', fontSize: 13, color: c.text,
            marginBottom: 6,
          }}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            onSubmitEditing={() => passRef.current?.focus()}
            style={{
              fontFamily: 'Geist-Regular', fontSize: 15, color: c.text,
              borderWidth: 1, borderColor: emailFocused ? c.borderFocus : c.border,
              borderRadius: 8, paddingHorizontal: 14, height: 44, marginBottom: 20,
              backgroundColor: 'transparent',
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
          />

          {/* Password */}
          <Text style={{
            fontFamily: 'Geist-Medium', fontSize: 13, color: c.text,
            marginBottom: 6,
          }}>
            Password
          </Text>
          <TextInput
            ref={passRef}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={c.placeholder}
            secureTextEntry
            textContentType="password"
            returnKeyType="go"
            onFocus={() => setPassFocused(true)}
            onBlur={() => setPassFocused(false)}
            onSubmitEditing={handleSignIn}
            style={{
              fontFamily: 'Geist-Regular', fontSize: 15, color: c.text,
              borderWidth: 1, borderColor: passFocused ? c.borderFocus : c.border,
              borderRadius: 8, paddingHorizontal: 14, height: 44, marginBottom: 28,
              backgroundColor: 'transparent',
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
          />

          {/* Sign In Button */}
          <Pressable
            onPress={handleSignIn}
            disabled={disabled}
            style={({ pressed }) => ({
              backgroundColor: c.btnBg,
              borderRadius: 8, height: 44,
              alignItems: 'center', justifyContent: 'center',
              opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={c.btnText} size="small" />
            ) : (
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 15, color: c.btnText,
              }}>
                Sign In
              </Text>
            )}
          </Pressable>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', justifyContent: 'center',
            marginTop: 24, gap: 4,
          }}>
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.muted }}>
              Don't have an account?
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                <Text style={{
                  fontFamily: 'Geist-Medium', fontSize: 14, color: c.text,
                  textDecorationLine: 'underline',
                }}>
                  Sign up
                </Text>
              </Pressable>
            </Link>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
