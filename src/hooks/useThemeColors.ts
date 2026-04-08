import { useThemeStore } from '@src/stores/useThemeStore'

/**
 * Single source of truth for all screen-level colors.
 * Values match the Zinc scale defined in gluestack-ui-provider/config.ts.
 */
export function useThemeColors() {
  const dark = useThemeStore(s => s.resolvedTheme) === 'dark'
  return {
    dark,
    bg: dark ? '#09090B' : '#FFFFFF',
    surface: dark ? '#18181B' : '#F4F4F5',
    surfaceRaised: dark ? '#27272A' : '#FFFFFF',
    border: dark ? '#27272A' : '#E4E4E7',
    borderSubtle: dark ? '#1E1E21' : '#F4F4F5',
    borderFocus: dark ? '#52525B' : '#A1A1AA',
    text: dark ? '#FAFAFA' : '#09090B',
    textSecondary: dark ? '#A1A1AA' : '#71717A',
    textMuted: dark ? '#71717A' : '#A1A1AA',
    placeholder: dark ? '#3F3F46' : '#A1A1AA',
    accent: dark ? '#FAFAFA' : '#18181B',
    accentText: dark ? '#18181B' : '#FAFAFA',
    iconBg: dark ? '#27272A' : '#F4F4F5',
    avatarBg: dark ? '#27272A' : '#E4E4E7',
    avatarText: dark ? '#A1A1AA' : '#52525B',
    activeBtn: dark ? '#3F3F46' : '#18181B',
    activeBtnText: '#FAFAFA',
    success: '#22C55E',
    error: '#EF4444',
    streak: dark ? '#F59E0B' : '#D97706',
    progressBg: dark ? '#27272A' : '#E4E4E7',
    progressFill: dark ? '#FAFAFA' : '#18181B',
  } as const
}

export type ThemeColors = ReturnType<typeof useThemeColors>
