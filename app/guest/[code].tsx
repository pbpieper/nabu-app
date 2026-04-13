import { useEffect, useState, useCallback } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useGuestProgressStore } from '@src/stores/useGuestProgressStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { loadDeckByShareCode } from '@src/lib/deckLoader'
import StudySession from '@src/components/StudySession'
import type { Card, CardProgress } from '@src/types'

// ---------------------------------------------------------------------------
// Guest study screen — thin wrapper around the shared StudySession component.
//
// Responsibilities:
//   1. Fetch deck + cards via shared deckLoader
//   2. Load guest progress from AsyncStorage (useGuestProgressStore)
//   3. Pass everything to <StudySession mode="guest" ... />
// ---------------------------------------------------------------------------

export default function GuestStudyScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const router = useRouter()
  const c = useThemeColors()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Loaded data
  const [deck, setDeck] = useState<{
    id: string; title: string; source_language: string; target_language: string
  } | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [initialProgress, setInitialProgress] = useState<Map<string, CardProgress>>(new Map())

  const setGuestProgress = useGuestProgressStore(s => s.setProgress)
  const loadDeckProgress = useGuestProgressStore(s => s.loadDeckProgress)

  const deckCode = (code ?? '').toUpperCase()

  // ── Load deck + cards on mount ──
  useEffect(() => {
    if (!deckCode) {
      setError('No deck code provided')
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const { data, error: loadError } = await loadDeckByShareCode(deckCode)

        if (cancelled) return

        if (loadError || !data) {
          setError(loadError ?? 'Failed to load deck.')
          setLoading(false)
          return
        }

        setDeck({
          id: data.deck.id,
          title: data.deck.title,
          source_language: data.deck.source_language,
          target_language: data.deck.target_language,
        })
        setCards(data.cards)

        // Build progress map from local AsyncStorage
        const stored = loadDeckProgress(deckCode)
        const pMap = new Map<string, CardProgress>()
        for (const [cardId, progress] of Object.entries(stored)) {
          pMap.set(cardId, progress)
        }
        setInitialProgress(pMap)

        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Failed to load deck. Please try again.')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [deckCode])

  // ── Progress save callback (piped to StudySession) ──
  // TODO: merge guest progress into authed account on sign-in
  const handleSaveProgress = useCallback((cardId: string, progress: CardProgress) => {
    setGuestProgress(deckCode, cardId, progress)
  }, [deckCode, setGuestProgress])

  // ── Loading state ──
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.text} />
        <Text style={{ fontFamily: 'Geist-Regular', fontSize: 15, color: c.textSecondary, marginTop: 16 }}>
          Loading deck...
        </Text>
      </SafeAreaView>
    )
  }

  // ── Error state ──
  if (error || !deck) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontFamily: 'Geist-Medium', fontSize: 18, color: c.text, textAlign: 'center', marginBottom: 12 }}>
          {error ?? 'Something went wrong'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: c.accent }}
        >
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  // ── Render shared StudySession in guest mode ──
  return (
    <StudySession
      mode="guest"
      deckCode={deckCode}
      deck={deck}
      cards={cards}
      initialProgress={initialProgress}
      onSaveProgress={handleSaveProgress}
    />
  )
}
