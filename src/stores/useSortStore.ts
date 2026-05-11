import { create } from 'zustand'
import { supabase } from '@src/services/supabase/client'
import {
  extractFromText,
  diffAgainstKnown,
  type ExtractedTerm,
  type Lang,
} from '@src/lib/lexa'
import { useDecksStore, type NewCard } from './useDecksStore'

interface SortDraft {
  articleId: string
  articleSortId: string
  lang: Lang
  title: string | null
  textPreview: string
  alreadySeenCount: number
  unsortedQueue: ExtractedTerm[]
  knownTerms: ExtractedTerm[]
  unknownTerms: ExtractedTerm[]
  /** Ordered history of marks, so undoLast can pop the most-recent regardless of bucket. */
  history: ('known' | 'unknown')[]
}

interface SortState {
  draft: SortDraft | null
  loading: boolean
  startSort: (
    text: string,
    lang: Lang,
    title: string | null,
    userId: string,
  ) => Promise<void>
  markCurrent: (status: 'known' | 'unknown') => void
  undoLast: () => void
  finishAndPersist: (
    userId: string,
  ) => Promise<{ articleSortId: string; known: number; unknown: number }>
  createDeckFromUnknown: (
    userId: string,
    deckTitle: string,
    sourceLang: string,
  ) => Promise<{ deckId: string }>
  clear: () => void
}

const UPSERT_BATCH_SIZE = 100

export const useSortStore = create<SortState>((set, get) => ({
  draft: null,
  loading: false,

  startSort: async (text, lang, title, userId) => {
    set({ loading: true })
    try {
      // (a) Run pure extraction.
      const extracted = await extractFromText(text, lang)

      // (b) Upsert article. Note: supabase-js's upsert can't express COALESCE
      // for `title`, so if the user re-pastes the same text (same hash) with a
      // different title, the title gets overwritten. Tiny acceptable deviation
      // from G-I.4. token_count / unique_count are deterministic from the
      // content (same hash → identical values), so overwriting is a no-op.
      const { error: articleErr } = await supabase
        .from('articles')
        .upsert(
          {
            id: extracted.articleHash,
            user_id: userId,
            lang,
            title: title ?? null,
            text,
            token_count: extracted.totalTokens,
            unique_count: extracted.uniqueTerms.length,
          },
          { onConflict: 'id', ignoreDuplicates: false },
        )
      if (articleErr) throw new Error(articleErr.message)

      // (c) Fetch all existing unique_terms for this user+lang (known +
      // unknown both count as "seen").
      const { data: existing, error: existingErr } = await supabase
        .from('unique_terms')
        .select('term')
        .eq('user_id', userId)
        .eq('lang', lang)
      if (existingErr) throw new Error(existingErr.message)
      const seenSet = new Set(
        (existing ?? []).map((r: { term: string }) => r.term),
      )

      // (d) Diff extracted terms against the seen set.
      const { unsorted, alreadyKnown } = diffAgainstKnown(
        extracted.uniqueTerms,
        seenSet,
      )

      // (e) Open an article_sorts row (completed_at NULL until finish).
      const { data: sortRow, error: sortErr } = await supabase
        .from('article_sorts')
        .insert({
          user_id: userId,
          article_id: extracted.articleHash,
          known_count: 0,
          unknown_count: 0,
        })
        .select('id')
        .single()
      if (sortErr) throw new Error(sortErr.message)
      if (!sortRow) throw new Error('Failed to create article_sorts row')

      // (f) Seed the draft.
      set({
        draft: {
          articleId: extracted.articleHash,
          articleSortId: sortRow.id as string,
          lang,
          title,
          textPreview: text.slice(0, 60),
          alreadySeenCount: alreadyKnown.length,
          unsortedQueue: unsorted,
          knownTerms: [],
          unknownTerms: [],
          history: [],
        },
        loading: false,
      })
    } catch (err) {
      console.error('[useSortStore] startSort failed:', err)
      set({ loading: false, draft: null })
      throw err
    }
  },

  // G-I.2: local-only. If the user closes the tab mid-swipe, in-progress
  // marks are lost. Acceptable for Tier 0.
  markCurrent: (status) => {
    set((s) => {
      if (!s.draft || s.draft.unsortedQueue.length === 0) return s
      const [head, ...rest] = s.draft.unsortedQueue
      const updated: SortDraft = {
        ...s.draft,
        unsortedQueue: rest,
        knownTerms:
          status === 'known' ? [...s.draft.knownTerms, head] : s.draft.knownTerms,
        unknownTerms:
          status === 'unknown'
            ? [...s.draft.unknownTerms, head]
            : s.draft.unknownTerms,
        history: [...s.draft.history, status],
      }
      return { draft: updated }
    })
  },

  undoLast: () => {
    set((s) => {
      if (!s.draft) return s
      const { history } = s.draft
      if (history.length === 0) return s
      const last = history[history.length - 1]
      const newHistory = history.slice(0, -1)
      if (last === 'known') {
        const term = s.draft.knownTerms[s.draft.knownTerms.length - 1]
        if (!term) return s
        return {
          draft: {
            ...s.draft,
            knownTerms: s.draft.knownTerms.slice(0, -1),
            unsortedQueue: [term, ...s.draft.unsortedQueue],
            history: newHistory,
          },
        }
      } else {
        const term = s.draft.unknownTerms[s.draft.unknownTerms.length - 1]
        if (!term) return s
        return {
          draft: {
            ...s.draft,
            unknownTerms: s.draft.unknownTerms.slice(0, -1),
            unsortedQueue: [term, ...s.draft.unsortedQueue],
            history: newHistory,
          },
        }
      }
    })
  },

  finishAndPersist: async (_userId) => {
    const { draft } = get()
    if (!draft) throw new Error('finishAndPersist called with no draft')

    try {
      // (a) Build payload rows. The RPC inserts as auth.uid() server-side, so
      // we don't include user_id in the JSONB items.
      type UpsertRow = {
        term: string
        lang: Lang
        status: 'known' | 'unknown'
        first_seen_article_id: string | null
        first_seen_sentence: string | null
        frequency_delta: number
        known_delta: number
        unknown_delta: number
      }
      const buildRows = (
        terms: ExtractedTerm[],
        status: 'known' | 'unknown',
      ): UpsertRow[] =>
        terms.map((t) => ({
          term: t.term,
          lang: draft.lang,
          status,
          first_seen_article_id: draft.articleId,
          first_seen_sentence: t.firstSeenSentence || null,
          frequency_delta: t.frequency,
          known_delta: status === 'known' ? 1 : 0,
          unknown_delta: status === 'unknown' ? 1 : 0,
        }))

      const allRows: UpsertRow[] = [
        ...buildRows(draft.knownTerms, 'known'),
        ...buildRows(draft.unknownTerms, 'unknown'),
      ]

      // (b) Batch the RPC calls. If any batch errors, throw immediately —
      // partial retry would risk double-counting incremental columns.
      for (let i = 0; i < allRows.length; i += UPSERT_BATCH_SIZE) {
        const batch = allRows.slice(i, i + UPSERT_BATCH_SIZE)
        const { error } = await supabase.rpc('lexa_upsert_terms', {
          p_payload: batch,
        })
        if (error) throw new Error(error.message)
      }

      // (c) Close out the article_sorts row.
      const { error: updateErr } = await supabase
        .from('article_sorts')
        .update({
          completed_at: new Date().toISOString(),
          known_count: draft.knownTerms.length,
          unknown_count: draft.unknownTerms.length,
        })
        .eq('id', draft.articleSortId)
      if (updateErr) throw new Error(updateErr.message)

      // (e) Don't clear — the summary screen reads draft.
      return {
        articleSortId: draft.articleSortId,
        known: draft.knownTerms.length,
        unknown: draft.unknownTerms.length,
      }
    } catch (err) {
      // (d) Leave draft intact so the UI can retry.
      console.error('[useSortStore] finishAndPersist failed:', err)
      throw err
    }
  },

  createDeckFromUnknown: async (userId, deckTitle, sourceLang) => {
    const { draft } = get()
    if (!draft) throw new Error('createDeckFromUnknown called with no draft')

    const deck = await useDecksStore
      .getState()
      .createDeck(deckTitle, '', sourceLang, draft.lang, userId)

    const cards: NewCard[] = draft.unknownTerms.map((t, i) => ({
      word: t.term,
      translation: '',
      sort_order: i,
      example_sentence: t.firstSeenSentence || undefined,
    }))

    await useDecksStore.getState().addCards(deck.id, cards)

    // G-I.5: createDeck already pushed to the local `decks` array — no need
    // to call loadDecks() here.
    return { deckId: deck.id }
  },

  clear: () => set({ draft: null, loading: false }),
}))
