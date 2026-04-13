import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, Pressable, ActivityIndicator, Animated, Platform, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useNavigation, useFocusEffect } from 'expo-router'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useStudyStore } from '@src/stores/useStudyStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useStudyPreferencesStore } from '@src/stores/useStudyPreferencesStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { useThemeStore } from '@src/stores/useThemeStore'
import { useAudio } from '@src/hooks/useAudio'
import { BoldText } from '@src/lib/renderBoldText'
import { processReview, createNewProgress, buildStudyQueue } from '@src/lib/srs'
import { isRTL, type Card, type CardProgress, type SessionStats } from '@src/types'
import {
  X, CheckCircle, RotateCcw, Check, Clock, RefreshCw, Volume2, LogIn,
} from 'lucide-react-native'

// ---------------------------------------------------------------------------
// Types for progressive reveal
// ---------------------------------------------------------------------------

type LayerType = 'example_sentence' | 'explanation' | 'image' | 'translation'

interface RevealLayerEntry {
  type: LayerType
  /** Fade-in animation value */
  opacity: Animated.Value
}

// ---------------------------------------------------------------------------
// Guest mode props — when provided, component runs in guest mode
// ---------------------------------------------------------------------------

export interface GuestStudyProps {
  mode: 'guest'
  deckCode: string
  deck: { id: string; title: string; source_language: string; target_language: string }
  cards: Card[]
  initialProgress: Map<string, CardProgress>
  onSaveProgress: (cardId: string, progress: CardProgress) => void
}

export interface AuthedStudyProps {
  mode?: 'authed' | undefined
}

export type StudySessionProps = GuestStudyProps | AuthedStudyProps

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GUEST_USER_ID = 'guest'

/** Build the ordered list of layers that have content for a given card. */
function buildLayers(card: Card): RevealLayerEntry[] {
  const layers: RevealLayerEntry[] = []
  // Order: example_sentence -> explanation -> image -> translation (always last)
  if (card.example_sentence) layers.push({ type: 'example_sentence', opacity: new Animated.Value(0) })
  if (card.explanation) layers.push({ type: 'explanation', opacity: new Animated.Value(0) })
  if (card.image_url) layers.push({ type: 'image', opacity: new Animated.Value(0) })
  // Translation is always last and always present
  layers.push({ type: 'translation', opacity: new Animated.Value(0) })
  return layers
}

// ---------------------------------------------------------------------------
// Undo history entry (used by both guest and authed modes internally)
// ---------------------------------------------------------------------------

interface UndoEntry {
  cardId: string
  correct: boolean
  prevProgress: CardProgress | null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StudySession(props: StudySessionProps = { mode: 'authed' }) {
  const isGuest = props.mode === 'guest'

  const router = useRouter()
  const navigation = useNavigation()
  const c = useThemeColors()
  const resolvedTheme = useThemeStore(s => s.resolvedTheme)
  const dark = resolvedTheme === 'dark'
  const { play: playAudio, stop: stopAudio } = useAudio()

  // ── Auth-mode stores (only used when not guest) ──
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const currentDeck = useDecksStore(s => s.currentDeck)
  const currentCards = useDecksStore(s => s.currentCards)
  const newCardsPerSession = useStudyPreferencesStore(s => s.newCardsPerSession)
  const {
    queue: authedQueue, currentIndex: authedCurrentIndex, sessionActive,
    loadAndStart, startSession, answerCard: authedAnswerCard,
    undoLastAnswer: authedUndoLastAnswer, nextCard: authedNextCard, endSession,
    sessionStats: authedSessionStats, answerHistory: authedAnswerHistory,
    wrongCount: authedWrongCount, newRemaining,
  } = useStudyStore()

  // ── Guest-mode local state ──
  const [guestQueue, setGuestQueue] = useState<string[]>([])
  const [guestIndex, setGuestIndex] = useState(0)
  const [guestProgressMap, setGuestProgressMap] = useState<Map<string, CardProgress>>(new Map())
  const [guestStats, setGuestStats] = useState<SessionStats>({
    cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0,
  })
  const [guestUndoHistory, setGuestUndoHistory] = useState<UndoEntry[]>([])
  const [guestLoaded, setGuestLoaded] = useState(false)

  // Progressive reveal state (shared by both modes)
  const [revealedCount, setRevealedCount] = useState(0)
  const [layers, setLayers] = useState<RevealLayerEntry[]>([])
  const [keyHintDismissed, setKeyHintDismissed] = useState(false)
  const cardStartTimeRef = useRef<number>(Date.now())
  const completedStatsRef = useRef<SessionStats | null>(null)

  // ── Unified derived state ──
  const userId = isGuest ? GUEST_USER_ID : (profile?.id ?? session?.user?.id)

  const queue = isGuest ? guestQueue : authedQueue
  const currentIndex = isGuest ? guestIndex : authedCurrentIndex
  const cards = isGuest ? (props as GuestStudyProps).cards : currentCards
  const deckTitle = isGuest ? (props as GuestStudyProps).deck.title : (currentDeck?.title ?? '')
  const deckId = isGuest ? (props as GuestStudyProps).deck.id : (currentDeck?.id ?? '')
  const targetLang = isGuest ? (props as GuestStudyProps).deck.target_language : (currentDeck?.target_language ?? 'en')

  const stats = isGuest ? guestStats : authedSessionStats
  const undoHistory = isGuest ? guestUndoHistory : authedAnswerHistory
  const wrongCount = isGuest
    ? guestStats.cardsReviewed - guestStats.cardsCorrect
    : authedWrongCount

  const currentCardId = queue[currentIndex]
  const card = cards.find(ci => ci.id === currentCardId)
  const translationRevealed = revealedCount >= layers.length && layers.length > 0
  const rtl = isRTL(targetLang)
  const isComplete = currentIndex >= queue.length && queue.length > 0

  // ── Guest session bootstrap ──
  useEffect(() => {
    if (!isGuest) return
    const gProps = props as GuestStudyProps
    setGuestProgressMap(new Map(gProps.initialProgress))

    const q = buildStudyQueue(
      gProps.cards.map(card => ({
        card_id: card.id,
        progress: gProps.initialProgress.get(card.id) ?? null,
      })),
      20,
      false,
    )
    setGuestQueue(q)
    setGuestLoaded(true)
  }, [isGuest && (props as GuestStudyProps).deckCode])

  // ── Authed session bootstrap ──
  useEffect(() => {
    if (isGuest) return
    if (currentDeck && userId && !sessionActive) {
      loadAndStart(currentDeck.id, userId, { newLimit: newCardsPerSession })
    }
  }, [isGuest, currentDeck?.id, userId])

  // ── Capture stats on completion ──
  useEffect(() => {
    if (isComplete && stats.cardsReviewed > 0) {
      completedStatsRef.current = { ...stats }
    }
  }, [isComplete])

  // Rebuild layers whenever card changes
  useEffect(() => {
    if (card) {
      const newLayers = buildLayers(card)
      setLayers(newLayers)
      setRevealedCount(0)
      cardStartTimeRef.current = Date.now()
    }
  }, [card?.id])

  // ---------------------------------------------------------------------------
  // Reveal logic
  // ---------------------------------------------------------------------------

  const revealNext = useCallback(() => {
    if (revealedCount >= layers.length) return
    const layer = layers[revealedCount]
    Animated.timing(layer.opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start()

    const newCount = revealedCount + 1
    setRevealedCount(newCount)

    // Auto-play audio when card has audio and this is the first reveal
    if (newCount === 1 && card?.audio_url) {
      playAudio(card.audio_url).catch(() => {})
    }
  }, [revealedCount, layers, card, playAudio])

  const revealAll = useCallback(() => {
    layers.forEach((layer, idx) => {
      if (idx >= revealedCount) {
        Animated.timing(layer.opacity, {
          toValue: 1, duration: 200, useNativeDriver: true,
        }).start()
      }
    })
    setRevealedCount(layers.length)
    if (card?.audio_url && revealedCount === 0) {
      playAudio(card.audio_url).catch(() => {})
    }
  }, [layers, revealedCount, card, playAudio])

  // ---------------------------------------------------------------------------
  // Answer handlers
  // ---------------------------------------------------------------------------

  const handleAnswer = useCallback((correct: boolean) => {
    const timeMs = Date.now() - cardStartTimeRef.current
    stopAudio().catch(() => {})

    if (isGuest) {
      if (!card) return
      const gProps = props as GuestStudyProps
      const existing = guestProgressMap.get(card.id) ?? null
      const progress = existing ?? createNewProgress(GUEST_USER_ID, card.id, deckId)
      const updated = processReview(progress, correct)

      const newMap = new Map(guestProgressMap)
      newMap.set(card.id, updated)
      setGuestProgressMap(newMap)

      // Persist to AsyncStorage via store
      gProps.onSaveProgress(card.id, updated)

      // Push undo entry
      setGuestUndoHistory(prev => [...prev, { cardId: card.id, correct, prevProgress: existing }])

      setGuestStats(prev => ({
        ...prev,
        cardsReviewed: prev.cardsReviewed + 1,
        cardsCorrect: prev.cardsCorrect + (correct ? 1 : 0),
        newCardsSeen: prev.newCardsSeen + (!existing ? 1 : 0),
      }))

      if (!correct) {
        setGuestQueue(prev => [...prev, card.id])
      }
      setGuestIndex(prev => prev + 1)
    } else {
      if (userId && card) authedAnswerCard(card.id, correct, userId, revealedCount, timeMs)
      authedNextCard()
    }
  }, [isGuest, userId, card, guestProgressMap, deckId, revealedCount, stopAudio,
    authedAnswerCard, authedNextCard, props])

  // ---------------------------------------------------------------------------
  // Undo handler
  // ---------------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    if (isGuest) {
      if (guestUndoHistory.length === 0 || guestIndex === 0) return
      const last = guestUndoHistory[guestUndoHistory.length - 1]

      const newMap = new Map(guestProgressMap)
      if (last.prevProgress) {
        newMap.set(last.cardId, last.prevProgress)
        // Also persist the restored state
        ;(props as GuestStudyProps).onSaveProgress(last.cardId, last.prevProgress)
      } else {
        newMap.delete(last.cardId)
      }

      let newQueue = [...guestQueue]
      if (!last.correct) {
        const lastIdx = newQueue.lastIndexOf(last.cardId)
        if (lastIdx > guestIndex - 1) {
          newQueue.splice(lastIdx, 1)
        }
      }

      setGuestProgressMap(newMap)
      setGuestQueue(newQueue)
      setGuestIndex(prev => prev - 1)
      setGuestUndoHistory(prev => prev.slice(0, -1))
      setGuestStats(prev => ({
        ...prev,
        cardsReviewed: Math.max(0, prev.cardsReviewed - 1),
        cardsCorrect: prev.cardsCorrect - (last.correct ? 1 : 0),
        newCardsSeen: prev.newCardsSeen - (!last.prevProgress ? 1 : 0),
      }))
    } else {
      if (userId && undoHistory.length > 0) {
        authedUndoLastAnswer(userId)
      }
    }
  }, [isGuest, userId, guestUndoHistory, guestProgressMap, guestQueue, guestIndex,
    undoHistory, authedUndoLastAnswer, props])

  // ---------------------------------------------------------------------------
  // Restart handler
  // ---------------------------------------------------------------------------

  const handleRestart = useCallback(() => {
    completedStatsRef.current = null

    if (isGuest) {
      const gProps = props as GuestStudyProps
      const q = buildStudyQueue(
        gProps.cards.map(c => ({
          card_id: c.id,
          progress: guestProgressMap.get(c.id) ?? null,
        })),
        20,
        true,
      )
      setGuestQueue(q)
      setGuestIndex(0)
      setGuestStats({ cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0 })
      setGuestUndoHistory([])
    } else {
      if (userId && currentDeck) {
        startSession(currentCards, userId, currentDeck.id, {
          includeAll: true, newLimit: currentCards.length,
        })
      }
    }
  }, [isGuest, userId, currentDeck, currentCards, guestProgressMap, startSession, props])

  // ---------------------------------------------------------------------------
  // Close handler
  // ---------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    stopAudio().catch(() => {})
    if (!isGuest) endSession()
    router.back()
  }, [isGuest, stopAudio, endSession, router])

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (web only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (translationRevealed) {
          handleAnswer(true)
        } else {
          revealNext()
        }
      }
      if (translationRevealed) {
        if (e.key === 'ArrowLeft' || e.key === '1') {
          e.preventDefault()
          handleAnswer(false)
        }
        if (e.key === 'ArrowRight' || e.key === '2') {
          e.preventDefault()
          handleAnswer(true)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [translationRevealed, revealNext, handleAnswer])

  // ---------------------------------------------------------------------------
  // Tab bar hiding (authed only — guest has no tab bar)
  // ---------------------------------------------------------------------------

  useFocusEffect(useCallback(() => {
    if (isGuest) return
    const parent = navigation.getParent()
    parent?.setOptions({
      tabBarStyle: {
        display: 'none' as const,
        backgroundColor: dark ? '#09090B' : '#FFFFFF',
        borderTopColor: dark ? '#27272A' : '#E4E4E7',
        borderTopWidth: 1,
        paddingTop: 4,
        height: 84,
      },
    })
    return () => {
      parent?.setOptions({
        tabBarStyle: {
          backgroundColor: dark ? '#09090B' : '#FFFFFF',
          borderTopColor: dark ? '#27272A' : '#E4E4E7',
          borderTopWidth: 1,
          paddingTop: 4,
          height: 84,
        },
      })
    }
  }, [isGuest, navigation, dark]))

  // =========================================================================
  // EARLY RETURN SCREENS
  // =========================================================================

  // Authed: No deck selected
  if (!isGuest && !currentDeck) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{
            fontFamily: 'Geist-SemiBold', fontSize: 20, color: c.text,
            letterSpacing: -0.2, marginBottom: 8,
          }}>
            No deck selected
          </Text>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
            textAlign: 'center', lineHeight: 20, maxWidth: 280, marginBottom: 28,
          }}>
            Pick a deck from Home or your Library to start studying
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              borderWidth: 1, borderColor: c.border, borderRadius: 10,
              paddingHorizontal: 20, paddingVertical: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.textSecondary }}>
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // Authed: Loading cards
  if (!isGuest && !sessionActive && (currentCards.length === 0 || authedQueue.length === 0)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.textMuted} />
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted, marginTop: 16,
          }}>
            Loading cards...
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // Guest: Still loading
  if (isGuest && !guestLoaded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.textMuted} />
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted, marginTop: 16,
        }}>
          Preparing session...
        </Text>
      </SafeAreaView>
    )
  }

  // Authed: All caught up (no cards due)
  if (!isGuest && sessionActive && authedQueue.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: c.surface,
            alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Clock size={32} color={c.textMuted} />
          </View>
          <Text style={{
            fontFamily: 'Geist-SemiBold', fontSize: 22, color: c.text,
            letterSpacing: -0.3, marginBottom: 8,
          }}>
            All caught up
          </Text>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
            textAlign: 'center', lineHeight: 20, maxWidth: 280, marginBottom: 8,
          }}>
            No cards are due for review right now. Check back later or practice all cards.
          </Text>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginBottom: 28,
          }}>
            {deckTitle}
          </Text>
          <View style={{ gap: 10, width: '100%', maxWidth: 300 }}>
            <Pressable
              onPress={() => {
                if (userId && currentDeck) {
                  startSession(currentCards, userId, currentDeck.id, {
                    includeAll: true, newLimit: currentCards.length,
                  })
                }
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <RefreshCw size={16} color={c.accentText} />
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>
                Practice All Cards
              </Text>
            </Pressable>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 14,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 15, color: c.textSecondary }}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── Session complete ──
  const displayStats = completedStatsRef.current ?? stats
  if (isComplete) {
    const pct = displayStats.cardsReviewed > 0
      ? Math.round((displayStats.cardsCorrect / displayStats.cardsReviewed) * 100)
      : 0

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: c.surface,
            alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <CheckCircle size={36} color={c.success} />
          </View>
          <Text style={{
            fontFamily: 'Geist-SemiBold', fontSize: 22, color: c.text,
            letterSpacing: -0.3, marginBottom: 4,
          }}>
            Session Complete
          </Text>
          <Text style={{
            fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted, marginBottom: 24,
          }}>
            {deckTitle}
          </Text>

          <View style={{
            flexDirection: 'row', gap: 1, marginBottom: 32,
            backgroundColor: c.border, borderRadius: 14, overflow: 'hidden',
          }}>
            {[
              { label: 'Reviewed', value: displayStats.cardsReviewed },
              { label: 'Correct', value: `${pct}%` },
              { label: 'New', value: displayStats.newCardsSeen },
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

          {/* Action buttons */}
          <View style={{ gap: 10, width: '100%', maxWidth: 300 }}>
            {/* Keep studying / Study Again */}
            <Pressable
              onPress={handleRestart}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: c.accent, borderRadius: 10, paddingVertical: 14,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <RefreshCw size={16} color={c.accentText} />
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.accentText }}>
                {isGuest ? 'Keep Studying' : 'Study Again'}
              </Text>
            </Pressable>

            {/* Guest: Sign in prompt */}
            {isGuest && (
              <Pressable
                onPress={() => router.push('/(auth)/sign-in')}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 14,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <LogIn size={16} color={c.textSecondary} />
                <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.textSecondary }}>
                  Sign in to save your progress
                </Text>
              </Pressable>
            )}

            {/* Dismiss / Done */}
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderWidth: isGuest ? 0 : 1, borderColor: c.border, borderRadius: 10,
                paddingVertical: isGuest ? 10 : 14,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 15,
                color: isGuest ? c.textMuted : c.textSecondary,
              }}>
                {isGuest ? 'Dismiss' : 'Done'}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // No current card (loading interstitial)
  if (!card) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.textMuted} />
        </View>
      </SafeAreaView>
    )
  }

  // =========================================================================
  // ACTIVE CARD RENDER
  // =========================================================================

  const progress = ((currentIndex + 1) / queue.length) * 100

  /** Check whether a specific layer type has been revealed. */
  const isLayerRevealed = (type: LayerType): boolean => {
    const idx = layers.findIndex(l => l.type === type)
    return idx !== -1 && idx < revealedCount
  }

  /** Get the Animated.Value for a layer, if it exists. */
  const getLayerOpacity = (type: LayerType): Animated.Value | null => {
    const layer = layers.find(l => l.type === type)
    return layer?.opacity ?? null
  }

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
        <Pressable onPress={handleClose} style={{ padding: 8 }}>
          <X size={20} color={c.textSecondary} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.success }}>
            ✓ {stats.cardsCorrect}
          </Text>
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.error }}>
            ✗ {wrongCount}
          </Text>
          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 13, color: c.textMuted }}>
            {currentIndex + 1}/{queue.length}
          </Text>
          {!isGuest && newRemaining > 0 && (
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.accent }}>
              {newRemaining} new
            </Text>
          )}
        </View>
        {undoHistory.length > 0 ? (
          <Pressable onPress={handleUndo} style={{ padding: 8 }}>
            <RotateCcw size={16} color={c.textSecondary} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Progress bar */}
      <View style={{ height: 3, backgroundColor: c.progressBg, marginHorizontal: 20, borderRadius: 2 }}>
        <View style={{ height: 3, backgroundColor: c.progressFill, borderRadius: 2, width: `${progress}%` }} />
      </View>

      {/* Card area */}
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
            {card.word}
          </Text>
          {card.part_of_speech && (
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 8,
            }}>
              {card.part_of_speech}
            </Text>
          )}

          {/* Audio replay button — appears after first reveal if card has audio */}
          {card.audio_url && revealedCount > 0 && (
            <Pressable
              onPress={() => card.audio_url && playAudio(card.audio_url).catch(() => {})}
              style={({ pressed }) => ({
                marginTop: 12, padding: 8, borderRadius: 20,
                backgroundColor: c.surface,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Volume2 size={18} color={c.textSecondary} />
            </Pressable>
          )}

          {/* Example sentence layer */}
          {isLayerRevealed('example_sentence') && getLayerOpacity('example_sentence') && (
            <Animated.View style={{
              opacity: getLayerOpacity('example_sentence')!,
              backgroundColor: c.surface, borderRadius: 8, padding: 12, marginTop: 16, width: '100%',
            }}>
              <BoldText
                text={card.example_sentence ?? ''}
                style={{
                  fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary,
                  textAlign: 'center', lineHeight: 20, writingDirection: rtl ? 'rtl' : 'ltr',
                }}
                boldStyle={{ color: c.text }}
              />
            </Animated.View>
          )}

          {/* Explanation layer */}
          {isLayerRevealed('explanation') && getLayerOpacity('explanation') && (
            <Animated.View style={{ opacity: getLayerOpacity('explanation')!, marginTop: 10 }}>
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, textAlign: 'center',
              }}>
                {card.explanation}
              </Text>
            </Animated.View>
          )}

          {/* Image layer */}
          {isLayerRevealed('image') && getLayerOpacity('image') && card.image_url && (
            <Animated.View style={{
              opacity: getLayerOpacity('image')!, marginTop: 16, width: '100%',
              alignItems: 'center',
            }}>
              <Image
                source={{ uri: card.image_url }}
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
                  {card.translation}
                </Text>
                {card.grammar_tag && (
                  <Text style={{
                    fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted,
                    fontStyle: 'italic', marginTop: 4,
                  }}>
                    {card.grammar_tag}
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

      {/* Bottom buttons — always visible during active card */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 10 }}>
        {translationRevealed ? (
          /* Grading row: Again — Got it */
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
          /* Pre-reveal row: Again — Reveal All — Got it */
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
          <Pressable
            onPress={() => setKeyHintDismissed(true)}
            style={{ padding: 4 }}
          >
            <X size={14} color={c.textMuted} />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  )
}
