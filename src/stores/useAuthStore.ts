import { create } from 'zustand'
import { supabase } from '@src/services/supabase/client'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@src/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  initialized: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name?: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (updates: { display_name?: string }) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, initialized: true })
    if (session) {
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
      if (data) set({ profile: data })
    }
    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session })
      if (session) {
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        if (data) set({ profile: data })
      } else {
        set({ profile: null })
      }
    })
  },

  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } finally {
      set({ loading: false })
    }
  },

  signUp: async (email, password, name) => {
    set({ loading: true })
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: name ?? 'Student' } },
      })
      if (error) throw error
    } finally {
      set({ loading: false })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },

  updateProfile: async (updates) => {
    const userId = get().session?.user?.id
    if (!userId) throw new Error('Not authenticated')
    set({ loading: true })
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
      if (error) throw error
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (data) set({ profile: data })
    } finally {
      set({ loading: false })
    }
  },
}))
