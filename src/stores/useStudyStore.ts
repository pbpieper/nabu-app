import { create } from 'zustand'
import type { Card, CardProgress, SessionStats } from '@src/types'
import { processReview, createNewProgress, buildStudyQueue } from '@src/lib/srs'
import { supabase } from '@src/services/supabase/client'
import { useDecksStore } from './useDecksStore'

interface StartOpts { includeAll?: boolean; newLimit?: number }

interface StudyState {
  queue: string[]
  currentIndex: number
  progressMap: Map<string, CardProgress>
  sessionStats: SessionStats
  sessionActive: boolean
  practiceAll: boolean
  loadAndStart: (deckId: string, userId: string, opts?: StartOpts) => Promise<void>
  startSession: (cards: Card[], userId: string, deckId: string, opts?: StartOpts) => Promise<void>
  answerCard: (cardId: string, correct: boolean, userId: string) => void
  nextCard: () => void
  endSession: () => void
  setPracticeAll: (value: boolean) => void
}

const emptyStats: SessionStats = { cardsReviewed: 0, cardsCorrect: 0, newCardsSeen: 0, durationMs: 0 }

export const useStudyStore = create<StudyState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  progressMap: new Map(),
  sessionStats: { ...emptyStats },
  sessionActive: false,
  practiceAll: false,

  loadAndStart: async (deckId, userId, opts) => {
    const [cardsRes, progressRes] = await Promise.all([
      supabase.from('cards').select('*').eq('deck_id', deckId).order('sort_order', { ascending: true }),
      supabase.from('card_progress').select('*').eq('user_id', userId).eq('deck_id', deckId),
    ])

    const cards = (cardsRes.data ?? []) as Card[]
    useDecksStore.setState({ currentCards: cards })

    const progressMap = new Map<string, CardProgress>()
    for (const row of progressRes.data ?? []) {
      progressMap.set(row.card_id, row as CardProgress)
    }

    const queue = buildStudyQueue(
      cards.map(c => ({ card_id: c.id, progress: progressMap.get(c.id) ?? null })),
      opts?.newLimit ?? 20,
      opts?.includeAll ?? false,
    )

    set({
      queue,
      currentIndex: 0,
      progressMap,
      sessionActive: true,
      practiceAll: opts?.includeAll ?? false,
      sessionStats: { ...emptyStats },
    })
  },

  startSession: async (cards, userId, deckId, opts) => {
    const progressMap = new Map<string, CardProgress>()
    try {
      const { data } = await supabase
        .from('card_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('deck_id', deckId)
      for (const row of data ?? []) {
        progressMap.set(row.card_id, row)
      }
    } catch {
      // offline — start fresh
    }

    const queue = buildStudyQueue(
      cards.map(c => ({ card_id: c.id, progress: progressMap.get(c.id) ?? null })),
      opts?.newLimit ?? 20,
      opts?.includeAll ?? false,
    )

    set({
      queue,
      currentIndex: 0,
      progressMap,
      sessionActive: true,
      practiceAll: opts?.includeAll ?? false,
      sessionStats: { ...emptyStats },
    })
  },

  answerCard: (cardId, correct, userId) => {
    const { progressMap } = get()
    const existing = progressMap.get(cardId)
    const progress = existing ?? createNewProgress(userId, cardId, '')
    const updated = processReview(progress, correct)

    const newMap = new Map(progressMap)
    newMap.set(cardId, updated)

    set(state => ({
      progressMap: newMap,
      sessionStats: {
        ...state.sessionStats,
        cardsReviewed: state.sessionStats.cardsReviewed + 1,
        cardsCorrect: state.sessionStats.cardsCorrect + (correct ? 1 : 0),
        newCardsSeen: state.sessionStats.newCardsSeen + (!existing ? 1 : 0),
      },
    }))

    supabase.from('card_progress').upsert({
      user_id: updated.user_id,
      card_id: updated.card_id,
      deck_id: updated.deck_id,
      interval_days: updated.interval_days,
      next_review_at: updated.next_review_at,
      consecutive_correct: updated.consecutive_correct,
      total_reviews: updated.total_reviews,
      total_correct: updated.total_correct,
      status: updated.status,
      last_reviewed_at: updated.last_reviewed_at,
    }, { onConflict: 'user_id,card_id' }).then(() => {}, () => {})
  },

  nextCard: () => {
    set(state => ({ currentIndex: Math.min(state.currentIndex + 1, state.queue.length) }))
  },

  endSession: () => {
    set({
      sessionActive: false,
      queue: [],
      currentIndex: 0,
      practiceAll: false,
      sessionStats: { ...emptyStats },
    })
  },

  setPracticeAll: (value) => set({ practiceAll: value }),
}))
