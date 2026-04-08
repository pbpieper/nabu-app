import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '@src/stores/useAuthStore'

export default function AuthLayout() {
  const session = useAuthStore(s => s.session)
  if (session) return <Redirect href="/(app)/(home)" />
  return <Stack screenOptions={{ headerShown: false }} />
}
