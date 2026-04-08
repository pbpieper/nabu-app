import { useEffect } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, usePathname } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import Toast from 'react-native-toast-message'
import { useDecksStore } from '@src/stores/useDecksStore'
import { useAuthStore } from '@src/stores/useAuthStore'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { LANGUAGES, isRTL } from '@src/types'
import { ArrowLeft, Play, Copy, Globe, Pencil, BarChart3 } from 'lucide-react-native'

function langName(code: string): string {
  return LANGUAGES.find(l => l.code === code)?.name ?? code.toUpperCase()
}

export default function DeckDetailScreen({ deckId }: { deckId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const session = useAuthStore(s => s.session)
  const profile = useAuthStore(s => s.profile)
  const currentDeck = useDecksStore(s => s.currentDeck)
  const currentCards = useDecksStore(s => s.currentCards)
  const deckStats = useDecksStore(s => s.deckStats)
  const loading = useDecksStore(s => s.loading)
  const loadDeckWithCards = useDecksStore(s => s.loadDeckWithCards)
  const setCurrentDeck = useDecksStore(s => s.setCurrentDeck)
  const getDeckById = useDecksStore(s => s.getDeckById)
  const c = useThemeColors()

  const userId = profile?.id ?? session?.user?.id

  useEffect(() => {
    if (userId) loadDeckWithCards(deckId, userId)
  }, [deckId, userId])

  const deck = currentDeck?.id === deckId ? currentDeck : getDeckById(deckId)
  const cards = currentDeck?.id === deckId ? currentCards : []
  const rtl = deck ? isRTL(deck.target_language) : false

  const handleCopyCode = async () => {
    if (!deck) return
    await Clipboard.setStringAsync(deck.share_code)
    Toast.show({ type: 'success', text1: 'Share code copied', text2: deck.share_code })
  }

  const handleStudy = () => {
    if (!deck) return
    setCurrentDeck(deck)
    const studyRoute = pathname.includes('(decks)')
      ? '/(app)/(decks)/study'
      : '/(app)/(home)/study'
    router.push(studyRoute as any)
  }

  if (!deck && !loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted }}>Deck not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const statItems = deckStats ? [
    { label: 'New', value: deckStats.new },
    { label: 'Learning', value: deckStats.learning },
    { label: 'Review', value: deckStats.review },
    { label: 'Mastered', value: deckStats.mastered },
  ] : null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
      }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(home)')}
          style={{ padding: 8 }}
        >
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {deck && (
          <>
            {/* Title & Language */}
            <Text style={{
              fontFamily: 'Geist-SemiBold', fontSize: 26, color: c.text,
              letterSpacing: -0.5, marginBottom: 6, marginTop: 4,
            }}>
              {deck.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Globe size={14} color={c.textMuted} />
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted }}>
                {langName(deck.source_language)} → {langName(deck.target_language)}
              </Text>
            </View>
            {deck.description && (
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 14, color: c.textSecondary,
                lineHeight: 20, marginTop: 4,
              }}>
                {deck.description}
              </Text>
            )}

            {/* Share Code */}
            <Pressable
              onPress={handleCopyCode}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: c.surface, borderRadius: 10,
                paddingHorizontal: 14, paddingVertical: 10,
                marginTop: 16, alignSelf: 'flex-start',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 14, color: c.text, letterSpacing: 1 }}>
                {deck.share_code}
              </Text>
              <Copy size={14} color={c.textMuted} />
            </Pressable>

            {/* Progress Stats */}
            {statItems && (
              <View style={{
                flexDirection: 'row', gap: 1, marginTop: 24, marginBottom: 4,
                backgroundColor: c.border, borderRadius: 14, overflow: 'hidden',
              }}>
                {statItems.map(s => (
                  <View key={s.label} style={{
                    flex: 1, backgroundColor: c.surface,
                    paddingVertical: 12, alignItems: 'center',
                  }}>
                    <Text style={{
                      fontFamily: 'Geist-SemiBold', fontSize: 18, color: c.text,
                      letterSpacing: -0.3,
                    }}>
                      {s.value}
                    </Text>
                    <Text style={{ fontFamily: 'Geist-Regular', fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Study Button */}
            <Pressable
              onPress={handleStudy}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: c.accent, borderRadius: 12,
                paddingVertical: 16, marginTop: 24,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Play size={18} color={c.accentText} />
              <Text style={{ fontFamily: 'Geist-Medium', fontSize: 16, color: c.accentText }}>
                Study Now
              </Text>
            </Pressable>

            {/* Creator actions — Edit + Analytics */}
            {userId && deck.creator_id === userId && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Pressable
                  onPress={() => router.push(`/(app)/(decks)/editor?deckId=${deck.id}` as any)}
                  style={({ pressed }) => ({
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    borderWidth: 1, borderColor: c.border, borderRadius: 12,
                    paddingVertical: 14,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Pencil size={16} color={c.textSecondary} />
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.textSecondary }}>
                    Edit Cards
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/(app)/(decks)/analytics?deckId=${deck.id}&title=${encodeURIComponent(deck.title)}` as any)}
                  style={({ pressed }) => ({
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    borderWidth: 1, borderColor: c.border, borderRadius: 12,
                    paddingVertical: 14,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <BarChart3 size={16} color={c.textSecondary} />
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.textSecondary }}>
                    Analytics
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Card list */}
            {cards.length > 0 && (
              <>
                <Text style={{
                  fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                  letterSpacing: 0.8, textTransform: 'uppercase',
                  marginTop: 32, marginBottom: 12,
                }}>
                  {cards.length} Cards
                </Text>
                <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
                  {cards.map((card, i) => (
                    <View
                      key={card.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 13,
                        borderBottomWidth: i < cards.length - 1 ? 1 : 0,
                        borderBottomColor: c.border,
                      }}
                    >
                      <Text style={{
                        fontFamily: 'Geist-Medium', fontSize: 15, color: c.text, flex: 1,
                        writingDirection: rtl ? 'rtl' : 'ltr',
                      }}>
                        {card.word}
                      </Text>
                      <Text style={{
                        fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted,
                        textAlign: 'right', flex: 1,
                      }}>
                        {card.translation}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
