import { Redirect } from 'expo-router'
import { useAuthStore } from '@src/stores/useAuthStore'

export default function Index() {
  const session = useAuthStore(s => s.session)
  return <Redirect href={session ? '/(app)/(home)' : '/(auth)/sign-in'} />
}
