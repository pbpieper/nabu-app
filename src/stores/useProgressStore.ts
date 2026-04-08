import { create } from 'zustand'
import { supabase } from '@src/services/supabase/client'

interface DeckProgressItem {
  deckId: string
  title: string
  targetLanguage: string
  new: number
  learning: number
  review: number
  mastered: number
  total: number
}

interface ProgressState {
  totalMastered: number
  totalLearning: number
  totalReview: number
  totalNew: number
  totalReviews: number
  accuracy: number
  languagesCount: number
  currentStreak: number
  weekActivity: boolean[]
  deckProgress: DeckProgressItem[]
  totalDue: number
  dueByDeck: Record<string, number>
  mostUrgentDeckId: string | null
  loading: boolean
  loadUserProgress: (userId: string) => Promise<void>
}

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

  // Start from today; if no review today, try yesterday (grace period)
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
  const dayOfWeek = now.getDay() // 0=Sun
  // We want Mon=0 ... Sun=6
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

export const useProgressStore = create<ProgressState>((set) => ({
  totalMastered: 0,
  totalLearning: 0,
  totalReview: 0,
  totalNew: 0,
  totalReviews: 0,
  accuracy: 0,
  languagesCount: 0,
  currentStreak: 0,
  weekActivity: [false, false, false, false, false, false, false],
  deckProgress: [],
  totalDue: 0,
  dueByDeck: {},
  mostUrgentDeckId: null,
  loading: false,

  loadUserProgress: async (userId: string) => {
    set({ loading: true })
    try {
      const [progressRes, decksRes] = await Promise.all([
        supabase
          .from('card_progress')
          .select('card_id, deck_id, status, total_reviews, total_correct, last_reviewed_at, next_review_at')
          .eq('user_id', userId),
        supabase
          .from('decks')
          .select('id, title, target_language, card_count')
          .order('created_at', { ascending: false }),
      ])

      const progressRows = progressRes.data ?? []
      const decks = decksRes.data ?? []

      const now = new Date().toISOString()

      let mastered = 0, learning = 0, review = 0, newCount = 0
      let sumReviews = 0, sumCorrect = 0
      const reviewDates = new Set<string>()
      const deckMap = new Map<string, { new: number; learning: number; review: number; mastered: number }>()
      const dueCountByDeck = new Map<string, number>()

      for (const row of progressRows) {
        const s = row.status as string
        if (s === 'mastered') mastered++
        else if (s === 'review') review++
        else if (s === 'learning') learning++
        else newCount++

        sumReviews += row.total_reviews ?? 0
        sumCorrect += row.total_correct ?? 0

        if (row.last_reviewed_at) {
          reviewDates.add(getLocalDateStr(row.last_reviewed_at))
        }

        const dm = deckMap.get(row.deck_id) ?? { new: 0, learning: 0, review: 0, mastered: 0 }
        if (s === 'mastered') dm.mastered++
        else if (s === 'review') dm.review++
        else if (s === 'learning') dm.learning++
        else dm.new++
        deckMap.set(row.deck_id, dm)

        // Count due cards (next_review_at in the past and not mastered)
        if (row.next_review_at && row.next_review_at <= now && s !== 'mastered') {
          dueCountByDeck.set(row.deck_id, (dueCountByDeck.get(row.deck_id) ?? 0) + 1)
        }
      }

      const accuracy = sumReviews > 0 ? Math.round((sumCorrect / sumReviews) * 100) : 0
      const currentStreak = calcStreak(reviewDates)
      const weekActivity = calcWeekActivity(reviewDates)

      // Per-deck progress with deck metadata
      const deckLangs = new Set<string>()
      const deckProgress: DeckProgressItem[] = []
      for (const deck of decks) {
        const stats = deckMap.get(deck.id)
        if (!stats) continue
        deckLangs.add(deck.target_language)
        const tracked = stats.mastered + stats.review + stats.learning + stats.new
        const total = Math.max(deck.card_count, tracked)
        const unseenNew = total - tracked
        deckProgress.push({
          deckId: deck.id,
          title: deck.title,
          targetLanguage: deck.target_language,
          new: stats.new + unseenNew,
          learning: stats.learning,
          review: stats.review,
          mastered: stats.mastered,
          total,
        })
      }

      // Add unseen new cards to due counts per deck
      const dueByDeck: Record<string, number> = {}
      for (const deck of decks) {
        const stats = deckMap.get(deck.id)
        const tracked = stats ? (stats.mastered + stats.review + stats.learning + stats.new) : 0
        const unseenNew = Math.max(0, deck.card_count - tracked)
        const dueFromProgress = dueCountByDeck.get(deck.id) ?? 0
        dueByDeck[deck.id] = dueFromProgress + unseenNew
      }

      const totalDue = Object.values(dueByDeck).reduce((a, b) => a + b, 0)

      let mostUrgentDeckId: string | null = null
      let maxDue = 0
      for (const [deckId, count] of Object.entries(dueByDeck)) {
        if (count > maxDue) { maxDue = count; mostUrgentDeckId = deckId }
      }

      set({
        totalMastered: mastered,
        totalLearning: learning,
        totalReview: review,
        totalNew: newCount,
        totalReviews: sumReviews,
        accuracy,
        languagesCount: deckLangs.size || new Set(decks.map(d => d.target_language)).size,
        currentStreak,
        weekActivity,
        deckProgress,
        totalDue,
        dueByDeck,
        mostUrgentDeckId,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },
}))
