export const colors = {
  green: {
    dark: '#1B4332',
    main: '#2D6A4F',
    mid: '#40916C',
    light: '#52B788',
    bright: '#74C69D',
    faded: '#95D5B2',
    pale: '#D8F3DC',
  },
  pink: {
    main: '#E91E8C',
    light: '#FF6EB4',
    mid: '#C2185B',
    dark: '#880E4F',
    faded: '#F8BBD0',
  },
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  correct: '#059669',
  incorrect: '#EF4444',
} as const

export const lightTheme = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
} as const

export const darkTheme = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#334155',
  border: '#475569',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
} as const

export function getTheme(dark: boolean) {
  return dark ? darkTheme : lightTheme
}
