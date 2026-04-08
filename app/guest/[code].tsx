import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, Pressable, ActivityIndicator, Animated, Platform, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@src/services/supabase/client'
import { useGuestProgressStore } from '@src/stores/useGuestProgressStore'
import { processReview, createNewProgress, buildStudyQueue } from '@src/lib/srs'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { isRTL, type Card, type CardProgress, type SessionStats } from '@src/types'
import { X, Check, RotateCcw, Volume2 } from 'lucide-react-native'

const GUEST_USER_ID = 'guest'

// ---------------------------------------------------------------------------
// Progressive reveal types (same as authenticated StudySession)
// ---------------------------------------------------------------------------

type LayerType = 'example_sentence' | 'explanation' | 'image' | 'translation'

interface RevealLayerEntry {
  type: LayerType
  opacity: Animated.Value
}

function buildLayers(card: Card): RevealLayerEntry[] {
  const layers: RevealLayerEntry[] = []
  if (card.example_sentence) layers.push({ type: 'example_sentence', opacity: new Animated.Value(0) })
  if (card.explanation) layers.push({ type: 'explanation', opacity: new Animated.Value(0) })
  if (card.image_url) layers.push({ type: 'image', opacity: new Animated.Value(0) })
  layers.push({ type: 'translation', opacity: new Animated.Value(0) })
  return layers
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const [progressMap, setProgressMap] = useState<Map<string, CardProgress>>(new Map())
  const [stats, setStats] = useState<SessionStats>({
    cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0,
  })

  // Progressive reveal state
  const [revealedCount, setRevealedCount] = useState(0)
  const [layers, setLayers] = useState<RevealLayerEntry[]>([])
  const [keyHintDismissed, setKeyHintDismissed] = useState(false)

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
  const isComplete = currentIndex >= queue.length && queue.length > 0
  const rtl = isRTL(targetLang)
  const translationRevealed = revealedCount >= layers.length && layers.length > 0

  // Rebuild layers when card changes
  useEffect(() => {
    if (currentCard) {
      setLayers(buildLayers(currentCard))
      setRevealedCount(0)
    }
  }, [currentCard?.id])

  // ---------------------------------------------------------------------------
  // Reveal logic
  // ---------------------------------------------------------------------------

  const revealNext = useCallback(() => {
    if (revealedCount >= layers.length) return
    const layer = layers[revealedCount]
    Animated.timing(layer.opacity, {
      toValue: 1, duration: 250, useNativeDriver: true,
    }).start()
    setRevealedCount(prev => prev + 1)
  }, [revealedCount, layers])

  const revealAll = useCallback(() => {
    layers.forEach((layer, idx) => {
      if (idx >= revealedCount) {
        Animated.timing(layer.opacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }).start()
      }
    })
    setRevealedCount(layers.length)
  }, [layers, revealedCount])

  // ---------------------------------------------------------------------------
  // Answer handler
  // ---------------------------------------------------------------------------

  function handleAnswer(correct: boolean) {
    if (!currentCard) return

    const existing = progressMap.get(currentCard.id)
    const progress = existing ?? createNewProgress(GUEST_USER_ID, currentCard.id, deckId)
    const updated = processReview(progress, correct)

    const newMap = new Map(progressMap)
    newMap.set(currentCard.id, updated)
    setProgressMap(newMap)

    setGuestProgress(deckCode, currentCard.id, updated)

    setStats(prev => ({
      ...prev,
      cardsReviewed: prev.cardsReviewed + 1,
      cardsCorrect: prev.cardsCorrect + (correct ? 1 : 0),
      newCardsSeen: prev.newCardsSeen + (!existing ? 1 : 0),
    }))

    if (!correct) {
      setQueue(prev => [...prev, currentCard.id])
    }

    setCurrentIndex(prev => prev + 1)
    // revealedCount and layers reset via the currentCard?.id effect
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
    setStats({ cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0 })
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (web)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (translationRevealed) handleAnswer(true)
        else revealNext()
      }
      if (translationRevealed) {
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); handleAnswer(false) }
        if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); handleAnswer(true) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [translationRevealed, revealNext])

  // ---------------------------------------------------------------------------
  // Helper functions for layer rendering
  // ---------------------------------------------------------------------------

  const isLayerRevealed = (type: LayerType): boolean => {
    const idx = layers.findIndex(l => l.type === type)
    return idx !== -1 && idx < revealedCount
  }

  const getLayerOpacity = (type: LayerType): Animated.Value | null => {
    const layer = layers.find(l => l.type === type)
    return layer?.opacity ?? null
  }

  // =========================================================================
  // RENDER STATES
  // =========================================================================

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

  // Session complete
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

          <View style={{
            flexDirection: 'row', gap: 1, marginBottom: 32,
            backgroundColor: c.border, borderRadius: 14, overflow: 'hidden',
          }}>
            {[
              { label: 'Reviewed', value: stats.cardsReviewed },
              { label: 'Correct', value: `${pct}%` },
              { label: 'New', value: stats.newCardsSeen },
            ].map(s => (
              <View key={s.label} style={{
                alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20,
                backgroundColor: c.surface, minWidth: 80,
              }}>
                <Text style={{
                  fontFamily: 'Geist-SemiBold', fontSize: 22, color: c.text,
                  letterSpacing: -0.3,
                }}>
                  {s.value}
                </Text>
                <Text style={{
                  fontFamily: 'Geist-Regular', fontSize: 11, color: c.textMuted, marginTop: 2,
                }}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 10, width: '100%', maxWidth: 300 }}>
            <Pressable
              onPress={handleRestart}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <RotateCcw size={16} color={c.accentText} />
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>
                Study Again
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace('/(auth)/sign-in')}
              style={({ pressed }) => ({
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 14,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.textSecondary }}>
                Sign in to save progress
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // No cards in queue
  if (!currentCard) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.textMuted} />
      </SafeAreaView>
    )
  }

  // =========================================================================
  // ACTIVE CARD — PROGRESSIVE REVEAL (same UX as authenticated study)
  // =========================================================================

  const progress = ((currentIndex + 1) / queue.length) * 100

  const tapHintText = translationRevealed
    ? undefined
    : revealedCount === 0
      ? 'Tap to reveal'
      : `Tap for more (${layers.length - revealedCount} left)`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 12,
      }}>
        <Pressable onPress={() => router.back()} style={{ padding: 8 }}>
          <X size={20} color={c.textSecondary} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.success }}>
            ✓ {stats.cardsCorrect}
          </Text>
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.error }}>
            ✗ {stats.cardsReviewed - stats.cardsCorrect}
          </Text>
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.textMuted }}>
            {currentIndex + 1}/{queue.length}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress bar */}
      <View style={{ height: 3, backgroundColor: c.progressBg, marginHorizontal: 20, borderRadius: 2 }}>
        <View style={{ height: 3, backgroundColor: c.progressFill, borderRadius: 2, width: `${progress}%` }} />
      </View>

      {/* Card area — tap to reveal */}
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <Pressable
          onPress={translationRevealed ? undefined : revealNext}
          style={{
            borderWidth: 1, borderColor: c.border,
            borderRadius: 16, padding: 32, minHeight: 260,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Word (always shown) */}
          <Text style={{
            fontFamily: 'Geist-SemiBold', fontSize: 28, color: c.text,
            textAlign: 'center', writingDirection: rtl ? 'rtl' : 'ltr',
          }}>
            {currentCard.word}
          </Text>
          {currentCard.part_of_speech && (
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 8,
            }}>
              {currentCard.part_of_speech}
            </Text>
          )}

          {/* Example sentence layer */}
          {isLayerRevealed('example_sentence') && getLayerOpacity('example_sentence') && (
            <Animated.View style={{
              opacity: getLayerOpacity('example_sentence')!,
              backgroundColor: c.surface, borderRadius: 8, padding: 12, marginTop: 16, width: '100%',
            }}>
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary,
                textAlign: 'center', lineHeight: 20, writingDirection: rtl ? 'rtl' : 'ltr',
              }}>
                {currentCard.example_sentence}
              </Text>
            </Animated.View>
          )}

          {/* Explanation layer */}
          {isLayerRevealed('explanation') && getLayerOpacity('explanation') && (
            <Animated.View style={{ opacity: getLayerOpacity('explanation')!, marginTop: 10 }}>
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, textAlign: 'center',
              }}>
                {currentCard.explanation}
              </Text>
            </Animated.View>
          )}

          {/* Image layer */}
          {isLayerRevealed('image') && getLayerOpacity('image') && currentCard.image_url && (
            <Animated.View style={{
              opacity: getLayerOpacity('image')!, marginTop: 16, width: '100%',
              alignItems: 'center',
            }}>
              <Image
                source={{ uri: currentCard.image_url }}
                style={{ width: '100%', maxWidth: 300, height: 200, borderRadius: 10 }}
                resizeMode="contain"
              />
            </Animated.View>
          )}

          {/* Translation layer (always last) */}
          {isLayerRevealed('translation') && getLayerOpacity('translation') && (
            <Animated.View style={{ opacity: getLayerOpacity('translation')!, marginTop: 20 }}>
              <View style={{
                borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16, alignItems: 'center',
              }}>
                <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted, marginBottom: 4 }}>
                  Translation
                </Text>
                <Text style={{
                  fontFamily: 'Geist-SemiBold', fontSize: 24, color: c.text, textAlign: 'center',
                }}>
                  {currentCard.translation}
                </Text>
                {currentCard.grammar_tag && (
                  <Text style={{
                    fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted,
                    fontStyle: 'italic', marginTop: 4,
                  }}>
                    {currentCard.grammar_tag}
                  </Text>
                )}
              </View>
            </Animated.View>
          )}

          {/* Tap hint */}
          {tapHintText && (
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted,
              marginTop: 20, opacity: 0.6,
            }}>
              {tapHintText}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Bottom buttons */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 10 }}>
        {translationRevealed ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => handleAnswer(false)}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <RotateCcw size={16} color={c.error} />
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.error }}>Again</Text>
            </Pressable>
            <Pressable
              onPress={() => handleAnswer(true)}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 14, borderRadius: 12,
                backgroundColor: c.accent,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Check size={16} color={c.accentText} />
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>Got it</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => { revealAll(); setTimeout(() => handleAnswer(false), 100) }}
              style={({ pressed }) => ({
                flex: 1, alignItems: 'center', justifyContent: 'center',
                paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.error }}>✗</Text>
            </Pressable>
            <Pressable
              onPress={revealAll}
              style={({ pressed }) => ({
                flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 6, paddingVertical: 14, borderRadius: 12,
                backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>Reveal All</Text>
            </Pressable>
            <Pressable
              onPress={() => { revealAll(); setTimeout(() => handleAnswer(true), 100) }}
              style={({ pressed }) => ({
                flex: 1, alignItems: 'center', justifyContent: 'center',
                paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.success }}>✓</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Keyboard hint bar (web only) */}
      {Platform.OS === 'web' && !keyHintDismissed && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingVertical: 8, paddingHorizontal: 16,
          backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
        }}>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted, flex: 1, textAlign: 'center',
          }}>
            Space reveal{' \u00B7 '}{'\u2190'} again{' \u00B7 '}{'\u2192'} got it
          </Text>
          <Pressable onPress={() => setKeyHintDismissed(true)} style={{ padding: 4 }}>
            <X size={14} color={c.textMuted} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  )
}
