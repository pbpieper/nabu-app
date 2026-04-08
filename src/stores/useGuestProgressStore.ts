import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CardProgress } from '@src/types'

interface DeckProgressMap {
  [cardId: string]: CardProgress
}

interface GuestProgressState {
  /** Nested map: deckCode -> cardId -> CardProgress */
  progress: { [deckCode: string]: DeckProgressMap }
  getProgress: (deckCode: string, cardId: string) => CardProgress | null
  setProgress: (deckCode: string, cardId: string, cardProgress: CardProgress) => void
  loadDeckProgress: (deckCode: string) => DeckProgressMap
}

export const useGuestProgressStore = create<GuestProgressState>()(
  persist(
    (set, get) => ({
      progress: {},

      getProgress: (deckCode, cardId) => {
        return get().progress[deckCode]?.[cardId] ?? null
      },

      setProgress: (deckCode, cardId, cardProgress) => {
        set(state => ({
          progress: {
            ...state.progress,
            [deckCode]: {
              ...state.progress[deckCode],
              [cardId]: cardProgress,
            },
          },
        }))
      },

      loadDeckProgress: (deckCode) => {
        return get().progress[deckCode] ?? {}
      },
    }),
    {
      name: 'nabu-guest-progress',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
