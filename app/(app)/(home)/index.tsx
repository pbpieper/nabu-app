import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useProgressStore } from '@src/stores/useProgressStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { Flame, Play, ArrowRight, Check } from 'lucide-react-native'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function HomeScreen() {
  const router = useRouter()
  const profile = useAuthStore(s => s.profile)
  const session = useAuthStore(s => s.session)
  const decks = useDecksStore(s => s.decks)
  const loadDecks = useDecksStore(s => s.loadDecks)
  const setCurrentDeck = useDecksStore(s => s.setCurrentDeck)
  const getDeckById = useDecksStore(s => s.getDeckById)
  const loadDeckByCode = useDecksStore(s => s.loadDeckByCode)
  const progress = useProgressStore()
  const c = useThemeColors()

  const userId = profile?.id ?? session?.user?.id

  const [code, setCode] = useState('')
  const [codeFocused, setCodeFocused] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)

  useEffect(() => { loadDecks() }, [])
  useEffect(() => {
    if (userId) progress.loadUserProgress(userId)
  }, [userId])

  const todayIdx = (() => {
    const d = new Date().getDay()
    return d === 0 ? 6 : d - 1
  })()

  const hasStreak = progress.currentStreak > 0
  const hasDue = progress.totalDue > 0

  const handleStartStudy = () => {
    const deckId = progress.mostUrgentDeckId
    if (!deckId) return
    const deck = getDeckById(deckId)
    if (!deck) return
    setCurrentDeck(deck)
    router.push('/(app)/(home)/study')
  }

  const handleCodeSubmit = async () => {
    if (!code.trim()) return
    setCodeLoading(true)
    try {
      const deck = await loadDeckByCode(code.trim())
      if (deck) {
        setCode('')
        router.push(`/(app)/(home)/deck/${deck.id}`)
      } else {
        Toast.show({ type: 'error', text1: 'Deck not found', text2: `No deck with code "${code}"` })
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Error loading deck' })
    } finally {
      setCodeLoading(false)
    }
  }

  const hasDecks = decks.length > 0

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
            ? `${progress.totalDue} card${progress.totalDue !== 1 ? 's' : ''} due today`
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
              Enter a code from your teacher to join a deck and start learning.
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
              onPress={handleStartStudy}
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
                    ? `${progress.totalDue} card${progress.totalDue !== 1 ? 's' : ''} across ${Object.keys(progress.dueByDeck).filter(k => progress.dueByDeck[k] > 0).length} deck${Object.keys(progress.dueByDeck).filter(k => progress.dueByDeck[k] > 0).length !== 1 ? 's' : ''}`
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
                  {progress.currentStreak}
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
                  const active = progress.weekActivity[i]
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

            {/* Quick deck links — only decks with due cards */}
            {Object.keys(progress.dueByDeck).filter(k => progress.dueByDeck[k] > 0).length > 1 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{
                  fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                  letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Due by deck
                </Text>
                <View style={{ gap: 6 }}>
                  {decks
                    .filter(d => (progress.dueByDeck[d.id] ?? 0) > 0)
                    .map(deck => {
                      const due = progress.dueByDeck[deck.id] ?? 0
                      return (
                        <Pressable
                          key={deck.id}
                          onPress={() => {
                            setCurrentDeck(deck)
                            router.push('/(app)/(home)/study')
                          }}
                          style={({ pressed }) => ({
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            borderWidth: 1, borderColor: c.border, borderRadius: 10,
                            paddingHorizontal: 14, paddingVertical: 12,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.text }}>
                            {deck.title}
                          </Text>
                          <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }}>
                            {due} due
                          </Text>
                        </Pressable>
                      )
                    })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
