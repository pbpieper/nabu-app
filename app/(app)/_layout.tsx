import { useEffect } from 'react'
import { Redirect, Tabs, useRouter } from 'expo-router'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useThemeStore } from '@src/stores/useThemeStore'
import { Home, BookOpen, User } from 'lucide-react-native'
import type { EventArg } from '@react-navigation/native'

export default function AppLayout() {
  const router = useRouter()
  const session = useAuthStore(s => s.session)
  const loadDecks = useDecksStore(s => s.loadDecks)
  const resolvedTheme = useThemeStore(s => s.resolvedTheme)
  const dark = resolvedTheme === 'dark'

  useEffect(() => { loadDecks() }, [])

  if (!session) return <Redirect href="/(auth)/sign-in" />

  const resetStack = (tabRoute: string) => ({
    tabPress: (e: EventArg<'tabPress', true>) => {
      e.preventDefault()
      router.navigate(tabRoute as any)
    },
  })

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: dark ? '#FAFAFA' : '#18181B',
      tabBarInactiveTintColor: dark ? '#71717A' : '#A1A1AA',
      tabBarLabelStyle: {
        fontSize: 11,
        fontFamily: 'Geist-Medium',
        letterSpacing: 0.2,
      },
      tabBarStyle: {
        backgroundColor: dark ? '#09090B' : '#FFFFFF',
        borderTopColor: dark ? '#27272A' : '#E4E4E7',
        borderTopWidth: 1,
        paddingTop: 4,
        height: 84,
      },
    }}>
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
        listeners={() => resetStack('/(app)/(home)')}
      />
      <Tabs.Screen
        name="(decks)"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
        }}
        listeners={() => resetStack('/(app)/(decks)')}
      />
      <Tabs.Screen
        name="(settings)"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
        listeners={() => resetStack('/(app)/(settings)')}
      />
    </Tabs>
  )
}
