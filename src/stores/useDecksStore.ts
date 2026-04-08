import { create } from 'zustand'
import { supabase } from '@src/services/supabase/client'
import type { Deck, Card } from '@src/types'

export interface DeckStats {
  new: number
  learning: number
  review: number
  mastered: number
}

interface DecksState {
  decks: Deck[]
  currentDeck: Deck | null
  currentCards: Card[]
  deckStats: DeckStats | null
  loading: boolean
  studyRequestId: number
  loadDecks: () => Promise<void>
  loadDeckByCode: (code: string) => Promise<Deck | null>
  loadCards: (deckId: string) => Promise<void>
  loadDeckWithCards: (deckId: string, userId: string) => Promise<void>
  setCurrentDeck: (deck: Deck) => void
  getDeckById: (id: string) => Deck | undefined
}

export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  currentDeck: null,
  currentCards: [],
  deckStats: null,
  loading: false,
  studyRequestId: 0,

  loadDecks: async () => {
    set({ loading: true })
    try {
      const { data } = await supabase
        .from('decks')
        .select('*')
        .order('created_at', { ascending: false })
      set({ decks: data ?? [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  loadDeckByCode: async (code: string) => {
    const { data } = await supabase
      .from('decks')
      .select('*')
      .eq('share_code', code.toUpperCase())
      .single()
    if (data) {
      set(s => ({ currentDeck: data, currentCards: [], studyRequestId: s.studyRequestId + 1 }))
      get().loadDecks()
      return data
    }
    return null
  },

  loadCards: async (deckId: string) => {
    const { data } = await supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('sort_order', { ascending: true })
    set({ currentCards: data ?? [] })
  },

  loadDeckWithCards: async (deckId: string, userId: string) => {
    set({ loading: true, deckStats: null })
    try {
      const [decksRes, cardsRes, progressRes] = await Promise.all([
        supabase.from('decks').select('*').eq('id', deckId).single(),
        supabase.from('cards').select('*').eq('deck_id', deckId).order('sort_order', { ascending: true }),
        supabase.from('card_progress').select('status').eq('deck_id', deckId).eq('user_id', userId),
      ])

      const deck = decksRes.data
      const cards = cardsRes.data ?? []
      const progressRows = progressRes.data ?? []

      const stats: DeckStats = { new: 0, learning: 0, review: 0, mastered: 0 }
      for (const row of progressRows) {
        const s = (row as { status: keyof DeckStats }).status
        if (s in stats) stats[s]++
      }
      const tracked = progressRows.filter((r: { status: string }) => r.status !== 'new').length
      stats.new = cards.length - tracked

      if (deck) {
        set({ currentDeck: deck, currentCards: cards, deckStats: stats, loading: false })
      } else {
        set({ currentCards: cards, deckStats: stats, loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  setCurrentDeck: (deck) => set(s => ({
    currentDeck: deck,
    currentCards: s.currentDeck?.id === deck.id ? s.currentCards : [],
    deckStats: s.currentDeck?.id === deck.id ? s.deckStats : null,
    studyRequestId: s.studyRequestId + 1,
  })),

  getDeckById: (id: string) => get().decks.find(d => d.id === id),
}))
