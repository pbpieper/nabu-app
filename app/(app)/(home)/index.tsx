import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useLocalDeckStore } from '@src/stores/useLocalDeckStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { buildStudyQueue } from '@src/lib/srs'
import { Flame, Play, ArrowRight, Check, RefreshCw, Trash2 } from 'lucide-react-native'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// ---------------------------------------------------------------------------
// Helpers — compute streak/due from local progress
// ---------------------------------------------------------------------------

function getLocalDateStr(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calcStreak(dates: Set<string>): number {
  const today = todayStr()
  const yesterday = yesterdayStr()
  let current = dates.has(today) ? today : dates.has(yesterday) ? yesterday : null
  if (!current) return 0
  let streak = 0
  const d = new Date(current + 'T12:00:00')
  while (true) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!dates.has(key)) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

function calcWeekActivity(dates: Set<string>): boolean[] {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const result: boolean[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push(dates.has(key))
  }
  return result
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter()
  const profile = useAuthStore(s => s.profile)
  const session = useAuthStore(s => s.session)
  const setCurrentDeck = useDecksStore(s => s.setCurrentDeck)
  const c = useThemeColors()

  // Local deck store
  const localDecks = useLocalDeckStore(s => s.getAllLocalDecks)()
  const localProgress = useLocalDeckStore(s => s.progress)
  const downloadDeck = useLocalDeckStore(s => s.downloadDeck)
  const updatesAvailable = useLocalDeckStore(s => s.updatesAvailable)
  const checkForUpdates = useLocalDeckStore(s => s.checkForUpdates)
  const updateDeck = useLocalDeckStore(s => s.updateDeck)
  const removeDeck = useLocalDeckStore(s => s.removeDeck)
  const getLocalCards = useLocalDeckStore(s => s.getLocalCards)

  const userId = profile?.id ?? session?.user?.id

  const [code, setCode] = useState('')
  const [codeFocused, setCodeFocused] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [updatingDeckId, setUpdatingDeckId] = useState<string | null>(null)

  // Check for deck updates on mount (lightweight — just compares timestamps)
  useEffect(() => {
    checkForUpdates()
  }, [])

  // ── Compute stats from local data ──
  const reviewDates = new Set<string>()
  const dueByDeck: Record<string, number> = {}
  let totalDue = 0

  for (const ld of localDecks) {
    const deckId = ld.deck.id
    const progress = localProgress[deckId] ?? {}
    const cards = ld.cards
    const now = new Date()

    // Count due using the SRS queue builder (same logic as study session)
    const entries = cards.map(card => ({
      card_id: card.id,
      progress: progress[card.id] ?? null,
    }))
    const queue = buildStudyQueue(entries, 999) // all due + new
    dueByDeck[deckId] = queue.length

    totalDue += queue.length

    // Collect review dates for streak
    for (const p of Object.values(progress)) {
      if (p.last_reviewed_at) {
        reviewDates.add(getLocalDateStr(p.last_reviewed_at))
      }
    }
  }

  const currentStreak = calcStreak(reviewDates)
  const weekActivity = calcWeekActivity(reviewDates)
  const hasStreak = currentStreak > 0
  const hasDue = totalDue > 0
  const hasDecks = localDecks.length > 0

  const todayIdx = (() => {
    const d = new Date().getDay()
    return d === 0 ? 6 : d - 1
  })()

  // ── Handlers ──

  const handleCodeSubmit = async () => {
    if (!code.trim()) return
    setCodeLoading(true)
    try {
      const deck = await downloadDeck(code.trim())
      if (deck) {
        setCode('')
        Toast.show({ type: 'success', text1: 'Deck downloaded', text2: `${deck.title} is ready to study` })
      } else {
        Toast.show({ type: 'error', text1: 'Deck not found', text2: `No deck with code "${code}"` })
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Error downloading deck' })
    } finally {
      setCodeLoading(false)
    }
  }

  const handleStartStudy = (deckId?: string) => {
    const targetDeckId = deckId ?? localDecks.find(ld => (dueByDeck[ld.deck.id] ?? 0) > 0)?.deck.id
    if (!targetDeckId) return
    const ld = useLocalDeckStore.getState().getLocalDeck(targetDeckId)
    if (!ld) return
    // Set current deck in decks store so study session can find it
    setCurrentDeck(ld.deck)
    useDecksStore.setState({ currentCards: ld.cards })
    router.push('/(app)/(home)/study')
  }

  const handleUpdateDeck = async (deckId: string) => {
    setUpdatingDeckId(deckId)
    try {
      const ok = await updateDeck(deckId)
      if (ok) {
        Toast.show({ type: 'success', text1: 'Deck updated', text2: 'Your progress has been preserved' })
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Update failed' })
    } finally {
      setUpdatingDeckId(null)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={{
          fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted, marginBottom: 2,
        }}>
          {hasDecks && hasDue
            ? `${totalDue} card${totalDue !== 1 ? 's' : ''} due today`
            : hasDecks
              ? 'All caught up'
              : 'Get started'}
        </Text>
        <Text style={{
          fontFamily: 'Geist-SemiBold', fontSize: 28, color: c.text,
          letterSpacing: -0.5, marginBottom: 28,
        }}>
          {profile?.display_name ? `Hey, ${profile.display_name}` : 'Nabu'}
        </Text>

        {/* ── Empty state: no decks ── */}
        {!hasDecks && (
          <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}>
            <Text style={{
              fontFamily: 'Geist-SemiBold', fontSize: 20, color: c.text,
              letterSpacing: -0.3, marginBottom: 6,
            }}>
              Join your first deck
            </Text>
            <Text style={{
              fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
              lineHeight: 20, marginBottom: 20, maxWidth: 300,
            }}>
              Enter a code from your teacher to download a deck and start learning.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Enter deck code"
                placeholderTextColor={c.placeholder}
                autoCapitalize="characters"
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
                onSubmitEditing={handleCodeSubmit}
                style={{
                  flex: 1, fontFamily: 'Geist-Medium', fontSize: 15,
                  color: c.text, letterSpacing: 1,
                  borderWidth: 1, borderColor: codeFocused ? c.borderFocus : c.border,
                  borderRadius: 10, paddingHorizontal: 14, height: 46,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
              <Pressable
                onPress={handleCodeSubmit}
                disabled={codeLoading || !code.trim()}
                style={({ pressed }) => ({
                  width: 46, height: 46, borderRadius: 10,
                  backgroundColor: c.accent,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: codeLoading || !code.trim() ? 0.3 : pressed ? 0.8 : 1,
                })}
              >
                {codeLoading
                  ? <ActivityIndicator color={c.accentText} size="small" />
                  : <ArrowRight size={18} color={c.accentText} />
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Has decks: Learning dashboard ── */}
        {hasDecks && (
          <>
            {/* Study CTA */}
            <Pressable
              onPress={() => handleStartStudy()}
              disabled={!hasDue}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: hasDue ? c.accent : c.surface,
                borderRadius: 14, padding: 18, marginBottom: 24,
                opacity: hasDue ? (pressed ? 0.92 : 1) : 0.7,
              })}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: hasDue
                  ? (c.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)')
                  : c.border,
                alignItems: 'center', justifyContent: 'center', marginRight: 14,
              }}>
                {hasDue
                  ? <Play size={20} color={c.accentText} />
                  : <Check size={20} color={c.textMuted} />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontFamily: 'Geist-Medium', fontSize: 16,
                  color: hasDue ? c.accentText : c.text,
                }}>
                  {hasDue ? 'Start Studying' : 'All caught up!'}
                </Text>
                <Text style={{
                  fontFamily: 'Geist-Regular', fontSize: 13,
                  color: hasDue ? c.accentText : c.textMuted,
                  opacity: hasDue ? 0.65 : 1, marginTop: 3,
                }}>
                  {hasDue
                    ? `${totalDue} card${totalDue !== 1 ? 's' : ''} across ${Object.values(dueByDeck).filter(v => v > 0).length} deck${Object.values(dueByDeck).filter(v => v > 0).length !== 1 ? 's' : ''}`
                    : 'Come back later for more reviews'
                  }
                </Text>
              </View>
            </Pressable>

            {/* Streak */}
            <View style={{
              borderWidth: 1, borderColor: c.border, borderRadius: 14,
              padding: 16, marginBottom: 24,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Flame size={18} color={hasStreak ? c.streak : c.textMuted} style={{ marginRight: 8 }} />
                <Text style={{
                  fontFamily: 'Geist-SemiBold', fontSize: 20,
                  color: hasStreak ? c.text : c.textMuted,
                  letterSpacing: -0.3,
                }}>
                  {currentStreak}
                </Text>
                <Text style={{
                  fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted,
                  marginLeft: 6, marginTop: 1,
                }}>
                  day streak
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {WEEK.map((label, i) => {
                  const active = weekActivity[i]
                  const isToday = i === todayIdx
                  const isFuture = i > todayIdx
                  return (
                    <View key={i} style={{ alignItems: 'center', gap: 4 }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: active ? (c.dark ? '#27272A' : '#E4E4E7') : 'transparent',
                        borderWidth: active ? 0 : 1,
                        borderColor: isToday ? c.textSecondary : c.border,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: isFuture ? 0.3 : 1,
                      }}>
                        {active && (
                          <View style={{
                            width: 7, height: 7, borderRadius: 3.5,
                            backgroundColor: c.text,
                          }} />
                        )}
                      </View>
                      <Text style={{
                        fontFamily: isToday ? 'Geist-SemiBold' : 'Geist-Regular',
                        fontSize: 10, color: isToday ? c.text : c.textMuted,
                      }}>
                        {label}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {/* Deck list */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
              }}>
                Your Decks
              </Text>
              <View style={{ gap: 6 }}>
                {localDecks.map(ld => {
                  const due = dueByDeck[ld.deck.id] ?? 0
                  const hasUpdate = !!updatesAvailable[ld.deck.id]
                  const isUpdating = updatingDeckId === ld.deck.id
                  return (
                    <Pressable
                      key={ld.deck.id}
                      onPress={() => handleStartStudy(ld.deck.id)}
                      disabled={due === 0}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        borderWidth: 1, borderColor: hasUpdate ? c.accent : c.border, borderRadius: 10,
                        paddingHorizontal: 14, paddingVertical: 12,
                        opacity: due === 0 ? 0.5 : pressed ? 0.7 : 1,
                      })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.text }}>
                          {ld.deck.title}
                        </Text>
                        <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                          {ld.cards.length} cards{due > 0 ? ` · ${due} due` : ' · all caught up'}
                        </Text>
                      </View>
                      {hasUpdate && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.()
                            handleUpdateDeck(ld.deck.id)
                          }}
                          disabled={isUpdating}
                          style={({ pressed }) => ({
                            paddingHorizontal: 10, paddingVertical: 6,
                            borderRadius: 8, backgroundColor: c.accent,
                            opacity: isUpdating ? 0.5 : pressed ? 0.8 : 1,
                            marginLeft: 8,
                          })}
                        >
                          {isUpdating
                            ? <ActivityIndicator color={c.accentText} size="small" />
                            : <RefreshCw size={14} color={c.accentText} />
                          }
                        </Pressable>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Add another deck */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
              }}>
                Add a deck
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="Enter deck code"
                  placeholderTextColor={c.placeholder}
                  autoCapitalize="characters"
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  onSubmitEditing={handleCodeSubmit}
                  style={{
                    flex: 1, fontFamily: 'Geist-Medium', fontSize: 15,
                    color: c.text, letterSpacing: 1,
                    borderWidth: 1, borderColor: codeFocused ? c.borderFocus : c.border,
                    borderRadius: 10, paddingHorizontal: 14, height: 46,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                  }}
                />
                <Pressable
                  onPress={handleCodeSubmit}
                  disabled={codeLoading || !code.trim()}
                  style={({ pressed }) => ({
                    width: 46, height: 46, borderRadius: 10,
                    backgroundColor: c.accent,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: codeLoading || !code.trim() ? 0.3 : pressed ? 0.8 : 1,
                  })}
                >
                  {codeLoading
                    ? <ActivityIndicator color={c.accentText} size="small" />
                    : <ArrowRight size={18} color={c.accentText} />
                  }
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
