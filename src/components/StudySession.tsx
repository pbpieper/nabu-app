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
import { isRTL, type Card, type SessionStats } from '@src/types'
import {
  X, CheckCircle, RotateCcw, Check, Clock, RefreshCw, Volume2,
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
// Helpers
// ---------------------------------------------------------------------------

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
// Main component
// ---------------------------------------------------------------------------

export default function StudySession() {
  const router = useRouter()
  const navigation = useNavigation()
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const currentDeck = useDecksStore(s => s.currentDeck)
  const currentCards = useDecksStore(s => s.currentCards)
  const newCardsPerSession = useStudyPreferencesStore(s => s.newCardsPerSession)
  const resolvedTheme = useThemeStore(s => s.resolvedTheme)
  const dark = resolvedTheme === 'dark'
  const {
    queue, currentIndex, sessionActive,
    loadAndStart, startSession, answerCard, nextCard, endSession, sessionStats,
  } = useStudyStore()

  const c = useThemeColors()
  const { play: playAudio, stop: stopAudio } = useAudio()

  // Progressive reveal state
  const [revealedCount, setRevealedCount] = useState(0)
  const [layers, setLayers] = useState<RevealLayerEntry[]>([])
  const [keyHintDismissed, setKeyHintDismissed] = useState(false)

  const completedStatsRef = useRef<SessionStats | null>(null)

  const userId = profile?.id ?? session?.user?.id

  // Derived state
  const currentCardId = queue[currentIndex]
  const card = currentCards.find(ci => ci.id === currentCardId)
  const translationRevealed = revealedCount >= layers.length && layers.length > 0
  const rtl = currentDeck ? isRTL(currentDeck.target_language) : false

  // Rebuild layers whenever card changes
  useEffect(() => {
    if (card) {
      const newLayers = buildLayers(card)
      setLayers(newLayers)
      setRevealedCount(0)
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

  // ---------------------------------------------------------------------------
  // Answer handlers
  // ---------------------------------------------------------------------------

  const handleAnswer = useCallback((correct: boolean) => {
    if (userId && card) answerCard(card.id, correct, userId)
    stopAudio().catch(() => {})
    nextCard()
    // revealedCount and layers reset via the card?.id effect
  }, [userId, card, answerCard, nextCard, stopAudio])

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (web only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
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
  // Tab bar hiding
  // ---------------------------------------------------------------------------

  useFocusEffect(useCallback(() => {
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
  }, [navigation, dark]))

  // ---------------------------------------------------------------------------
  // Session bootstrap
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (currentDeck && userId && !sessionActive) {
      loadAndStart(currentDeck.id, userId, { newLimit: newCardsPerSession })
    }
  }, [currentDeck?.id, userId])

  const isComplete = currentIndex >= queue.length && queue.length > 0

  useEffect(() => {
    if (isComplete && sessionStats.cardsReviewed > 0) {
      completedStatsRef.current = { ...sessionStats }
    }
  }, [isComplete])

  const handleClose = () => {
    stopAudio().catch(() => {})
    endSession()
    router.back()
  }

  // =========================================================================
  // EARLY RETURN SCREENS (no deck, loading, all caught up, session complete)
  // =========================================================================

  if (!currentDeck) {
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

  if (!sessionActive && (currentCards.length === 0 || queue.length === 0)) {
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

  // All caught up
  if (sessionActive && queue.length === 0) {
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
            {currentDeck.title}
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

  // Session complete
  const displayStats = completedStatsRef.current ?? sessionStats
  if (isComplete) {
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
            {currentDeck.title}
          </Text>

          <View style={{
            flexDirection: 'row', gap: 1, marginBottom: 32,
            backgroundColor: c.border, borderRadius: 14, overflow: 'hidden',
          }}>
            {[
              { label: 'Reviewed', value: displayStats.cardsReviewed },
              { label: 'Correct', value: displayStats.cardsCorrect },
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

          <View style={{ gap: 10, width: '100%', maxWidth: 300 }}>
            <Pressable
              onPress={() => {
                completedStatsRef.current = null
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
                Study Again
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
        <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.textSecondary }}>
          {currentIndex + 1} / {queue.length}
        </Text>
        <View style={{ width: 36 }} />
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
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary,
                textAlign: 'center', lineHeight: 20, writingDirection: rtl ? 'rtl' : 'ltr',
              }}>
                {card.example_sentence}
              </Text>
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

      {/* Grading buttons — only after translation is revealed */}
      {translationRevealed && (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingBottom: 24 }}>
          <Pressable
            onPress={() => handleAnswer(false)}
            style={({ pressed }) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
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
              gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Check size={16} color={c.success} />
            <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.success }}>Got it</Text>
          </Pressable>
        </View>
      )}

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
