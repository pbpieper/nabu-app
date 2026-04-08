import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface StudyPreferencesState {
  newCardsPerSession: number
  setNewCardsPerSession: (n: number) => void
}

export const useStudyPreferencesStore = create<StudyPreferencesState>()(
  persist(
    (set) => ({
      newCardsPerSession: 20,
      setNewCardsPerSession: (n) => set({ newCardsPerSession: n }),
    }),
    {
      name: 'nabu-study-prefs',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
