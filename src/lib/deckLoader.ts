/**
 * Reusable deck loader — fetches deck + cards + card_content by share code.
 *
 * Used by both guest and authenticated flows. Performs a single Supabase call
 * for deck, then a parallel call for cards + card_content (with graceful
 * fallback if card_content table doesn't exist yet — depends on migration 005).
 *
 * Target: first paint under 2 seconds.
 */
import { supabase } from '@src/services/supabase/client'
import type { Deck, Card } from '@src/types'

export interface CardContentRow {
  id: string
  card_id: string
  content_type: string
  text_value: string | null
  media_url: string | null
  language: string | null
  sort_order: number
  difficulty_tier: number | null
  metadata: Record<string, unknown> | null
  is_primary: boolean
}

export interface DeckLoadResult {
  deck: Deck
  cards: Card[]
  cardContent: CardContentRow[]
}

/**
 * Fetch a public deck by share_code, including its cards (ordered by sort_order)
 * and card_content (left-joined, with graceful fallback).
 */
export async function loadDeckByShareCode(
  shareCode: string,
): Promise<{ data: DeckLoadResult | null; error: string | null }> {
  const code = shareCode.toUpperCase()

  // Step 1: Fetch deck
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('*')
    .eq('share_code', code)
    .single()

  if (deckErr || !deck) {
    return { data: null, error: 'Deck not found. Check your code and try again.' }
  }

  // Step 2: Fetch cards (ordered by sort_order)
  const { data: cardsData, error: cardsErr } = await supabase
    .from('cards')
    .select('*')
    .eq('deck_id', deck.id)
    .order('sort_order', { ascending: true })

  if (cardsErr) {
    return { data: null, error: 'Failed to load cards. Please try again.' }
  }

  const cards = (cardsData ?? []) as Card[]

  // Fetch card_content for all card IDs (graceful fallback if table doesn't exist)
  let cardContent: CardContentRow[] = []
  if (cards.length > 0) {
    try {
      const cardIds = cards.map(c => c.id)
      const { data: contentData } = await supabase
        .from('card_content')
        .select('*')
        .in('card_id', cardIds)
        .order('sort_order', { ascending: true })

      cardContent = (contentData ?? []) as CardContentRow[]
    } catch {
      // card_content table doesn't exist yet — this is expected before migration 005
      cardContent = []
    }
  }

  return {
    data: {
      deck: deck as Deck,
      cards,
      cardContent,
    },
    error: null,
  }
}

/**
 * Fetch a public deck by its ID, including cards and card_content.
 * Useful for the authenticated flow when deck ID is already known.
 */
export async function loadDeckById(
  deckId: string,
): Promise<{ data: DeckLoadResult | null; error: string | null }> {
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single()

  if (deckErr || !deck) {
    return { data: null, error: 'Deck not found.' }
  }

  const { data: cardsData } = await supabase
    .from('cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('sort_order', { ascending: true })

  const cards = (cardsData ?? []) as Card[]

  let cardContent: CardContentRow[] = []
  if (cards.length > 0) {
    try {
      const cardIds = cards.map(c => c.id)
      const { data: contentData } = await supabase
        .from('card_content')
        .select('*')
        .in('card_id', cardIds)
        .order('sort_order', { ascending: true })

      cardContent = (contentData ?? []) as CardContentRow[]
    } catch {
      cardContent = []
    }
  }

  return {
    data: {
      deck: deck as Deck,
      cards,
      cardContent,
    },
    error: null,
  }
}
