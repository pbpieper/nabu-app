import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useStudyPreferencesStore } from '@src/stores/useStudyPreferencesStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { ArrowLeft, Minus, Plus } from 'lucide-react-native'

const MIN = 5
const MAX = 50
const STEP = 5

export default function StudyPreferencesScreen() {
  const router = useRouter()
  const c = useThemeColors()
  const newCardsPerSession = useStudyPreferencesStore(s => s.newCardsPerSession)
  const setNewCardsPerSession = useStudyPreferencesStore(s => s.setNewCardsPerSession)

  const decrement = () => setNewCardsPerSession(Math.max(MIN, newCardsPerSession - STEP))
  const increment = () => setNewCardsPerSession(Math.min(MAX, newCardsPerSession + STEP))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
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
          Study Preferences
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
        {/* New cards per session */}
        <Text style={{
          fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
          letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 16,
        }}>
          New cards per session
        </Text>

        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: c.surface, borderRadius: 14, padding: 16,
        }}>
          <Pressable
            onPress={decrement}
            disabled={newCardsPerSession <= MIN}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 22,
              borderWidth: 1, borderColor: c.border,
              alignItems: 'center', justifyContent: 'center',
              opacity: newCardsPerSession <= MIN ? 0.3 : pressed ? 0.6 : 1,
            })}
          >
            <Minus size={18} color={c.text} />
          </Pressable>

          <View style={{ alignItems: 'center' }}>
            <Text style={{
              fontFamily: 'Geist-SemiBold', fontSize: 32, color: c.text,
              letterSpacing: -0.5,
            }}>
              {newCardsPerSession}
            </Text>
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }}>
              cards
            </Text>
          </View>

          <Pressable
            onPress={increment}
            disabled={newCardsPerSession >= MAX}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 22,
              borderWidth: 1, borderColor: c.border,
              alignItems: 'center', justifyContent: 'center',
              opacity: newCardsPerSession >= MAX ? 0.3 : pressed ? 0.6 : 1,
            })}
          >
            <Plus size={18} color={c.text} />
          </Pressable>
        </View>

        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted,
          lineHeight: 18, marginTop: 12,
        }}>
          Controls how many unseen cards are introduced each study session. A lower number helps with retention; a higher number speeds through the deck faster.
        </Text>

        {/* Presets */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          {[10, 15, 20, 30].map(n => {
            const active = newCardsPerSession === n
            return (
              <Pressable
                key={n}
                onPress={() => setNewCardsPerSession(n)}
                style={({ pressed }) => ({
                  flex: 1, alignItems: 'center',
                  paddingVertical: 10, borderRadius: 8,
                  backgroundColor: active ? c.accent : 'transparent',
                  borderWidth: active ? 0 : 1,
                  borderColor: c.border,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{
                  fontFamily: 'Geist-Medium', fontSize: 14,
                  color: active ? c.accentText : c.textSecondary,
                }}>
                  {n}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </SafeAreaView>
  )
}
