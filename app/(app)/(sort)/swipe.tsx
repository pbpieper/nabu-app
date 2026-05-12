import { useEffect } from 'react'
import { View, Text, Pressable, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useSortStore } from '@src/stores/useSortStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { isRTL } from '@src/types'
import { RotateCcw } from 'lucide-react-native'
import { BoldText } from '@src/lib/renderBoldText'

// NOTE: Swipe gestures (Pan + Reanimated) deferred per Phase 4 spec.
// Two big buttons + web keyboard shortcuts (Arrow keys, U) cover the
// acceptance test. Can be layered on later without changing the store API.

function highlightTerm(sentence: string, term: string): string {
  if (!sentence || !term) return sentence
  // Replace first case-insensitive occurrence of the term with **term** markers.
  const idx = sentence.toLowerCase().indexOf(term.toLowerCase())
  if (idx < 0) return sentence
  return (
    sentence.slice(0, idx) +
    '**' + sentence.slice(idx, idx + term.length) + '**' +
    sentence.slice(idx + term.length)
  )
}

export default function SwipeScreen() {
  const router = useRouter()
  const draft = useSortStore(s => s.draft)
  const c = useThemeColors()

  // Auto-navigate based on draft state.
  useEffect(() => {
    if (!draft) {
      router.replace('/(app)/(sort)')
      return
    }
    if (
      draft.unsortedQueue.length === 0 &&
      (draft.knownTerms.length > 0 || draft.unknownTerms.length > 0)
    ) {
      router.replace('/(app)/(sort)/summary')
    }
  }, [draft, router])

  // Web keyboard shortcuts.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        useSortStore.getState().markCurrent('unknown')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        useSortStore.getState().markCurrent('known')
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault()
        useSortStore.getState().undoLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!draft) return null

  const current = draft.unsortedQueue[0]
  const unknownCount = draft.unknownTerms.length
  const sortedCount = draft.knownTerms.length + draft.unknownTerms.length
  const leftCount = draft.unsortedQueue.length
  const canUndo = draft.history.length > 0
  const rtl = isRTL(draft.lang)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header / counter */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <Pressable
          onPress={() => canUndo && useSortStore.getState().undoLast()}
          disabled={!canUndo}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            padding: 8, opacity: !canUndo ? 0.35 : pressed ? 0.6 : 1,
          })}
        >
          <RotateCcw size={16} color={c.textSecondary} />
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.textSecondary }}>
            Undo
          </Text>
        </Pressable>

        <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }}>
          <Text style={{
            fontFamily: 'Geist-SemiBold',
            color: c.error,
          }}>
            {unknownCount} unknown
          </Text>
          <Text> · {sortedCount} sorted · {leftCount} left</Text>
        </Text>

        <View style={{ width: 60 }} />
      </View>

      {/* Card */}
      <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
        {current ? (
          <View>
            <Text
              style={{
                fontFamily: 'Geist-SemiBold',
                fontSize: 40,
                color: c.text,
                textAlign: rtl ? 'right' : 'left',
                writingDirection: rtl ? 'rtl' : 'ltr',
                marginBottom: 20,
                letterSpacing: -0.5,
              }}
            >
              {current.term}
            </Text>
            {current.firstSeenSentence ? (
              <BoldText
                text={highlightTerm(current.firstSeenSentence, current.term)}
                style={{
                  fontFamily: 'Geist-Regular',
                  fontSize: 15,
                  color: c.textMuted,
                  lineHeight: 22,
                  textAlign: rtl ? 'right' : 'left',
                  writingDirection: rtl ? 'rtl' : 'ltr',
                }}
                boldStyle={{ color: c.text, fontFamily: 'Geist-SemiBold' }}
              />
            ) : null}
          </View>
        ) : (
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 15, color: c.textMuted,
            textAlign: 'center',
          }}>
            Wrapping up…
          </Text>
        )}
      </View>

      {/* CTAs */}
      <View style={{
        flexDirection: 'row', gap: 12,
        paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12,
      }}>
        <Pressable
          onPress={() => useSortStore.getState().markCurrent('unknown')}
          disabled={!current}
          style={({ pressed }) => ({
            flex: 1,
            borderWidth: 1, borderColor: c.border,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            backgroundColor: c.surface,
            opacity: !current ? 0.4 : pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 18, color: c.text }}>
            Don't know it
          </Text>
        </Pressable>
        <Pressable
          onPress={() => useSortStore.getState().markCurrent('known')}
          disabled={!current}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: c.accent,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: !current ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 18, color: c.accentText }}>
            Know it
          </Text>
        </Pressable>
      </View>

      {Platform.OS === 'web' ? (
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 11, color: c.textMuted,
          textAlign: 'center', paddingBottom: 12,
        }}>
          ← don't know · → know · U undo
        </Text>
      ) : null}
    </SafeAreaView>
  )
}
