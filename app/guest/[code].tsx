import { useEffect, useState, useRef } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@src/services/supabase/client'
import { useGuestProgressStore } from '@src/stores/useGuestProgressStore'
import { processReview, createNewProgress, buildStudyQueue } from '@src/lib/srs'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { isRTL, type Card, type CardProgress, type SessionStats } from '@src/types'
import { X, Check, RotateCcw } from 'lucide-react-native'

const GUEST_USER_ID = 'guest'

export default function GuestStudyScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const router = useRouter()
  const c = useThemeColors()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deckTitle, setDeckTitle] = useState('')
  const [deckId, setDeckId] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('en')
  const [cards, setCards] = useState<Card[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [progressMap, setProgressMap] = useState<Map<string, CardProgress>>(new Map())
  const [stats, setStats] = useState<SessionStats>({
    cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0,
  })

  const getProgress = useGuestProgressStore(s => s.getProgress)
  const setGuestProgress = useGuestProgressStore(s => s.setProgress)
  const loadDeckProgress = useGuestProgressStore(s => s.loadDeckProgress)

  const deckCode = (code ?? '').toUpperCase()

  // Load deck + cards on mount
  useEffect(() => {
    if (!deckCode) {
      setError('No deck code provided')
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const { data: deck, error: deckErr } = await supabase
          .from('decks')
          .select('*')
          .eq('share_code', deckCode)
          .single()

        if (cancelled) return
        if (deckErr || !deck) {
          setError('Deck not found. Check your code and try again.')
          setLoading(false)
          return
        }

        setDeckTitle(deck.title)
        setDeckId(deck.id)
        setSourceLang(deck.source_language)
        setTargetLang(deck.target_language)

        const { data: cardsData } = await supabase
          .from('cards')
          .select('*')
          .eq('deck_id', deck.id)
          .order('sort_order', { ascending: true })

        if (cancelled) return

        const loadedCards = (cardsData ?? []) as Card[]
        setCards(loadedCards)

        // Build progress map from local storage
        const stored = loadDeckProgress(deckCode)
        const pMap = new Map<string, CardProgress>()
        for (const [cardId, progress] of Object.entries(stored)) {
          pMap.set(cardId, progress)
        }
        setProgressMap(pMap)

        // Build study queue
        const q = buildStudyQueue(
          loadedCards.map(card => ({
            card_id: card.id,
            progress: pMap.get(card.id) ?? null,
          })),
          20,
          false,
        )

        setQueue(q)
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

  const currentCardId = queue[currentIndex]
  const currentCard = cards.find(card => card.id === currentCardId)
  const isComplete = currentIndex >= queue.length

  const wordRTL = isRTL(targetLang)
  const translationRTL = isRTL(sourceLang)

  function handleAnswer(correct: boolean) {
    if (!currentCard) return

    const existing = progressMap.get(currentCard.id)
    const progress = existing ?? createNewProgress(GUEST_USER_ID, currentCard.id, deckId)
    const updated = processReview(progress, correct)

    // Update local progress map
    const newMap = new Map(progressMap)
    newMap.set(currentCard.id, updated)
    setProgressMap(newMap)

    // Persist to AsyncStorage via guest store
    setGuestProgress(deckCode, currentCard.id, updated)

    // Update stats
    setStats(prev => ({
      ...prev,
      cardsReviewed: prev.cardsReviewed + 1,
      cardsCorrect: prev.cardsCorrect + (correct ? 1 : 0),
      newCardsSeen: prev.newCardsSeen + (!existing ? 1 : 0),
    }))

    // Re-queue wrong answers
    if (!correct) {
      setQueue(prev => [...prev, currentCard.id])
    }

    // Advance
    setFlipped(false)
    setCurrentIndex(prev => prev + 1)
  }

  function handleRestart() {
    const q = buildStudyQueue(
      cards.map(card => ({
        card_id: card.id,
        progress: progressMap.get(card.id) ?? null,
      })),
      20,
      true,
    )
    setQueue(q)
    setCurrentIndex(0)
    setFlipped(false)
    setStats({ cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0 })
  }

  // --- Loading state ---
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

  // --- Error state ---
  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontFamily: 'Geist-Medium', fontSize: 18, color: c.text, textAlign: 'center', marginBottom: 12 }}>
          {error}
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

  // --- Session complete ---
  if (isComplete) {
    const pct = stats.cardsReviewed > 0 ? Math.round((stats.cardsCorrect / stats.cardsReviewed) * 100) : 0

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 24, color: c.text, marginBottom: 8 }}>
            Session Complete
          </Text>
          <Text style={{ fontFamily: 'Geist-Regular', fontSize: 15, color: c.textSecondary, marginBottom: 32 }}>
            {deckTitle}
          </Text>

          <View style={{ flexDirection: 'row', gap: 32, marginBottom: 40 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Geist-Bold', fontSize: 28, color: c.text }}>{stats.cardsReviewed}</Text>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }}>Reviewed</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Geist-Bold', fontSize: 28, color: c.success }}>{pct}%</Text>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }}>Correct</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Geist-Bold', fontSize: 28, color: c.text }}>{stats.newCardsSeen}</Text>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }}>New</Text>
            </View>
          </View>

          <Pressable
            onPress={handleRestart}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 24, paddingVertical: 12,
              borderRadius: 8, backgroundColor: c.accent,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <RotateCcw size={18} color={c.accentText} />
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>
              Study Again
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            style={{ marginTop: 16 }}
          >
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary, textDecorationLine: 'underline' }}>
              Sign in for full experience
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // --- Active study ---
  const progressNum = queue.length > 0 ? currentIndex / queue.length : 0

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <X size={22} color={c.textSecondary} />
        </Pressable>
        <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.textSecondary }}>
          {currentIndex + 1} / {queue.length}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress bar */}
      <View style={{ height: 3, backgroundColor: c.progressBg, marginHorizontal: 16, borderRadius: 2 }}>
        <View style={{ height: 3, backgroundColor: c.progressFill, borderRadius: 2, width: `${progressNum * 100}%` }} />
      </View>

      {/* Card area */}
      <Pressable
        onPress={() => !flipped && setFlipped(true)}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
      >
        <Text style={{
          fontFamily: 'Geist-SemiBold',
          fontSize: 28,
          color: c.text,
          textAlign: 'center',
          writingDirection: wordRTL ? 'rtl' : 'ltr',
        }}>
          {currentCard?.word}
        </Text>

        {flipped && (
          <Text style={{
            fontFamily: 'Geist-Regular',
            fontSize: 20,
            color: c.textSecondary,
            textAlign: 'center',
            marginTop: 20,
            writingDirection: translationRTL ? 'rtl' : 'ltr',
          }}>
            {currentCard?.translation}
          </Text>
        )}

        {!flipped && (
          <Text style={{
            fontFamily: 'Geist-Regular',
            fontSize: 14,
            color: c.textMuted,
            marginTop: 24,
          }}>
            Tap to reveal
          </Text>
        )}
      </Pressable>

      {/* Answer buttons */}
      {flipped && (
        <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 24, paddingBottom: 24 }}>
          <Pressable
            onPress={() => handleAnswer(false)}
            style={({ pressed }) => ({
              flex: 1, height: 52, borderRadius: 12,
              backgroundColor: c.surface,
              borderWidth: 1, borderColor: c.border,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.error }}>
              Again
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleAnswer(true)}
            style={({ pressed }) => ({
              flex: 1, height: 52, borderRadius: 12,
              backgroundColor: c.accent,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>
              Got it
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  )
}
