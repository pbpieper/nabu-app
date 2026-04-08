import { create } from 'zustand'
import type { Card, CardProgress, SessionStats } from '@src/types'
import { processReview, createNewProgress, buildStudyQueue } from '@src/lib/srs'
import { supabase } from '@src/services/supabase/client'
import { useDecksStore } from './useDecksStore'
import { useLocalDeckStore } from './useLocalDeckStore'

interface StartOpts { includeAll?: boolean; newLimit?: number }

interface AnswerHistoryEntry {
  cardId: string
  correct: boolean
  hintsRevealed: number
  timeMs: number
  prevProgress: CardProgress | null
}

interface StudyState {
  queue: string[]
  currentIndex: number
  progressMap: Map<string, CardProgress>
  sessionStats: SessionStats
  sessionActive: boolean
  practiceAll: boolean
  answerHistory: AnswerHistoryEntry[]
  wrongCount: number
  newRemaining: number
  loadAndStart: (deckId: string, userId: string, opts?: StartOpts) => Promise<void>
  startSession: (cards: Card[], userId: string, deckId: string, opts?: StartOpts) => Promise<void>
  answerCard: (cardId: string, correct: boolean, userId: string, hintsRevealed?: number, timeMs?: number) => void
  undoLastAnswer: (userId: string) => void
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
  answerHistory: [],
  wrongCount: 0,
  newRemaining: 0,

  loadAndStart: async (deckId, userId, opts) => {
    // ── Local-first: read from local deck store ──
    const localStore = useLocalDeckStore.getState()
    const localDeck = localStore.getLocalDeck(deckId)

    let cards: Card[]
    let progressMap: Map<string, CardProgress>

    if (localDeck) {
      // Read entirely from local storage — instant, no network
      cards = localDeck.cards
      progressMap = localStore.getLocalProgress(deckId)
      useDecksStore.setState({ currentCards: cards })
    } else {
      // Fallback: fetch from Supabase (for decks not yet downloaded)
      const [cardsRes, progressRes] = await Promise.all([
        supabase.from('cards').select('*').eq('deck_id', deckId).order('sort_order', { ascending: true }),
        supabase.from('card_progress').select('*').eq('user_id', userId).eq('deck_id', deckId),
      ])

      cards = (cardsRes.data ?? []) as Card[]
      useDecksStore.setState({ currentCards: cards })

      progressMap = new Map<string, CardProgress>()
      for (const row of progressRes.data ?? []) {
        progressMap.set(row.card_id, row as CardProgress)
      }
    }

    const queue = buildStudyQueue(
      cards.map(c => ({ card_id: c.id, progress: progressMap.get(c.id) ?? null })),
      opts?.newLimit ?? 20,
      opts?.includeAll ?? false,
    )

    const newRemaining = cards.filter(c => !progressMap.has(c.id)).length

    set({
      queue,
      currentIndex: 0,
      progressMap,
      sessionActive: true,
      practiceAll: opts?.includeAll ?? false,
      sessionStats: { ...emptyStats },
      answerHistory: [],
      wrongCount: 0,
      newRemaining: Math.min(newRemaining, opts?.newLimit ?? 20),
    })
  },

  startSession: async (cards, userId, deckId, opts) => {
    // Use local progress if available
    const localStore = useLocalDeckStore.getState()
    const localDeck = localStore.getLocalDeck(deckId)

    let progressMap: Map<string, CardProgress>

    if (localDeck) {
      progressMap = localStore.getLocalProgress(deckId)
    } else {
      progressMap = new Map<string, CardProgress>()
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
    }

    const queue = buildStudyQueue(
      cards.map(c => ({ card_id: c.id, progress: progressMap.get(c.id) ?? null })),
      opts?.newLimit ?? 20,
      opts?.includeAll ?? false,
    )

    const newRemaining2 = cards.filter(c => !progressMap.has(c.id)).length

    set({
      queue,
      currentIndex: 0,
      progressMap,
      sessionActive: true,
      practiceAll: opts?.includeAll ?? false,
      sessionStats: { ...emptyStats },
      answerHistory: [],
      wrongCount: 0,
      newRemaining: Math.min(newRemaining2, opts?.newLimit ?? 20),
    })
  },

  answerCard: (cardId, correct, userId, hintsRevealed = 0, timeMs = 0) => {
    const { progressMap, answerHistory } = get()
    const existing = progressMap.get(cardId) ?? null
    const deckId = useDecksStore.getState().currentDeck?.id ?? ''
    const progress = existing ?? createNewProgress(userId, cardId, deckId)
    const updated = processReview(progress, correct)

    // Update hint tracking
    updated.last_hints_used = hintsRevealed
    if (updated.total_reviews === 1) {
      updated.avg_hints_needed = hintsRevealed
    } else {
      updated.avg_hints_needed =
        Math.round(
          ((updated.avg_hints_needed * (updated.total_reviews - 1) + hintsRevealed) /
            updated.total_reviews) * 100
        ) / 100
    }

    const newMap = new Map(progressMap)
    newMap.set(cardId, updated)

    // Save to undo history
    const newHistory = [...answerHistory, { cardId, correct, hintsRevealed, timeMs, prevProgress: existing }]

    set(state => {
      const updatedQueue = !correct
        ? [...state.queue, cardId]
        : state.queue

      return {
        queue: updatedQueue,
        progressMap: newMap,
        answerHistory: newHistory,
        wrongCount: state.wrongCount + (correct ? 0 : 1),
        newRemaining: state.newRemaining - (!existing && correct ? 1 : 0),
        sessionStats: {
          ...state.sessionStats,
          cardsReviewed: state.sessionStats.cardsReviewed + 1,
          cardsCorrect: state.sessionStats.cardsCorrect + (correct ? 1 : 0),
          newCardsSeen: state.sessionStats.newCardsSeen + (!existing ? 1 : 0),
        },
      }
    })

    // ── Save progress locally (instant, persistent) ──
    useLocalDeckStore.getState().saveProgress(deckId, cardId, updated)

    // ── Background sync to Supabase (non-blocking, best-effort) ──
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
      avg_hints_needed: updated.avg_hints_needed,
      last_hints_used: updated.last_hints_used,
    }, { onConflict: 'user_id,card_id' }).then(() => {}, () => {})

    // Log review event (background)
    supabase.from('review_events').insert({
      user_id: userId,
      card_id: cardId,
      deck_id: deckId,
      hints_revealed: hintsRevealed,
      grade: correct ? 'got_it' : 'again',
      time_to_grade_ms: timeMs,
    }).then(() => {}, () => {})
  },

  undoLastAnswer: (userId: string) => {
    const { answerHistory, progressMap, queue, currentIndex } = get()
    if (answerHistory.length === 0 || currentIndex === 0) return

    const last = answerHistory[answerHistory.length - 1]
    const newMap = new Map(progressMap)
    const deckId = useDecksStore.getState().currentDeck?.id ?? ''

    // Restore previous progress (or remove if card was new)
    if (last.prevProgress) {
      newMap.set(last.cardId, last.prevProgress)
      // Restore locally
      useLocalDeckStore.getState().saveProgress(deckId, last.cardId, last.prevProgress)
    } else {
      newMap.delete(last.cardId)
    }

    // If wrong answer added card to end of queue, remove that addition
    let newQueue = [...queue]
    if (!last.correct) {
      const lastIdx = newQueue.lastIndexOf(last.cardId)
      if (lastIdx > currentIndex - 1) {
        newQueue.splice(lastIdx, 1)
      }
    }

    // Revert progress in Supabase (background)
    if (last.prevProgress) {
      supabase.from('card_progress').upsert({
        user_id: last.prevProgress.user_id,
        card_id: last.prevProgress.card_id,
        deck_id: last.prevProgress.deck_id,
        interval_days: last.prevProgress.interval_days,
        next_review_at: last.prevProgress.next_review_at,
        consecutive_correct: last.prevProgress.consecutive_correct,
        total_reviews: last.prevProgress.total_reviews,
        total_correct: last.prevProgress.total_correct,
        status: last.prevProgress.status,
        last_reviewed_at: last.prevProgress.last_reviewed_at,
      }, { onConflict: 'user_id,card_id' }).then(() => {}, () => {})
    }

    set(state => ({
      queue: newQueue,
      currentIndex: state.currentIndex - 1,
      progressMap: newMap,
      answerHistory: answerHistory.slice(0, -1),
      wrongCount: state.wrongCount - (last.correct ? 0 : 1),
      newRemaining: state.newRemaining + (!last.prevProgress && last.correct ? 1 : 0),
      sessionStats: {
        ...state.sessionStats,
        cardsReviewed: Math.max(0, state.sessionStats.cardsReviewed - 1),
        cardsCorrect: state.sessionStats.cardsCorrect - (last.correct ? 1 : 0),
        newCardsSeen: state.sessionStats.newCardsSeen - (!last.prevProgress ? 1 : 0),
      },
    }))
  },

  nextCard: () => {
    set(state => ({ currentIndex: Math.min(state.currentIndex + 1, state.queue.length) }))
  },

  endSession: () => {
    // Sync all progress to server on session end
    const deckId = useDecksStore.getState().currentDeck?.id
    const userId = get().progressMap.values().next()?.value?.user_id
    if (deckId && userId) {
      useLocalDeckStore.getState().syncProgressToServer(deckId, userId)
    }

    set({
      sessionActive: false,
      queue: [],
      currentIndex: 0,
      practiceAll: false,
      sessionStats: { ...emptyStats },
      answerHistory: [],
      wrongCount: 0,
      newRemaining: 0,
    })
  },

  setPracticeAll: (value) => set({ practiceAll: value }),
}))
