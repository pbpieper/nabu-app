/**
 * Local-first deck storage.
 *
 * Download-once: user enters a share code → deck + cards fetched from Supabase
 * once → stored in AsyncStorage → all subsequent reads are instant and offline.
 *
 * Versioning: each stored deck keeps the server's `updated_at`. A lightweight
 * check can compare it to detect teacher edits. Student chooses when to update.
 *
 * Smart merge: when updating, cards are matched by sort_order. Progress for
 * matched cards is preserved. New cards start fresh.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@src/services/supabase/client'
import { prefetchCardImages } from '@src/lib/imageCache'
import type { Deck, Card, CardProgress } from '@src/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalDeck {
  deck: Deck
  cards: Card[]
  /** ISO timestamp — matches deck.updated_at at time of download */
  downloadedAt: string
  /** Server's updated_at at time of download — used for freshness check */
  serverVersion: string
}

export interface LocalProgress {
  [cardId: string]: CardProgress
}

interface LocalDeckState {
  /** All downloaded decks, keyed by deck id */
  decks: Record<string, LocalDeck>
  /** All progress, keyed by deck id → card id */
  progress: Record<string, LocalProgress>
  /** Deck ids that have a newer server version available */
  updatesAvailable: Record<string, string> // deckId → server updated_at

  // ── Actions ──

  /** Download a deck by share code. Returns the deck or null. */
  downloadDeck: (code: string) => Promise<Deck | null>
  /** Get a locally stored deck by id */
  getLocalDeck: (deckId: string) => LocalDeck | null
  /** Get all locally stored decks, sorted by most recently downloaded */
  getAllLocalDecks: () => LocalDeck[]
  /** Get cards for a locally stored deck */
  getLocalCards: (deckId: string) => Card[]
  /** Get progress map for a deck */
  getLocalProgress: (deckId: string) => Map<string, CardProgress>
  /** Save/update a single card's progress */
  saveProgress: (deckId: string, cardId: string, progress: CardProgress) => void
  /** Batch save progress (e.g. after session) */
  saveProgressBatch: (deckId: string, progressMap: Map<string, CardProgress>) => void
  /** Check if any downloaded decks have server-side updates */
  checkForUpdates: () => Promise<void>
  /** Update a single deck to latest server version, preserving progress */
  updateDeck: (deckId: string) => Promise<boolean>
  /** Remove a deck from local storage */
  removeDeck: (deckId: string) => void
  /** Sync progress to Supabase (background, non-blocking) */
  syncProgressToServer: (deckId: string, userId: string) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLocalDeckStore = create<LocalDeckState>()(
  persist(
    (set, get) => ({
      decks: {},
      progress: {},
      updatesAvailable: {},

      downloadDeck: async (code: string) => {
        const upperCode = code.toUpperCase()

        // Fetch deck + cards in one go
        const { data: deckData } = await supabase
          .from('decks')
          .select('*')
          .eq('share_code', upperCode)
          .single()

        if (!deckData) return null

        const { data: cardsData } = await supabase
          .from('cards')
          .select('*')
          .eq('deck_id', deckData.id)
          .order('sort_order', { ascending: true })

        const cards = (cardsData ?? []) as Card[]
        const deck = deckData as Deck

        // Prefetch images into browser/native cache (non-blocking)
        prefetchCardImages(cards)

        const localDeck: LocalDeck = {
          deck,
          cards,
          downloadedAt: new Date().toISOString(),
          serverVersion: deck.updated_at,
        }

        set(state => ({
          decks: { ...state.decks, [deck.id]: localDeck },
          // Initialize empty progress if none exists yet
          progress: {
            ...state.progress,
            [deck.id]: state.progress[deck.id] ?? {},
          },
          // Clear any update flag
          updatesAvailable: (() => {
            const u = { ...state.updatesAvailable }
            delete u[deck.id]
            return u
          })(),
        }))

        return deck
      },

      getLocalDeck: (deckId: string) => {
        return get().decks[deckId] ?? null
      },

      getAllLocalDecks: () => {
        const decks = get().decks
        return Object.values(decks).sort(
          (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
        )
      },

      getLocalCards: (deckId: string) => {
        return get().decks[deckId]?.cards ?? []
      },

      getLocalProgress: (deckId: string) => {
        const prog = get().progress[deckId] ?? {}
        return new Map(Object.entries(prog))
      },

      saveProgress: (deckId, cardId, cardProgress) => {
        set(state => ({
          progress: {
            ...state.progress,
            [deckId]: {
              ...state.progress[deckId],
              [cardId]: cardProgress,
            },
          },
        }))
      },

      saveProgressBatch: (deckId, progressMap) => {
        const batch: LocalProgress = {}
        for (const [cardId, p] of progressMap) {
          batch[cardId] = p
        }
        set(state => ({
          progress: {
            ...state.progress,
            [deckId]: {
              ...state.progress[deckId],
              ...batch,
            },
          },
        }))
      },

      checkForUpdates: async () => {
        const localDecks = get().decks
        const deckIds = Object.keys(localDecks)
        if (deckIds.length === 0) return

        try {
          const { data } = await supabase
            .from('decks')
            .select('id, updated_at')
            .in('id', deckIds)

          if (!data) return

          const updates: Record<string, string> = {}
          for (const row of data) {
            const local = localDecks[row.id]
            if (local && row.updated_at > local.serverVersion) {
              updates[row.id] = row.updated_at
            }
          }

          set({ updatesAvailable: updates })
        } catch {
          // Offline — skip
        }
      },

      updateDeck: async (deckId: string) => {
        const existing = get().decks[deckId]
        if (!existing) return false

        // Fetch latest cards
        const [deckRes, cardsRes] = await Promise.all([
          supabase.from('decks').select('*').eq('id', deckId).single(),
          supabase.from('cards').select('*').eq('deck_id', deckId).order('sort_order', { ascending: true }),
        ])

        if (!deckRes.data) return false

        const newDeck = deckRes.data as Deck
        const newCards = (cardsRes.data ?? []) as Card[]
        const oldCards = existing.cards

        // Smart merge: match cards by sort_order, remap progress
        const oldProgress = get().progress[deckId] ?? {}
        const mergedProgress: LocalProgress = {}

        // Build lookup: old sort_order → old card id
        const oldByOrder = new Map<number, string>()
        for (const c of oldCards) {
          oldByOrder.set(c.sort_order, c.id)
        }

        for (const newCard of newCards) {
          const oldCardId = oldByOrder.get(newCard.sort_order)
          if (oldCardId && oldProgress[oldCardId]) {
            // Card existed at same position — carry progress to new card id
            const prog = { ...oldProgress[oldCardId] }
            prog.card_id = newCard.id
            mergedProgress[newCard.id] = prog
          }
          // If no match by position, card is new — starts fresh
        }

        const localDeck: LocalDeck = {
          deck: newDeck,
          cards: newCards,
          downloadedAt: new Date().toISOString(),
          serverVersion: newDeck.updated_at,
        }

        set(state => ({
          decks: { ...state.decks, [deckId]: localDeck },
          progress: { ...state.progress, [deckId]: mergedProgress },
          updatesAvailable: (() => {
            const u = { ...state.updatesAvailable }
            delete u[deckId]
            return u
          })(),
        }))

        return true
      },

      removeDeck: (deckId: string) => {
        set(state => {
          const decks = { ...state.decks }
          const progress = { ...state.progress }
          const updates = { ...state.updatesAvailable }
          delete decks[deckId]
          delete progress[deckId]
          delete updates[deckId]
          return { decks, progress, updatesAvailable: updates }
        })
      },

      syncProgressToServer: (deckId: string, userId: string) => {
        const progress = get().progress[deckId]
        if (!progress) return

        const records = Object.values(progress).map(p => ({
          user_id: userId,
          card_id: p.card_id,
          deck_id: p.deck_id,
          interval_days: p.interval_days,
          next_review_at: p.next_review_at,
          consecutive_correct: p.consecutive_correct,
          total_reviews: p.total_reviews,
          total_correct: p.total_correct,
          status: p.status,
          last_reviewed_at: p.last_reviewed_at,
          avg_hints_needed: p.avg_hints_needed,
          last_hints_used: p.last_hints_used,
        }))

        if (records.length === 0) return

        // Fire-and-forget batch upsert
        supabase
          .from('card_progress')
          .upsert(records, { onConflict: 'user_id,card_id' })
          .then(() => {}, () => {})
      },
    }),
    {
      name: 'nabu-local-decks',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist decks, progress, and updatesAvailable
      partialize: (state) => ({
        decks: state.decks,
        progress: state.progress,
        updatesAvailable: state.updatesAvailable,
      }),
    },
  ),
)
