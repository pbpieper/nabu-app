import '../global.css'
import { useEffect } from 'react'
import { Platform, View } from 'react-native'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import Toast from 'react-native-toast-message'
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeStore } from '@src/stores/useThemeStore'

SplashScreen.preventAutoHideAsync()

const WEB_MAX_WIDTH = 480

export default function RootLayout() {
  const initialize = useAuthStore(s => s.initialize)
  const initialized = useAuthStore(s => s.initialized)
  const themeMode = useThemeStore(s => s.mode)
  const resolvedTheme = useThemeStore(s => s.resolvedTheme)
  const dark = resolvedTheme === 'dark'

  const [fontsLoaded] = useFonts({
    'Geist-Regular': require('../assets/fonts/Geist-Regular.ttf'),
    'Geist-Medium': require('../assets/fonts/Geist-Medium.ttf'),
    'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.ttf'),
    'Geist-Bold': require('../assets/fonts/Geist-Bold.ttf'),
  })

  useEffect(() => { initialize() }, [])

  useEffect(() => {
    if (fontsLoaded && initialized) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, initialized])

  if (!fontsLoaded || !initialized) return null

  const content = (
    <GluestackUIProvider mode={themeMode === 'system' ? 'system' : themeMode}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Slot />
      <Toast />
    </GluestackUIProvider>
  )

  if (Platform.OS === 'web') {
    return (
      <View style={{
        flex: 1,
        backgroundColor: dark ? '#09090B' : '#F4F4F5',
        alignItems: 'center',
      }}>
        <View style={{
          flex: 1,
          width: '100%',
          maxWidth: WEB_MAX_WIDTH,
          backgroundColor: dark ? '#09090B' : '#FFFFFF',
          // Subtle side shadow on wide screens
          ...(Platform.OS === 'web' ? {
            boxShadow: '0 0 40px rgba(0,0,0,0.08)',
          } as any : {}),
        }}>
          {content}
        </View>
      </View>
    )
  }

  return content
}
