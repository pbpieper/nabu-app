import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@src/services/supabase/client'
import { useThemeColors } from '@src/hooks/useThemeColors'
import { ArrowLeft, Users, BarChart3, BookCheck, Target } from 'lucide-react-native'

interface DeckAnalytics {
  deck_id: string
  active_students: number
  total_reviews: number
  avg_accuracy: number
  cards_mastered: number
}

interface CardStat {
  card_id: string
  word: string
  translation: string
  total_reviews: number
  avg_hints: number
  accuracy: number
}

export default function AnalyticsScreen() {
  const router = useRouter()
  const { deckId, title } = useLocalSearchParams<{ deckId: string; title?: string }>()
  const c = useThemeColors()

  const [analytics, setAnalytics] = useState<DeckAnalytics | null>(null)
  const [cardStats, setCardStats] = useState<CardStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!deckId) return
    loadAnalytics()
  }, [deckId])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      // Fetch deck-level analytics from the view
      const { data: analyticsData } = await supabase
        .from('deck_analytics')
        .select('*')
        .eq('deck_id', deckId)
        .single()

      if (analyticsData) {
        setAnalytics(analyticsData as DeckAnalytics)
      }

      // Fetch per-card stats: join cards with aggregated progress
      const { data: cardsData } = await supabase
        .from('cards')
        .select('id, word, translation')
        .eq('deck_id', deckId)
        .order('sort_order', { ascending: true })

      if (cardsData && cardsData.length > 0) {
        const cardIds = cardsData.map(c => c.id)

        const { data: progressData } = await supabase
          .from('card_progress')
          .select('card_id, total_reviews, total_correct, avg_hints_needed')
          .in('card_id', cardIds)

        // Aggregate per card
        const statsMap = new Map<string, { reviews: number; correct: number; hints: number; count: number }>()
        for (const p of (progressData ?? [])) {
          const existing = statsMap.get(p.card_id) ?? { reviews: 0, correct: 0, hints: 0, count: 0 }
          existing.reviews += p.total_reviews ?? 0
          existing.correct += p.total_correct ?? 0
          existing.hints += p.avg_hints_needed ?? 0
          existing.count += 1
          statsMap.set(p.card_id, existing)
        }

        const stats: CardStat[] = cardsData.map(card => {
          const s = statsMap.get(card.id)
          return {
            card_id: card.id,
            word: card.word,
            translation: card.translation,
            total_reviews: s?.reviews ?? 0,
            avg_hints: s && s.count > 0 ? s.hints / s.count : 0,
            accuracy: s && s.reviews > 0 ? (s.correct / s.reviews) * 100 : 0,
          }
        })

        setCardStats(stats)
      }
    } catch {
      // Silently fail — analytics are non-critical
    } finally {
      setLoading(false)
    }
  }

  const statCards = analytics
    ? [
        { icon: Users, label: 'Active Students', value: String(analytics.active_students) },
        { icon: BarChart3, label: 'Total Reviews', value: String(analytics.total_reviews) },
        { icon: Target, label: 'Avg Accuracy', value: `${Math.round(analytics.avg_accuracy)}%` },
        { icon: BookCheck, label: 'Cards Mastered', value: String(analytics.cards_mastered) },
      ]
    : []

  // Sort trouble cards: low accuracy + high reviews first
  const troubleCards = [...cardStats]
    .filter(c => c.total_reviews >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: c.border,
      }}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/(decks)')}
          style={{ padding: 8 }}
        >
          <ArrowLeft size={22} color={c.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text style={{ fontFamily: 'Geist-SemiBold', fontSize: 17, color: c.text }} numberOfLines={1}>
            Analytics
          </Text>
          {title && (
            <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted }} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.textMuted} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Overview Stats */}
          {analytics ? (
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28,
            }}>
              {statCards.map(({ icon: Icon, label, value }) => (
                <View
                  key={label}
                  style={{
                    flex: 1, minWidth: '45%',
                    backgroundColor: c.surface, borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <Icon size={18} color={c.textMuted} />
                  <Text style={{
                    fontFamily: 'Geist-SemiBold', fontSize: 24, color: c.text,
                    letterSpacing: -0.5, marginTop: 8,
                  }}>
                    {value}
                  </Text>
                  <Text style={{ fontFamily: 'Geist-Regular', fontSize: 12, color: c.textMuted, marginTop: 2 }}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.textMuted }}>
                No analytics data yet. Students need to start studying.
              </Text>
            </View>
          )}

          {/* Trouble Cards */}
          {troubleCards.length > 0 && (
            <>
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12,
              }}>
                Needs Attention
              </Text>
              <Text style={{
                fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted,
                marginBottom: 12, lineHeight: 18,
              }}>
                Cards with the lowest accuracy among students
              </Text>
              <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
                {troubleCards.map((card, i) => (
                  <View
                    key={card.card_id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 12,
                      borderBottomWidth: i < troubleCards.length - 1 ? 1 : 0,
                      borderBottomColor: c.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Geist-Medium', fontSize: 15, color: c.text }}>
                        {card.word}
                      </Text>
                      <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, marginTop: 1 }}>
                        {card.translation}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        fontFamily: 'Geist-SemiBold', fontSize: 14,
                        color: card.accuracy < 40 ? c.error : card.accuracy < 70 ? '#f59e0b' : c.success,
                      }}>
                        {Math.round(card.accuracy)}%
                      </Text>
                      <Text style={{ fontFamily: 'Geist-Regular', fontSize: 11, color: c.textMuted }}>
                        {card.total_reviews} reviews
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* All Cards Performance */}
          {cardStats.length > 0 && (
            <>
              <Text style={{
                fontFamily: 'Geist-Medium', fontSize: 12, color: c.textMuted,
                letterSpacing: 0.8, textTransform: 'uppercase',
                marginTop: 28, marginBottom: 12,
              }}>
                All Cards
              </Text>
              <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
                {/* Header row */}
                <View style={{
                  flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8,
                  backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
                }}>
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 11, color: c.textMuted, flex: 2 }}>Word</Text>
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'center' }}>Reviews</Text>
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'center' }}>Hints</Text>
                  <Text style={{ fontFamily: 'Geist-Medium', fontSize: 11, color: c.textMuted, flex: 1, textAlign: 'right' }}>Acc</Text>
                </View>
                {cardStats.map((card, i) => (
                  <View
                    key={card.card_id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 16, paddingVertical: 10,
                      borderBottomWidth: i < cardStats.length - 1 ? 1 : 0,
                      borderBottomColor: c.border,
                    }}
                  >
                    <Text style={{ fontFamily: 'Geist-Regular', fontSize: 14, color: c.text, flex: 2 }} numberOfLines={1}>
                      {card.word}
                    </Text>
                    <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, flex: 1, textAlign: 'center' }}>
                      {card.total_reviews}
                    </Text>
                    <Text style={{ fontFamily: 'Geist-Regular', fontSize: 13, color: c.textMuted, flex: 1, textAlign: 'center' }}>
                      {card.avg_hints.toFixed(1)}
                    </Text>
                    <Text style={{
                      fontFamily: 'Geist-Medium', fontSize: 13, flex: 1, textAlign: 'right',
                      color: card.total_reviews === 0 ? c.textMuted :
                        card.accuracy < 40 ? c.error : card.accuracy < 70 ? '#f59e0b' : c.success,
                    }}>
                      {card.total_reviews > 0 ? `${Math.round(card.accuracy)}%` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
