import { create } from 'zustand'
import { supabase } from '@src/services/supabase/client'
import { generateShareCode } from '@src/lib/utils'
import type { Deck, Card } from '@src/types'

export interface DeckStats {
  new: number
  learning: number
  review: number
  mastered: number
}

/** Shape for bulk-inserting new cards (id/deck_id/created_at auto-generated). */
export interface NewCard {
  word: string
  translation: string
  sort_order: number
  example_sentence?: string
  explanation?: string
  part_of_speech?: string
  notes?: string
  image_url?: string
  clue_image_url?: string
  audio_url?: string
  grammar_tag?: string
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
  createDeck: (
    title: string,
    description: string,
    sourceLang: string,
    targetLang: string,
    creatorId: string,
  ) => Promise<Deck>
  addCards: (deckId: string, cards: NewCard[]) => Promise<Card[]>
  deleteCard: (cardId: string, deckId: string) => Promise<void>
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

  createDeck: async (title, description, sourceLang, targetLang, creatorId) => {
    // Try up to 3 times in case of share_code collision
    for (let attempt = 0; attempt < 3; attempt++) {
      const shareCode = generateShareCode()
      const { data, error } = await supabase
        .from('decks')
        .insert({
          title,
          description: description || null,
          source_language: sourceLang,
          target_language: targetLang,
          share_code: shareCode,
          creator_id: creatorId,
          is_public: false,
          card_count: 0,
        })
        .select()
        .single()

      if (error) {
        // unique_violation on share_code → retry
        if (error.code === '23505' && attempt < 2) continue
        throw new Error(error.message)
      }
      if (!data) throw new Error('No data returned from deck insert')

      // Add to local state
      set(s => ({ decks: [data, ...s.decks], currentDeck: data, currentCards: [] }))
      return data as Deck
    }
    throw new Error('Failed to generate unique share code')
  },

  addCards: async (deckId, cards) => {
    if (cards.length === 0) return []

    const rows = cards.map(c => ({
      deck_id: deckId,
      word: c.word,
      translation: c.translation,
      sort_order: c.sort_order,
      example_sentence: c.example_sentence ?? null,
      explanation: c.explanation ?? null,
      part_of_speech: c.part_of_speech ?? null,
      notes: c.notes ?? null,
      image_url: c.image_url ?? null,
      clue_image_url: c.clue_image_url ?? null,
      audio_url: c.audio_url ?? null,
      grammar_tag: c.grammar_tag ?? null,
    }))

    const { data, error } = await supabase
      .from('cards')
      .insert(rows)
      .select()

    if (error) throw new Error(error.message)
    const inserted = (data ?? []) as Card[]

    // Update card_count on the deck
    await supabase
      .from('decks')
      .update({ card_count: (get().currentCards.length) + inserted.length })
      .eq('id', deckId)

    set(s => ({
      currentCards: [...s.currentCards, ...inserted],
      currentDeck: s.currentDeck?.id === deckId
        ? { ...s.currentDeck, card_count: s.currentCards.length + inserted.length }
        : s.currentDeck,
      decks: s.decks.map(d =>
        d.id === deckId ? { ...d, card_count: s.currentCards.length + inserted.length } : d,
      ),
    }))

    return inserted
  },

  deleteCard: async (cardId, deckId) => {
    const { error } = await supabase
      .from('cards')
      .delete()
      .eq('id', cardId)

    if (error) throw new Error(error.message)

    const newCards = get().currentCards.filter(c => c.id !== cardId)
    const newCount = newCards.length

    await supabase
      .from('decks')
      .update({ card_count: newCount })
      .eq('id', deckId)

    set(s => ({
      currentCards: newCards,
      currentDeck: s.currentDeck?.id === deckId
        ? { ...s.currentDeck, card_count: newCount }
        : s.currentDeck,
      decks: s.decks.map(d =>
        d.id === deckId ? { ...d, card_count: newCount } : d,
      ),
    }))
  },
}))
