import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  resolvedTheme: 'light' | 'dark'
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  return mode
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      resolvedTheme: resolveTheme('system'),
      setMode: (mode) => set({ mode, resolvedTheme: resolveTheme(mode) }),
    }),
    {
      name: 'nabu-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) state.resolvedTheme = resolveTheme(state.mode)
      },
    }
  )
)
