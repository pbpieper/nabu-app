import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useNavigation, useFocusEffect } from 'expo-router'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useStudyStore } from '@src/stores/useStudyStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useStudyPreferencesStore } from '@src/stores/useStudyPreferencesStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { useThemeStore } from '@src/stores/useThemeStore'
import { isRTL, type SessionStats } from '@src/types'
import { X, CheckCircle, RotateCcw, Check, Clock, RefreshCw } from 'lucide-react-native'

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
  const [flipped, setFlipped] = useState(false)
  const completedStatsRef = useRef<SessionStats | null>(null)
  const c = useThemeColors()

  const userId = profile?.id ?? session?.user?.id

  // Hide the tab bar while this screen is focused
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

  // Single parallel load: cards + progress fetched together, session starts immediately
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
    endSession()
    router.back()
  }

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

  const currentCardId = queue[currentIndex]
  const card = currentCards.find(c => c.id === currentCardId)
  const rtl = isRTL(currentDeck.target_language)

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

  const handleAnswer = (correct: boolean) => {
    if (userId) answerCard(card.id, correct, userId)
    setFlipped(false)
    nextCard()
  }

  const progress = ((currentIndex + 1) / queue.length) * 100

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
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

      <View style={{ height: 3, backgroundColor: c.progressBg, marginHorizontal: 20, borderRadius: 2 }}>
        <View style={{ height: 3, backgroundColor: c.progressFill, borderRadius: 2, width: `${progress}%` }} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        <Pressable
          onPress={() => setFlipped(!flipped)}
          style={{
            borderWidth: 1, borderColor: c.border,
            borderRadius: 16, padding: 32, minHeight: 260,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {!flipped ? (
            <>
              <Text style={{
                fontFamily: 'Geist-SemiBold', fontSize: 28, color: c.text,
                textAlign: 'center', writingDirection: rtl ? 'rtl' : 'ltr',
              }}>
                {card.word}
              </Text>
              {card.part_of_speech && (
                <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 8 }}>
                  {card.part_of_speech}
                </Text>
              )}
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted, marginTop: 20, opacity: 0.6 }}>
                Tap to reveal
              </Text>
            </>
          ) : (
            <>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginBottom: 8 }}>
                {card.word}
              </Text>
              <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 24, color: c.text, textAlign: 'center' }}>
                {card.translation}
              </Text>
              {card.example_sentence && (
                <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginTop: 16, width: '100%' }}>
                  <Text style={{
                    fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary,
                    textAlign: 'center', lineHeight: 20, writingDirection: rtl ? 'rtl' : 'ltr',
                  }}>
                    {card.example_sentence}
                  </Text>
                </View>
              )}
              {card.explanation && (
                <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 10, textAlign: 'center' }}>
                  {card.explanation}
                </Text>
              )}
            </>
          )}
        </Pressable>
      </View>

      {flipped && (
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
    </SafeAreaView>
  )
}
